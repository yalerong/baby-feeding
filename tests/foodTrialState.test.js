const assert = require('assert')
const { getUndoTrialState, withLogSource } = require('../cloudfunctions/foodTrial/trialState.js')

function test(name, fn) {
  try {
    fn()
    console.log(`ok - ${name}`)
  } catch (err) {
    console.error(`not ok - ${name}`)
    throw err
  }
}

test('resets a first-day trial to zero days (keeps the food listed) when undoing the same-day tap', () => {
  assert.deepStrictEqual(getUndoTrialState({ trialCount: 1, lastTriedDate: '2026-08-02', logSources: { '2026-08-02': 'r1' } }, '2026-08-02'), {
    action: 'reset',
    trialCount: 0,
    status: 'tracking',
    lastTriedDate: '',
    logSources: {},
    lastLogRecordId: ''
  })
})

test('reverts a later trial day and its unlocked status', () => {
  assert.deepStrictEqual(getUndoTrialState({ trialCount: 3, status: 'unlocked', lastTriedDate: '2026-08-02', logSources: { '2026-07-31': 'r1', '2026-08-01': 'r2', '2026-08-02': 'r3' } }, '2026-08-02'), {
    action: 'update',
    trialCount: 2,
    status: 'tracking',
    lastTriedDate: '2026-08-01',
    logSources: { '2026-07-31': 'r1', '2026-08-01': 'r2' },
    lastLogRecordId: 'r2'
  })
})

test('does not undo a record from a different day', () => {
  assert.strictEqual(getUndoTrialState({ trialCount: 2, lastTriedDate: '2026-08-01' }, '2026-08-02'), null)
})

test('records and clears per-day log sources without touching other days', () => {
  assert.deepStrictEqual(withLogSource({ '2026-08-01': 'r1' }, '2026-08-02', 'r2'), { '2026-08-01': 'r1', '2026-08-02': 'r2' })
  assert.deepStrictEqual(withLogSource({ '2026-08-01': 'r1' }, '2026-08-02', ''), { '2026-08-01': 'r1' })
  assert.deepStrictEqual(withLogSource(undefined, '2026-08-02', 'r2'), { '2026-08-02': 'r2' })
})
