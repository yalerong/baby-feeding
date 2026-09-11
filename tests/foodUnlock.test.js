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

test('keeps suspected allergens visible and places them after active foods', () => {
  const foods = [
    { name: '南瓜', status: 'tracking' },
    { name: '虾', status: 'allergic' },
    { name: '鸡蛋', status: 'unlocked' }
  ]
  assert.deepStrictEqual(foodUnlock.orderTrialFoods(foods).map(food => food.name), ['南瓜', '鸡蛋', '虾'])
  assert.deepStrictEqual(
    foodUnlock.getMissingAllergicFoodNames([
      { foodName: '虾', status: 'allergic' },
      { foodName: '南瓜', status: 'tracking' }
    ], { 南瓜: true }),
    ['虾']
  )
})

test('does not allow a second trial log on the same day', () => {
  assert.deepStrictEqual(foodUnlock.getNextTrialState({ trialCount: 2, lastTriedDate: '2026-08-02' }, '2026-08-02'), {
    trialCount: 2,
    duplicate: true
  })
})

test('recording solid food auto-advances the matching active trial', () => {
  const trials = [
    { foodName: '南瓜', status: 'tracking', trialCount: 1, lastTriedDate: '2026-08-02' },
    { foodName: '米粉', status: 'unlocked', trialCount: 3, lastTriedDate: '2026-07-20' }
  ]
  assert.strictEqual(foodUnlock.getAutoTrialTarget(['南瓜', '米粉'], trials, '2026-08-03'), '南瓜')
  // 进行中的试吃与这道菜无关时不打卡，避免并行两条试吃线
  assert.strictEqual(foodUnlock.getAutoTrialTarget(['土豆'], trials, '2026-08-03'), null)
})

test('auto trial starts a new food only when the dish has exactly one new food', () => {
  assert.strictEqual(foodUnlock.getAutoTrialTarget(['南瓜', '米粉'], [
    { foodName: '米粉', status: 'unlocked', trialCount: 3, lastTriedDate: '2026-07-20' }
  ], '2026-08-03'), '南瓜')
  assert.strictEqual(foodUnlock.getAutoTrialTarget(['猪肉', '土豆'], [], '2026-08-03'), '')
  assert.strictEqual(foodUnlock.getAutoTrialTarget(['米粉'], [
    { foodName: '米粉', status: 'unlocked', trialCount: 3, lastTriedDate: '2026-07-20' }
  ], '2026-08-03'), null)
})

test('auto trial skips allergic foods and same-day duplicates', () => {
  assert.strictEqual(foodUnlock.getAutoTrialTarget(['南瓜'], [
    { foodName: '南瓜', status: 'allergic', trialCount: 1, lastTriedDate: '2026-08-01' }
  ], '2026-08-03'), null)
  assert.strictEqual(foodUnlock.getAutoTrialTarget(['南瓜'], [
    { foodName: '南瓜', status: 'tracking', trialCount: 2, lastTriedDate: '2026-08-03' }
  ], '2026-08-03'), null)
})

test('builds one stable document id for the same family and food', () => {
  assert.strictEqual(getTrialDocumentId('FAMILY', ' 鸡蛋 '), getTrialDocumentId('FAMILY', '鸡蛋'))
  assert.notStrictEqual(getTrialDocumentId('FAMILY', '鸡蛋'), getTrialDocumentId('OTHER', '鸡蛋'))
})

test('lists custom and off-catalog trial foods so they stay visible and undoable', () => {
  const trials = [
    { foodName: '胡萝卜', status: 'tracking', trialCount: 1, lastTriedDate: '2026-09-11' },
    { foodName: '米粉', status: 'unlocked', trialCount: 3, lastTriedDate: '2026-09-01' },
    { foodName: '玉米', status: 'tracking', trialCount: 0, lastTriedDate: '' }
  ]
  assert.deepStrictEqual(foodUnlock.getMissingTrialFoodNames(trials, { '米粉': true }), ['胡萝卜', '玉米'])
  assert.strictEqual(foodUnlock.getActiveFoodName(trials, '2026-09-11'), '胡萝卜')
})

