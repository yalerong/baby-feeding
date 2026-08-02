const assert = require('assert')
const range = require('../cloudfunctions/getStats/dateRange.js')

function test(name, fn) {
  try {
    fn()
    console.log(`ok - ${name}`)
  } catch (err) {
    console.error(`not ok - ${name}`)
    throw err
  }
}

test('seven-day range excludes today and starts seven completed days ago', () => {
  assert.deepStrictEqual(range.getCompletedDayRange('7', '2026-08-02'), {
    startDate: '2026-07-26',
    endDateExclusive: '2026-08-02'
  })
})

test('range crosses months while still excluding today', () => {
  assert.deepStrictEqual(range.getCompletedDayRange('30', '2026-03-01'), {
    startDate: '2026-01-30',
    endDateExclusive: '2026-03-01'
  })
})

test('all-time range does not add date boundaries', () => {
  assert.strictEqual(range.getCompletedDayRange('all', '2026-08-02'), null)
})
