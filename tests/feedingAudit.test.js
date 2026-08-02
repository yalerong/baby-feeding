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
    sampleCount: 4
  })
  assert.deepStrictEqual(audit.recommendReminder(records.slice(0, 3)), {
    minutes: 240,
    sampleCount: 2
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
    daytime: { minutes: 210, sampleCount: 7 },
    nighttime: { minutes: 360, sampleCount: 4 }
  })
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