test('does not auto-log a back-filled date earlier than the latest trial day', () => {
  const trials = [{ foodName: '胡萝卜', status: 'tracking', trialCount: 2, lastTriedDate: '2026-09-11' }]
  assert.strictEqual(foodUnlock.getAutoTrialTarget(['胡萝卜'], trials, '2026-09-10'), null)
  assert.strictEqual(foodUnlock.getAutoTrialTarget(['胡萝卜'], trials, '2026-09-12'), '胡萝卜')
})

test('reverts only trials this record logged that day and not covered by another record', () => {
  const trials = [
    { foodName: '胡萝卜', status: 'tracking', trialCount: 1, lastTriedDate: '2026-09-11', logSources: { '2026-09-11': 'r1' } },
    { foodName: '南瓜', status: 'tracking', trialCount: 2, lastTriedDate: '2026-09-10', logSources: { '2026-09-10': 'r1' } },
    // 旧文档只有 lastLogRecordId 也认
    { foodName: '米粉', status: 'unlocked', trialCount: 3, lastTriedDate: '2026-09-11', lastLogRecordId: 'r1' },
    { foodName: '苹果', status: 'tracking', trialCount: 1, lastTriedDate: '2026-09-11', logSources: {} }
  ]
  assert.deepStrictEqual(foodUnlock.getTrialRevertFoods({ foods: ['胡萝卜', '南瓜', '米粉', '苹果'], otherFoods: [], trials, date: '2026-09-11', recordId: 'r1' }), ['胡萝卜', '米粉'])
  assert.deepStrictEqual(foodUnlock.getTrialRevertFoods({ foods: ['胡萝卜'], otherFoods: ['胡萝卜'], trials, date: '2026-09-11', recordId: 'r1' }), [])
  // 手动在解锁页打的卡（无 recordId）和别的记录打的卡都不动
  assert.deepStrictEqual(foodUnlock.getTrialRevertFoods({ foods: ['苹果', '胡萝卜'], otherFoods: [], trials, date: '2026-09-11', recordId: 'r2' }), [])
})

test('flags peas and lentils as common allergens', () => {
  assert.strictEqual(foodUnlock.getAllergenInfo('豌豆').level, 'common-allergen')
  assert.strictEqual(foodUnlock.getAllergenInfo('红扁豆').level, 'common-allergen')
  assert.strictEqual(foodUnlock.getAllergenInfo('土豆').level, 'observe')
})

test('per-day log sources survive undoing the later day', () => {
  const trial = { foodName: '胡萝卜', status: 'tracking', trialCount: 2, lastTriedDate: '2026-09-11', logSources: { '2026-09-10': 'r1', '2026-09-11': 'r2' } }
  assert.strictEqual(foodUnlock.getLogSource(trial, '2026-09-10'), 'r1')
  assert.strictEqual(foodUnlock.getLogSource(trial, '2026-09-11'), 'r2')
  assert.strictEqual(foodUnlock.getLogSource(trial, '2026-09-09'), '')
})

test('does not back-fill a second food behind another food\'s later ongoing trial', () => {
  const trials = [{ foodName: '南瓜', status: 'tracking', trialCount: 1, lastTriedDate: '2026-09-11', logSources: {} }]
  assert.strictEqual(foodUnlock.hasLaterOngoingTrial(trials, '2026-09-10', '胡萝卜'), true)
  assert.strictEqual(foodUnlock.getAutoTrialTarget(['胡萝卜'], trials, '2026-09-10'), null)
  // 南瓜已解锁就不挡
  assert.strictEqual(foodUnlock.getAutoTrialTarget(['胡萝卜'], [{ foodName: '南瓜', status: 'unlocked', trialCount: 3, lastTriedDate: '2026-09-11' }], '2026-09-10'), '胡萝卜')
})

test('a middle day of a streak is never undone, but its source can still be handed over', () => {
  const trials = [{ foodName: '胡萝卜', status: 'tracking', trialCount: 2, lastTriedDate: '2026-09-11', logSources: { '2026-09-10': 'r1', '2026-09-11': 'r2' } }]
  assert.deepStrictEqual(foodUnlock.getTrialRevertFoods({ foods: ['胡萝卜'], otherFoods: [], trials, date: '2026-09-10', recordId: 'r1' }), [])
  assert.deepStrictEqual(foodUnlock.getTrialRevertFoods({ foods: ['胡萝卜'], otherFoods: [], trials, date: '2026-09-10', recordId: 'r1', lastDayOnly: false }), ['胡萝卜'])
})
