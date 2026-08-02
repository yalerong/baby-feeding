const assert = require('assert')
const cache = require('../utils/feedingReminderCache.js')

function test(name, fn) {
  try {
    fn()
    console.log(`ok - ${name}`)
  } catch (err) {
    console.error(`not ok - ${name}`)
    throw err
  }
}

test('uses the family and cutoff date as the reminder cache identity', () => {
  assert.strictEqual(
    cache.getKey('FAMILY-A', '2026-08-02'),
    'feedingReminderRecommendation:v2:FAMILY-A:2026-08-02'
  )
})
