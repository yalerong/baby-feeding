const assert = require('assert')
const { getUndoTrialState } = require('../cloudfunctions/foodTrial/trialState.js')

function test(name, fn) {
  try {
    fn()
    console.log(`ok - ${name}`)
  } catch (err) {
    console.error(`not ok - ${name}`)
    throw err
  }
}

test('removes a first-day trial when undoing today\'s accidental tap', () => {
  assert.deepStrictEqual(getUndoTrialState({ trialCount: 1, lastTriedDate: '2026-08-02' }, '2026-08-02'), {
    action: 'remove'
  })
})

test('reverts a later trial day and its unlocked status', () => {
  assert.deepStrictEqual(getUndoTrialState({ trialCount: 3, status: 'unlocked', lastTriedDate: '2026-08-02' }, '2026-08-02'), {
    action: 'update',
    trialCount: 2,
    status: 'tracking',
    lastTriedDate: '2026-08-01'
  })
})

test('does not undo a record from a different day', () => {
  assert.strictEqual(getUndoTrialState({ trialCount: 2, lastTriedDate: '2026-08-01' }, '2026-08-02'), null)
})
