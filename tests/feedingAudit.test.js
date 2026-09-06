const assert = require('assert')
const audit = require('../utils/feedingAudit.js')

function test(name, fn) {
  try {
    fn()
    console.log(`ok - ${name}`)
  } catch (err) {
    console.error(`not ok - ${name}`)
    throw err
  }
}

const records = [
  { _id: 'a', date: '2026-08-02', time: '08:00', breastMilk: 60, formula: 0 },
  { _id: 'b', date: '2026-08-02', time: '11:00', breastMilk: 0, formula: 90 },
  { _id: 'c', date: '2026-08-02', time: '14:30', breastMilk: 0, formula: 120 }
]

test('uses four hours as the default feeding reminder interval', () => {
  assert.strictEqual(audit.DEFAULT_REMINDER_MINUTES, 240)
  assert.strictEqual(audit.isFeedingOverdue(241, audit.DEFAULT_REMINDER_MINUTES), true)
  assert.strictEqual(audit.isFeedingOverdue(240, audit.DEFAULT_REMINDER_MINUTES), false)
})

test('formats half-hour reminder intervals for the displayed recommendation', () => {
  assert.strictEqual(audit.formatReminderHours(210), '3.5 小时')
  assert.strictEqual(audit.formatReminderHours(240), '4 小时')
})

test('flags a new feeding within one hour as a possible duplicate', () => {
  assert.strictEqual(audit.isPossibleDuplicate(59), true)
  assert.strictEqual(audit.isPossibleDuplicate(60), true)
  assert.strictEqual(audit.isPossibleDuplicate(61), false)
})

test('does not flag the first feeding of the day (no previous record) as duplicate', () => {
  assert.strictEqual(audit.isPossibleDuplicate(null), false)
  assert.strictEqual(audit.isPossibleDuplicate(undefined), false)
})

test('finds the nearest feeding by absolute distance so back-filled records are checked too', () => {
  // 补录 09:30：最后一条是 14:30（间隔为负），但距 08:00 仅 90 分钟、距 11:00 仅 90 分钟
  assert.deepStrictEqual(audit.nearestFeeding(records, { date: '2026-08-02', time: '09:30' }), {
    record: records[0],
    minutes: 90
  })
  // 补录 10:40：落在 08:00 与 11:00 之间，最近的是 11:00（20 分钟）→ 应被标记为疑似重复
  const nearest = audit.nearestFeeding(records, { date: '2026-08-02', time: '10:40' })
  assert.strictEqual(nearest.record._id, 'b')
  assert.strictEqual(nearest.minutes, 20)
  assert.strictEqual(audit.isPossibleDuplicate(nearest.minutes), true)
  // 无记录时返回 null，且不把自己（编辑中的记录）算进去
  assert.strictEqual(audit.nearestFeeding([], { date: '2026-08-02', time: '10:40' }), null)
  assert.strictEqual(audit.nearestFeeding([records[1]], { _id: 'b', date: '2026-08-02', time: '11:05' }), null)
})

test('reviews yesterday and hides it after it has been confirmed', () => {
  const reviewDate = audit.getPreviousDayReviewDate('2026-08-02')
  assert.strictEqual(reviewDate, '2026-08-01')
  assert.strictEqual(audit.shouldShowDailyReview(reviewDate, ''), true)
  assert.strictEqual(audit.shouldShowDailyReview(reviewDate, '2026-08-01'), false)
})

test('recommends a rounded reminder interval from recent feeding intervals', () => {
  const records = [
    { date: '2026-07-01', time: '06:00', breastMilk: 90 },
    { date: '2026-07-01', time: '09:00', breastMilk: 90 },
    { date: '2026-07-01', time: '12:00', breastMilk: 90 },
    { date: '2026-07-01', time: '16:00', breastMilk: 90 },
    { date: '2026-07-01', time: '20:30', breastMilk: 90 }
  ]

  assert.deepStrictEqual(audit.recommendReminder(records), {
    minutes: 240,
    sampleCount: 4,
    usingDefault: false
  })
  assert.deepStrictEqual(audit.recommendReminder(records.slice(0, 3)), {
    minutes: 240,
    sampleCount: 2,
    usingDefault: true
  })
})

