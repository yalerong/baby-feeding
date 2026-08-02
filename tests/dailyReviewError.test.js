const assert = require('assert')
const { formatDailyReviewError } = require('../utils/dailyReviewError.js')

assert.strictEqual(
  formatDailyReviewError(new Error('FunctionName dailyReview does not exist')),
  '请先部署 dailyReview 云函数'
)
assert.strictEqual(
  formatDailyReviewError(new Error('collection daily_reviews does not exist')),
  '请创建 daily_reviews 集合后重试'
)
console.log('ok - explains daily review cloud setup failures')
