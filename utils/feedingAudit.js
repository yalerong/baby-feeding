const dateUtil = require('./date.js')

const DEFAULT_REMINDER_MINUTES = 240
const POSSIBLE_DUPLICATE_MINUTES = 60
const MIN_RECOMMENDED_REMINDER_MINUTES = 180
const MAX_RECOMMENDED_REMINDER_MINUTES = 300
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

function isFeedingOverdue(minutes, reminderMinutes) {
  return Number(minutes) > Number(reminderMinutes || DEFAULT_REMINDER_MINUTES)
}

function isPossibleDuplicate(minutes) {
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
    return { minutes: DEFAULT_REMINDER_MINUTES, sampleCount: intervals.length }
  }
  const sorted = intervals.slice().sort((a, b) => a - b)
  const position = (sorted.length - 1) * 0.75
  const lower = Math.floor(position)
  const upper = Math.ceil(position)
  const percentile = sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower)
  const rounded = Math.round(percentile / 30) * 30
  return {
    minutes: Math.max(minMinutes, Math.min(maxMinutes, rounded)),
    sampleCount: intervals.length
  }
}

function collectIntervals(records) {
  const feedings = feedingRecords(records)
  const intervals = []
  for (let index = 1; index < feedings.length; index += 1) {
    const minutes = minutesBetween(feedings[index - 1], feedings[index])
    if (minutes !== null && minutes > 0 && minutes <= 12 * 60) {
      intervals.push({ minutes, previous: feedings[index - 1] })
    }
  }
  return intervals
}

function getFeedingPeriod(record) {
  const hour = Number(String(record && record.time || '').split(':')[0])
  return Number.isFinite(hour) && hour >= 7 && hour < 19 ? 'daytime' : 'nighttime'
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
  collectIntervals(records).forEach(item => groups[getFeedingPeriod(item.previous)].push(item.minutes))
  return {
    daytime: recommendFromIntervals(groups.daytime, MIN_RECOMMENDED_REMINDER_MINUTES, MAX_RECOMMENDED_REMINDER_MINUTES),
    nighttime: recommendFromIntervals(groups.nighttime, 240, 480)
  }
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
  isFeedingOverdue,
  isPossibleDuplicate,
  formatReminderHours,
  getPreviousDayReviewDate,
  shouldShowDailyReview,
  getFeedingPeriod,
  recommendReminder,
  recommendReminderByPeriod,
  buildDailyReview
}
