const assert = require('assert')
const dateUtil = require('../utils/date.js')

function test(name, fn) {
  try {
    fn()
    console.log(`ok - ${name}`)
  } catch (err) {
    console.error(`not ok - ${name}`)
    throw err
  }
}

test('formatDate and formatTime use Beijing time', () => {
  const instant = new Date('2026-02-23T16:05:00.000Z')

  assert.strictEqual(dateUtil.formatDate(instant), '2026-02-24')
  assert.strictEqual(dateUtil.formatTime(instant), '00:05')
})

test('baby life days count birth date as day one', () => {
  assert.strictEqual(dateUtil.daysBetween('2026-02-24', '2026-02-24'), 1)
  assert.strictEqual(dateUtil.daysBetween('2026-02-24', '2026-02-25'), 2)
  assert.strictEqual(dateUtil.daysBetween('2026-02-24', '2026-05-24'), 90)
})

test('age text calculates calendar months from Beijing date strings', () => {
  assert.strictEqual(dateUtil.ageText('2026-03-01', '2026-04-01'), '1 个月 0 天')
  assert.strictEqual(dateUtil.ageText('2026-02-24', '2026-02-24'), '1 天')
})

test('date arithmetic uses Beijing calendar date strings', () => {
  assert.strictEqual(dateUtil.addDays('2026-02-24', 28), '2026-03-24')
  assert.strictEqual(dateUtil.addMonths('2026-02-24', 3), '2026-05-24')
  assert.strictEqual(dateUtil.monthsBetween('2026-03-01', '2026-04-01'), 1)
})

test('toBeijingTimestamp treats date and time as Beijing local time', () => {
  const timestamp = dateUtil.toBeijingTimestamp('2026-02-24', '00:05')

  assert.strictEqual(new Date(timestamp).toISOString(), '2026-02-23T16:05:00.000Z')
})

test('current feeding intervals use the current Beijing instant', () => {
  const instant = new Date('2026-08-02T02:43:27.000Z')
  assert.strictEqual(dateUtil.nowBeijingTimestamp(instant), instant.getTime())
})

test('supplement reminder alternates VD and VAD from birth date', () => {
  assert.deepStrictEqual(dateUtil.supplementReminder('2026-02-24', '2026-02-24'), {
    day: 1,
    name: 'VD',
    nextName: 'VAD'
  })
  assert.deepStrictEqual(dateUtil.supplementReminder('2026-02-24', '2026-02-25'), {
    day: 2,
    name: 'VAD',
    nextName: 'VD'
  })
  assert.deepStrictEqual(dateUtil.supplementReminder('2026-02-24', '2026-02-26'), {
    day: 3,
    name: 'VD',
    nextName: 'VAD'
  })
})

test('supplement reminder stays unset without birth date', () => {
  assert.deepStrictEqual(dateUtil.supplementReminder('', '2026-02-24'), {
    day: 0,
    name: '',
    nextName: ''
  })
})

test('ageText never shows negative days for month-end birthdays', () => {
  assert.strictEqual(dateUtil.ageText('2026-01-31', '2026-03-01'), '1 个月 1 天')
  assert.strictEqual(dateUtil.ageText('2026-08-31', '2026-10-01'), '1 个月 1 天')
  assert.strictEqual(dateUtil.ageText('2026-02-24', '2026-08-02'), '5 个月 9 天')
})
