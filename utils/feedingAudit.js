const dateUtil = require('./date.js')

const DEFAULT_REMINDER_MINUTES = 240
const POSSIBLE_DUPLICATE_MINUTES = 60
const MIN_RECOMMENDED_REMINDER_MINUTES = 180
const MAX_RECOMMENDED_REMINDER_MINUTES = 300
// 夜间允许 3 到 14 小时：宝宝整夜不吃时，夜间参考值应反映真实的通宵间隔
const MIN_NIGHT_REMINDER_MINUTES = 180
const MAX_NIGHT_REMINDER_MINUTES = 14 * 60
// 超过上限的间隔视为漏记，不进入样本；夜间上限放宽以容纳通宵睡眠
const MAX_DAY_INTERVAL_MINUTES = 12 * 60
const MAX_NIGHT_INTERVAL_MINUTES = 16 * 60
const MIN_RECOMMENDATION_SAMPLES = 4

function feedingTotal(record) {
  return (Number(record.breastMilk) || 0) + (Number(record.formula) || 0)
}

function feedingRecords(records) {
  return (records || [])
    .filter(record => feedingTotal(record) > 0)
    .sort((a, b) => dateUtil.toBeijingTimestamp(a.date, a.time) - dateUtil.toBeijingTimestamp(b.date, b.time))
}

function minutesBetween(earlier, later) {
  const earlierTs = dateUtil.toBeijingTimestamp(earlier.date, earlier.time)
  const laterTs = dateUtil.toBeijingTimestamp(later.date, later.time)
  if (earlierTs === null || laterTs === null) return null
  return Math.floor((laterTs - earlierTs) / 60000)
}

function nearestFeeding(feedings, record) {
  let nearest = null
  ;(feedings || []).forEach(feeding => {
    if (record._id && feeding._id === record._id) return
    const minutes = minutesBetween(feeding, record)
    if (minutes === null) return
    const distance = Math.abs(minutes)
    if (!nearest || distance < nearest.minutes) nearest = { record: feeding, minutes: distance }
  })
  return nearest
}

function isFeedingOverdue(minutes, reminderMinutes) {
  return Number(minutes) > Number(reminderMinutes || DEFAULT_REMINDER_MINUTES)
}

function isPossibleDuplicate(minutes) {
  if (minutes === null || minutes === undefined || minutes === '') return false
  return Number(minutes) >= 0 && Number(minutes) <= POSSIBLE_DUPLICATE_MINUTES
}

function formatReminderHours(minutes) {
  return `${Number(minutes) / 60} 小时`
}

function getPreviousDayReviewDate(todayDate) {
  return todayDate ? dateUtil.addDays(todayDate, -1) : ''
}

function shouldShowDailyReview(reviewDate, confirmedDate) {
  return !!reviewDate && reviewDate !== confirmedDate
}

function recommendFromIntervals(intervals, minMinutes, maxMinutes) {
  if (intervals.length < MIN_RECOMMENDATION_SAMPLES) {
    return { minutes: DEFAULT_REMINDER_MINUTES, sampleCount: intervals.length, usingDefault: true }
  }
  const sorted = intervals.slice().sort((a, b) => a - b)
  const position = (sorted.length - 1) * 0.75
  const lower = Math.floor(position)
  const upper = Math.ceil(position)
  const percentile = sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower)
  const rounded = Math.round(percentile / 30) * 30
  return {
    minutes: Math.max(minMinutes, Math.min(maxMinutes, rounded)),
    sampleCount: intervals.length,
    usingDefault: false
  }
}

function getFeedingPeriod(record) {
  const hour = Number(String(record && record.time || '').split(':')[0])
  return Number.isFinite(hour) && hour >= 7 && hour < 19 ? 'daytime' : 'nighttime'
}

