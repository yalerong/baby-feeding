const assert = require('assert')
const { getReviewDocumentId } = require('../cloudfunctions/dailyReview/reviewId.js')

function test(name, fn) {
  try {
    fn()
    console.log(`ok - ${name}`)
  } catch (err) {
    console.error(`not ok - ${name}`)
    throw err
  }
}

test('uses one shared review document for a family and date', () => {
  assert.strictEqual(
    getReviewDocumentId('FAMILY-A', '2026-08-01'),
    getReviewDocumentId('FAMILY-A', '2026-08-01')
  )
  assert.notStrictEqual(
    getReviewDocumentId('FAMILY-A', '2026-08-01'),
    getReviewDocumentId('FAMILY-B', '2026-08-01')
  )
})
