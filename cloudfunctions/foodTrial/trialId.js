const crypto = require('crypto')

function normalizeFoodName(foodName) {
  return String(foodName || '').trim()
}

function getTrialDocumentId(familyCode, foodName) {
  const value = `${String(familyCode || '').trim()}\u0000${normalizeFoodName(foodName)}`
  return `trial_${crypto.createHash('sha256').update(value).digest('hex')}`
}

module.exports = { normalizeFoodName, getTrialDocumentId }