test('recommends separate daytime and nighttime feeding intervals', () => {
  const records = [
    { date: '2026-07-01', time: '07:00', breastMilk: 90 },
    { date: '2026-07-01', time: '10:30', breastMilk: 90 },
    { date: '2026-07-01', time: '14:00', breastMilk: 90 },
    { date: '2026-07-01', time: '17:30', breastMilk: 90 },
    { date: '2026-07-01', time: '21:00', breastMilk: 90 },
    { date: '2026-07-02', time: '03:00', breastMilk: 90 },
    { date: '2026-07-02', time: '09:00', breastMilk: 90 },
    { date: '2026-07-02', time: '12:30', breastMilk: 90 },
    { date: '2026-07-02', time: '16:00', breastMilk: 90 },
    { date: '2026-07-02', time: '19:30', breastMilk: 90 },
    { date: '2026-07-03', time: '01:30', breastMilk: 90 },
    { date: '2026-07-03', time: '07:30', breastMilk: 90 }
  ]

  assert.deepStrictEqual(audit.recommendReminderByPeriod(records), {
    daytime: { minutes: 210, sampleCount: 6, usingDefault: false },
    nighttime: { minutes: 360, sampleCount: 5, usingDefault: false }
  })
})

test('keeps overnight sleep intervals as nighttime samples instead of dropping them', () => {
  // 宝宝整夜不吃：17:30 → 次日 06:30 约 13 小时，白天口径会当漏记丢掉，夜间口径必须保留
  const records = []
  for (let day = 1; day <= 5; day += 1) {
    const date = `2026-09-0${day}`
    records.push({ date, time: '06:30', formula: 210 })
    records.push({ date, time: '10:30', formula: 210 })
    records.push({ date, time: '14:30', formula: 210 })
    records.push({ date, time: '17:30', formula: 240 })
  }
  const result = audit.recommendReminderByPeriod(records)
  assert.strictEqual(result.nighttime.sampleCount, 4)
  assert.strictEqual(result.nighttime.usingDefault, false)
  assert.strictEqual(result.nighttime.minutes, 780)
  // 超过 16 小时的夜间空档仍视为漏记
  const gap = audit.recommendReminderByPeriod([
    { date: '2026-09-01', time: '17:30', formula: 240 },
    { date: '2026-09-02', time: '10:30', formula: 240 }
  ])
  assert.strictEqual(gap.nighttime.sampleCount, 0)
})

test('classifies the current wait by its midpoint for the home reminder', () => {
  const day = require('../utils/date.js')
  const at1830 = day.toBeijingTimestamp('2026-09-01', '18:30')
  const at2130 = day.toBeijingTimestamp('2026-09-01', '21:30')
  const at1000 = day.toBeijingTimestamp('2026-09-01', '10:00')
  assert.strictEqual(audit.getPeriodForTimestamps(at1830, at2130), 'nighttime')
  assert.strictEqual(audit.getPeriodForTimestamps(at1000, at1000 + 60 * 60000), 'daytime')
})

test('warns batch rows that sit within an hour of existing records or of each other', () => {
  const existing = [{ _id: 'x', date: '2026-08-02', time: '08:00', breastMilk: 60, formula: 0 }]
  const rows = [
    { date: '2026-08-02', time: '08:30', breastMilk: 0, formula: 90 },
    { date: '2026-08-02', time: '12:00', breastMilk: 0, formula: 90 },
    { date: '2026-08-02', time: '12:20', breastMilk: 0, formula: 90 },
    { date: '2026-08-02', time: '16:00', breastMilk: 0, formula: 0, stool: true }
  ]
  assert.deepStrictEqual(audit.batchDuplicateWarnings(existing, rows), [
    { time: '08:30', otherTime: '08:00', minutes: 30 },
    { time: '12:00', otherTime: '12:20', minutes: 20 },
    { time: '12:20', otherTime: '12:00', minutes: 20 }
  ])
  assert.deepStrictEqual(audit.batchDuplicateWarnings([], [rows[1]]), [])
})

test('classifies an interval by its midpoint instead of only its first feeding', () => {
  assert.strictEqual(audit.getIntervalPeriod(
    { date: '2026-07-31', time: '17:55' },
    { date: '2026-08-01', time: '00:30' }
  ), 'nighttime')
  assert.strictEqual(audit.getIntervalPeriod(
    { date: '2026-08-01', time: '10:00' },
    { date: '2026-08-01', time: '14:00' }
  ), 'daytime')
})

test('summarizes close feeding pairs for the evening review without deleting records', () => {
  const review = audit.buildDailyReview([
    records[0],
    { _id: 'nearby', date: '2026-08-02', time: '08:40', breastMilk: 0, formula: 90 },
    records[1]
  ])

  assert.deepStrictEqual(review, {
    feedingCount: 3,
    totalMilk: 240,
    closePairs: [{ earlierId: 'a', laterId: 'nearby', minutes: 40 }]
  })
})
