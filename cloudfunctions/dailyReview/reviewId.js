const crypto = require('crypto')

function getReviewDocumentId(familyCode, date) {
  const value = `${String(familyCode || '').trim()}\u0000${String(date || '').trim()}`
  return `review_${crypto.createHash('sha256').update(value).digest('hex')}`
}

module.exports = { getReviewDocumentId }
