const pageSnapshot = require('./pageSnapshot.js')

function getKey(familyCode, endDateExclusive) {
  return `feedingReminderRecommendation:v4:${familyCode}:${endDateExclusive}`
}

function clearForToday(familyCode, todayDate) {
  wx.removeStorageSync(getKey(familyCode, todayDate))
  pageSnapshot.invalidate('home')
  pageSnapshot.invalidate('stats')
  pageSnapshot.invalidate('recommendation')
}

module.exports = { getKey, clearForToday }
