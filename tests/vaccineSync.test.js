const assert = require('assert')
const sync = require('../utils/vaccineSync.js')

function test(name, fn) {
  try {
    fn()
    console.log(`ok - ${name}`)
  } catch (err) {
    console.error(`not ok - ${name}`)
    throw err
  }
}

test('starts vaccine sync only when family and birth date are available', () => {
  assert.strictEqual(sync.shouldSyncVaccine({ familyCode: 'FAMILY', birthDate: '2026-02-24' }), true)
  assert.strictEqual(sync.shouldSyncVaccine({ familyCode: '', birthDate: '2026-02-24' }), false)
  assert.strictEqual(sync.shouldSyncVaccine({ familyCode: 'FAMILY', birthDate: '' }), false)
})

test('uses the family code as the vaccine sync identity', () => {
  assert.strictEqual(sync.getVaccineSyncKey({ familyCode: 'FAMILY' }), 'FAMILY')
  assert.strictEqual(sync.getVaccineSyncKey({ familyCode: '' }), '')
})

test('derives vaccine records from realtime watch snapshots', () => {
  const docs = [
    { _id: 'b', plannedDate: '2026-03-24' },
    { _id: 'a', plannedDate: '2026-02-24' }
  ]

  assert.deepStrictEqual(sync.recordsFromWatchSnapshot({ docs }), docs)
  assert.deepStrictEqual(sync.recordsFromWatchSnapshot(null), [])
})
