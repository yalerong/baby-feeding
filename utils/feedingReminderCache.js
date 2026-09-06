function getKey(familyCode, endDateExclusive) {
  return `feedingReminderRecommendation:v4:${familyCode}:${endDateExclusive}`
}

function clearForToday(familyCode, todayDate) {
  wx.removeStorageSync(getKey(familyCode, todayDate))
}

module.exports = { getKey, clearForToday }
