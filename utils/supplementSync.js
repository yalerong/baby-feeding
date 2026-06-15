function shouldSyncSupplement({ currentDate, todayDate, familyCode, name }) {
  return !!familyCode && !!name && currentDate === todayDate
}

function getSupplementSyncKey({ familyCode, date, name }) {
  if (!familyCode || !date || !name) return ''
  return `${familyCode}|${date}|${name}`
}

function takenFromWatchSnapshot(snapshot) {
  return !!(snapshot && Array.isArray(snapshot.docs) && snapshot.docs.length > 0)
}

function operationFailureTitle(reason) {
  const message = reason && reason.result && reason.result.error
    ? reason.result.error
    : reason && reason.errMsg
      ? reason.errMsg
      : ''
  return message ? `操作失败: ${message}` : '操作失败'
}

module.exports = {
  shouldSyncSupplement,
  getSupplementSyncKey,
  takenFromWatchSnapshot,
  operationFailureTitle
}
