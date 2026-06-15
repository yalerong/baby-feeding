function shouldSyncFamilyRecords({ familyCode }) {
  return !!familyCode
}

function getFamilySyncKey({ familyCode, date }) {
  if (!familyCode) return ''
  return date ? `${familyCode}|${date}` : familyCode
}

function recordsFromWatchSnapshot(snapshot) {
  return snapshot && Array.isArray(snapshot.docs) ? snapshot.docs : []
}

module.exports = {
  shouldSyncFamilyRecords,
  getFamilySyncKey,
  recordsFromWatchSnapshot
}
