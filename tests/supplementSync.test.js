const assert = require('assert')
const sync = require('../utils/supplementSync.js')

function test(name, fn) {
  try {
    fn()
    console.log(`ok - ${name}`)
  } catch (err) {
    console.error(`not ok - ${name}`)
    throw err
  }
}

test('starts supplement sync only for today with a concrete supplement', () => {
  assert.strictEqual(sync.shouldSyncSupplement({
    currentDate: '2026-06-15',
    todayDate: '2026-06-15',
    familyCode: 'FAMILY',
    name: 'VAD'
  }), true)

  assert.strictEqual(sync.shouldSyncSupplement({
    currentDate: '2026-06-14',
    todayDate: '2026-06-15',
    familyCode: 'FAMILY',
    name: 'VAD'
  }), false)

  assert.strictEqual(sync.shouldSyncSupplement({
    currentDate: '2026-06-15',
    todayDate: '2026-06-15',
    familyCode: 'FAMILY',
    name: ''
  }), false)
})

test('uses family, date and supplement name as the sync identity', () => {
  assert.strictEqual(sync.getSupplementSyncKey({
    familyCode: 'FAMILY',
    date: '2026-06-15',
    name: 'VD'
  }), 'FAMILY|2026-06-15|VD')

  assert.strictEqual(sync.getSupplementSyncKey({
    familyCode: '',
    date: '2026-06-15',
    name: 'VD'
  }), '')
})

test('derives taken state from realtime watch snapshots', () => {
  assert.strictEqual(sync.takenFromWatchSnapshot({ docs: [{ _id: 'one' }] }), true)
  assert.strictEqual(sync.takenFromWatchSnapshot({ docs: [] }), false)
  assert.strictEqual(sync.takenFromWatchSnapshot(null), false)
})

test('does not expose polling configuration when realtime watch is required', () => {
  assert.strictEqual(Object.prototype.hasOwnProperty.call(sync, 'SUPPLEMENT_SYNC_INTERVAL_MS'), false)
})

test('formats supplement operation failures for mobile toasts', () => {
  assert.strictEqual(sync.operationFailureTitle({ result: { error: 'collection not found' } }), '操作失败: collection not found')
  assert.strictEqual(sync.operationFailureTitle({ errMsg: 'cloud.callFunction:fail function not found' }), '操作失败: cloud.callFunction:fail function not found')
  assert.strictEqual(sync.operationFailureTitle(null), '操作失败')
})