// 按一段等待时间的中点判断白天/夜间，推荐值统计与首页提醒共用同一口径
function getPeriodForTimestamps(earlierTs, laterTs) {
  const midpoint = new Date((earlierTs + laterTs) / 2)
  const beijingHour = (midpoint.getUTCHours() + 8) % 24
  return beijingHour >= 7 && beijingHour < 19 ? 'daytime' : 'nighttime'
}

function getIntervalPeriod(earlier, later) {
  const earlierTs = dateUtil.toBeijingTimestamp(earlier.date, earlier.time)
  const laterTs = dateUtil.toBeijingTimestamp(later.date, later.time)
  if (earlierTs === null || laterTs === null || laterTs <= earlierTs) return getFeedingPeriod(earlier)
  return getPeriodForTimestamps(earlierTs, laterTs)
}

function collectIntervals(records) {
  const feedings = feedingRecords(records)
  const intervals = []
  for (let index = 1; index < feedings.length; index += 1) {
    const previous = feedings[index - 1]
    const current = feedings[index]
    const minutes = minutesBetween(previous, current)
    if (minutes === null || minutes <= 0) continue
    const period = getIntervalPeriod(previous, current)
    const maxMinutes = period === 'nighttime' ? MAX_NIGHT_INTERVAL_MINUTES : MAX_DAY_INTERVAL_MINUTES
    if (minutes <= maxMinutes) intervals.push({ minutes, period, previous, current })
  }
  return intervals
}

function recommendReminder(records) {
  return recommendFromIntervals(
    collectIntervals(records).map(item => item.minutes),
    MIN_RECOMMENDED_REMINDER_MINUTES,
    MAX_RECOMMENDED_REMINDER_MINUTES
  )
}

function recommendReminderByPeriod(records) {
  const groups = { daytime: [], nighttime: [] }
  collectIntervals(records).forEach(item => groups[item.period].push(item.minutes))
  return {
    daytime: recommendFromIntervals(groups.daytime, MIN_RECOMMENDED_REMINDER_MINUTES, MAX_RECOMMENDED_REMINDER_MINUTES),
    nighttime: recommendFromIntervals(groups.nighttime, MIN_NIGHT_REMINDER_MINUTES, MAX_NIGHT_REMINDER_MINUTES)
  }
}

// 批量补录：每一行和「当天已有记录 + 同批其它行」里最近的一条比对
function batchDuplicateWarnings(existing, incoming) {
  const rows = feedingRecords(incoming)
  const existingFeedings = feedingRecords(existing)
  const warnings = []
  rows.forEach((row, index) => {
    const others = existingFeedings.concat(rows.filter((_, otherIndex) => otherIndex !== index))
    const nearest = nearestFeeding(others, row)
    if (nearest && isPossibleDuplicate(nearest.minutes)) {
      warnings.push({ time: row.time, otherTime: nearest.record.time, minutes: nearest.minutes })
    }
  })
  return warnings
}

function buildDailyReview(records) {
  const feedings = feedingRecords(records)
  const closePairs = []

  for (let index = 1; index < feedings.length; index += 1) {
    const minutes = minutesBetween(feedings[index - 1], feedings[index])
    if (isPossibleDuplicate(minutes)) {
      closePairs.push({
        earlierId: feedings[index - 1]._id,
        laterId: feedings[index]._id,
        minutes
      })
    }
  }

  return {
    feedingCount: feedings.length,
    totalMilk: feedings.reduce((total, record) => total + feedingTotal(record), 0),
    closePairs
  }
}

module.exports = {
  DEFAULT_REMINDER_MINUTES,
  POSSIBLE_DUPLICATE_MINUTES,
  feedingTotal,
  feedingRecords,
  minutesBetween,
  nearestFeeding,
  isFeedingOverdue,
  isPossibleDuplicate,
  formatReminderHours,
  getPreviousDayReviewDate,
  shouldShowDailyReview,
  getFeedingPeriod,
  getPeriodForTimestamps,
  getIntervalPeriod,
  recommendReminder,
  recommendReminderByPeriod,
  batchDuplicateWarnings,
  buildDailyReview
}
