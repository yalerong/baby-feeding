function shouldSyncVaccine({ familyCode, birthDate }) {
  return !!familyCode && !!birthDate
}

function getVaccineSyncKey({ familyCode }) {
  return familyCode || ''
}

function recordsFromWatchSnapshot(snapshot) {
  return snapshot && Array.isArray(snapshot.docs) ? snapshot.docs : []
}

module.exports = {
  shouldSyncVaccine,
  getVaccineSyncKey,
  recordsFromWatchSnapshot
}
