function formatDailyReviewError(error) {
  const message = String(error && error.message || error || '')
  if (/dailyReview|function.*not.*exist|function.*not.*found/i.test(message)) {
    return '请先部署 dailyReview 云函数'
  }
  if (/daily_reviews|collection/i.test(message)) {
    return '请创建 daily_reviews 集合后重试'
  }
  return '审查确认失败，请重试'
}

module.exports = { formatDailyReviewError }
