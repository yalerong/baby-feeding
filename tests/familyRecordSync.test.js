const assert = require('assert')
const sync = require('../utils/familyRecordSync.js')

function test(name, fn) {
  try {
    fn()
    console.log(`ok - ${name}`)
  } catch (err) {
    console.error(`not ok - ${name}`)
    throw err
  }
}

test('starts family record sync only with a family code', () => {
  assert.strictEqual(sync.shouldSyncFamilyRecords({ familyCode: 'FAMILY' }), true)
  assert.strictEqual(sync.shouldSyncFamilyRecords({ familyCode: '' }), false)
})

test('uses family and optional date as realtime sync identity', () => {
  assert.strictEqual(sync.getFamilySyncKey({ familyCode: 'FAMILY' }), 'FAMILY')
  assert.strictEqual(sync.getFamilySyncKey({ familyCode: 'FAMILY', date: '2026-06-15' }), 'FAMILY|2026-06-15')
  assert.strictEqual(sync.getFamilySyncKey({ familyCode: '' }), '')
})

test('derives records from realtime watch snapshots', () => {
  const docs = [{ _id: 'a' }, { _id: 'b' }]

  assert.deepStrictEqual(sync.recordsFromWatchSnapshot({ docs }), docs)
  assert.deepStrictEqual(sync.recordsFromWatchSnapshot(null), [])
})
