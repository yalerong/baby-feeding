const assert = require('assert')
const foodUnlock = require('../utils/foodUnlock.js')
const { getTrialDocumentId } = require('../cloudfunctions/foodTrial/trialId.js')

function test(name, fn) {
  try {
    fn()
    console.log(`ok - ${name}`)
  } catch (err) {
    console.error(`not ok - ${name}`)
    throw err
  }
}

test('shows the remaining consecutive days before a food is unlocked', () => {
  assert.deepStrictEqual(foodUnlock.decorateFood('南瓜', { foodName: '南瓜', trialCount: 2 }), {
    name: '南瓜',
    trialCount: 2,
    remainingCount: 1,
    status: 'tracking',
    statusText: '再连续吃 1 天解锁'
  })
})

test('marks a food as unlocked after three consecutive days', () => {
  assert.deepStrictEqual(foodUnlock.decorateFood('南瓜', { foodName: '南瓜', trialCount: 3 }), {
    name: '南瓜',
    trialCount: 3,
    remainingCount: 0,
    status: 'unlocked',
    statusText: '已解锁'
  })
})

test('continues only on the next calendar day and resets after a gap', () => {
  assert.deepStrictEqual(foodUnlock.getNextTrialState({ trialCount: 1, lastTriedDate: '2026-08-01' }, '2026-08-02'), {
    trialCount: 2,
    duplicate: false
  })
  assert.deepStrictEqual(foodUnlock.getNextTrialState({ trialCount: 2, lastTriedDate: '2026-08-01' }, '2026-08-03'), {
    trialCount: 1,
    duplicate: false
  })
  assert.deepStrictEqual(foodUnlock.getNextTrialState({ trialCount: 1, lastTriedDate: '2026-08-01' }, '2026-08-01'), {
    trialCount: 1,
    duplicate: true
  })
})

test('allows only one food to be in the active three-day trial at a time', () => {
  assert.strictEqual(foodUnlock.getActiveFoodName([
    { foodName: '南瓜', trialCount: 2, status: 'tracking' },
    { foodName: '土豆', trialCount: 3, status: 'unlocked' }
  ], '2026-08-02'), '')
  assert.strictEqual(foodUnlock.getActiveFoodName([
    { foodName: '南瓜', trialCount: 2, status: 'tracking', lastTriedDate: '2026-08-01' }
  ], '2026-08-02'), '南瓜')
})

test('labels common food allergens without calling other foods allergy-free', () => {
  assert.deepStrictEqual(foodUnlock.getAllergenInfo('鸡蛋'), {
    level: 'common-allergen',
    label: '常见过敏原',
    hint: '单独尝试，留意反应'
  })
  assert.deepStrictEqual(foodUnlock.getAllergenInfo('南瓜'), {
    level: 'observe',
    label: '日常观察',
    hint: '新食材仍需单独尝试'
  })
})

test('builds a three-day achievement progress for each food', () => {
  assert.deepStrictEqual(foodUnlock.buildTrialSteps(2, 'tracking'), [
    { number: 1, done: true, current: false },
    { number: 2, done: true, current: true },
    { number: 3, done: false, current: false }
  ])
  assert.ok(foodUnlock.buildTrialSteps(3, 'unlocked').every(step => step.done))
})

test('keeps a suspected allergen excluded even after three attempts', () => {
  const food = foodUnlock.decorateFood('花生', { foodName: '花生', trialCount: 3, status: 'allergic' })
  assert.strictEqual(food.status, 'allergic')
  assert.deepStrictEqual(foodUnlock.getExcludedIngredients([
    { foodName: '花生', trialCount: 3, status: 'allergic' },
    { foodName: '南瓜', trialCount: 3, status: 'unlocked' }
  ]), ['花生'])
})

test('builds one stable document id for the same family and food', () => {
  assert.strictEqual(getTrialDocumentId('FAMILY', ' 鸡蛋 '), getTrialDocumentId('FAMILY', '鸡蛋'))
  assert.notStrictEqual(getTrialDocumentId('FAMILY', '鸡蛋'), getTrialDocumentId('OTHER', '鸡蛋'))
})
