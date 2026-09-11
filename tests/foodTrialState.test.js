const assert = require('assert')
const { getUndoTrialState, withLogSource, nextLogDates } = require('../cloudfunctions/foodTrial/trialState.js')

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
    logDates: [],
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
    logDates: [],
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

test('relaxed-mode undo returns to the previous logged day, not simply yesterday', () => {
  const trial = { trialCount: 2, status: 'tracking', lastTriedDate: '2026-08-05', logDates: ['2026-08-01', '2026-08-05'], logSources: { '2026-08-01': 'r1' } }
  assert.deepStrictEqual(getUndoTrialState(trial, '2026-08-05'), {
    action: 'update',
    trialCount: 1,
    status: 'tracking',
    lastTriedDate: '2026-08-01',
    logSources: { '2026-08-01': 'r1' },
    logDates: ['2026-08-01'],
    lastLogRecordId: 'r1'
  })
})

test('log dates continue the streak when consecutive/relaxed and restart otherwise', () => {
  assert.deepStrictEqual(nextLogDates({ logDates: ['2026-08-01'] }, '2026-08-02', true), ['2026-08-01', '2026-08-02'])
  assert.deepStrictEqual(nextLogDates({ logDates: ['2026-08-01'] }, '2026-08-03', false), ['2026-08-03'])
  assert.deepStrictEqual(nextLogDates(null, '2026-08-03', false), ['2026-08-03'])
})
