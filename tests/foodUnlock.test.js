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
    streakExpired: false,
    allergyNote: '',
    allergyDate: '',
    statusText: '再连续吃 1 天解锁'
  })
})

test('marks a food as unlocked after three consecutive days', () => {
  assert.deepStrictEqual(foodUnlock.decorateFood('南瓜', { foodName: '南瓜', trialCount: 3 }), {
    name: '南瓜',
    trialCount: 3,
    remainingCount: 0,
    status: 'unlocked',
    streakExpired: false,
    allergyNote: '',
    allergyDate: '',
    statusText: '已解锁'
  })
})

test('strict display resets an expired visible streak without changing the stored count', () => {
  assert.deepStrictEqual(foodUnlock.decorateFood('南瓜', { foodName: '南瓜', trialCount: 2, status: 'tracking', lastTriedDate: '2026-10-05' }, 'strict', '2026-10-08'), {
    name: '南瓜',
    trialCount: 2,
    remainingCount: 3,
    status: 'tracking',
    streakExpired: true,
    allergyNote: '',
    allergyDate: '',
    statusText: '连续试吃已中断，需重新记录 3 天'
  })
  assert.deepStrictEqual(foodUnlock.buildTrialSteps(0, 'tracking'), [
    { number: 1, done: false, current: false },
    { number: 2, done: false, current: false },
    { number: 3, done: false, current: false }
  ])
})

test('strict display keeps yesterday streaks active and relaxed gaps active', () => {
  assert.strictEqual(foodUnlock.decorateFood('南瓜', { trialCount: 2, status: 'tracking', lastTriedDate: '2026-10-07' }, 'strict', '2026-10-08').streakExpired, false)
  assert.strictEqual(foodUnlock.decorateFood('南瓜', { trialCount: 2, status: 'tracking', lastTriedDate: '2026-10-05' }, 'relaxed', '2026-10-08').streakExpired, false)
  assert.strictEqual(foodUnlock.decorateFood('南瓜', { trialCount: 3, status: 'unlocked', lastTriedDate: '2026-10-05' }, 'strict', '2026-10-08').streakExpired, false)
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

test('orders active, ongoing, pending, unlocked and allergic foods without mutating input', () => {
  const foods = [
    { name: '待开始', status: 'tracking', trialCount: 0 },
    { name: '已解锁', status: 'unlocked', trialCount: 3 },
    { name: '已断档', status: 'tracking', trialCount: 2, streakExpired: true },
    { name: '进行中1', status: 'tracking', trialCount: 1 },
    { name: '当前', status: 'tracking', trialCount: 1, isActive: true },
    { name: '过敏', status: 'allergic', trialCount: 1 },
    { name: '进行中2', status: 'tracking', trialCount: 2 }
  ]
  const before = JSON.parse(JSON.stringify(foods))
  assert.deepStrictEqual(foodUnlock.orderTrialFoods(foods).map(food => food.name), ['当前', '进行中1', '进行中2', '待开始', '已断档', '已解锁', '过敏'])
  assert.deepStrictEqual(foods, before)
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

test('explains strict-mode foods skipped by an active trial or later ongoing trial', () => {
  assert.deepStrictEqual(foodUnlock.getAutoTrialResult(['苹果', '红薯'], [
    { foodName: '苹果', status: 'tracking', trialCount: 1, lastTriedDate: '2026-10-02' }
  ], '2026-10-03', 'strict'), {
    targets: ['苹果'],
    ambiguous: false,
    reason: '苹果正在试吃中，红薯未计入试吃'
  })
  assert.deepStrictEqual(foodUnlock.getAutoTrialResult(['红薯'], [
    { foodName: '苹果', status: 'tracking', trialCount: 1, lastTriedDate: '2026-10-03' }
  ], '2026-10-03', 'strict'), {
    targets: [],
    ambiguous: false,
    reason: '苹果正在试吃中，红薯未计入试吃'
  })
  assert.deepStrictEqual(foodUnlock.getAutoTrialResult(['菠菜'], [
    { foodName: '红薯', status: 'tracking', trialCount: 1, lastTriedDate: '2026-10-05' }
  ], '2026-10-06', 'strict'), {
    targets: [],
    ambiguous: false,
    reason: '红薯正在试吃中，菠菜未计入试吃'
  })
  assert.deepStrictEqual(foodUnlock.getAutoTrialResult(['菠菜'], [
    { foodName: '红薯', status: 'tracking', trialCount: 1, lastTriedDate: '2026-10-07' }
  ], '2026-10-06', 'strict'), {
    targets: [],
    ambiguous: false,
    reason: '已有更晚的红薯试吃记录，菠菜未计入试吃'
  })
})

test('does not warn for duplicate same-day logs or already unlocked foods', () => {
  assert.deepStrictEqual(foodUnlock.getAutoTrialResult(['红薯'], [
    { foodName: '红薯', status: 'tracking', trialCount: 1, lastTriedDate: '2026-10-03' }
  ], '2026-10-03', 'strict'), {
    targets: [],
    ambiguous: false,
    reason: ''
  })
  assert.deepStrictEqual(foodUnlock.getAutoTrialResult(['苹果'], [
    { foodName: '苹果', status: 'unlocked', trialCount: 3, lastTriedDate: '2026-10-03' }
  ], '2026-10-04', 'strict'), {
    targets: [],
    ambiguous: false,
    reason: ''
  })
  assert.deepStrictEqual(foodUnlock.getAutoTrialResult(['红薯'], [
    { foodName: '苹果', status: 'tracking', trialCount: 1, lastTriedDate: '2026-10-03' },
    { foodName: '红薯', status: 'tracking', trialCount: 1, lastTriedDate: '2026-10-03' }
  ], '2026-10-03', 'strict'), {
    targets: [],
    ambiguous: false,
    reason: ''
  })
  assert.deepStrictEqual(foodUnlock.getAutoTrialResult(['苹果'], [
    { foodName: '苹果', status: 'unlocked', trialCount: 3, lastTriedDate: '2026-10-05' }
  ], '2026-10-04', 'strict'), {
    targets: [],
    ambiguous: false,
    reason: ''
  })
})

test('explains older back-fill dates in relaxed mode without warning for unlocked foods', () => {
  assert.deepStrictEqual(foodUnlock.getAutoTrialResult(['红薯', '胡萝卜'], [
    { foodName: '红薯', status: 'tracking', trialCount: 2, lastTriedDate: '2026-10-05' }
  ], '2026-10-04', 'relaxed'), {
    targets: ['胡萝卜'],
    ambiguous: false,
    reason: '已有更晚的红薯试吃记录，红薯未计入试吃'
  })
  assert.deepStrictEqual(foodUnlock.getAutoTrialResult(['红薯'], [
    { foodName: '红薯', status: 'tracking', trialCount: 2, lastTriedDate: '2026-10-05' }
  ], '2026-10-04', 'relaxed'), {
    targets: [],
    ambiguous: false,
    reason: '已有更晚的红薯试吃记录，红薯未计入试吃'
  })
  assert.deepStrictEqual(foodUnlock.getAutoTrialResult(['苹果'], [
    { foodName: '苹果', status: 'unlocked', trialCount: 3, lastTriedDate: '2026-10-05' }
  ], '2026-10-04', 'relaxed'), {
    targets: [],
    ambiguous: false,
    reason: ''
  })
})

test('a middle day of a streak is never undone, but its source can still be handed over', () => {
  const trials = [{ foodName: '胡萝卜', status: 'tracking', trialCount: 2, lastTriedDate: '2026-09-11', logSources: { '2026-09-10': 'r1', '2026-09-11': 'r2' } }]
  assert.deepStrictEqual(foodUnlock.getTrialRevertFoods({ foods: ['胡萝卜'], otherFoods: [], trials, date: '2026-09-10', recordId: 'r1' }), [])
  assert.deepStrictEqual(foodUnlock.getTrialRevertFoods({ foods: ['胡萝卜'], otherFoods: [], trials, date: '2026-09-10', recordId: 'r1', lastDayOnly: false }), ['胡萝卜'])
})

test('manually unlocked foods are never reverted by feeding-record edits', () => {
  const trials = [{ foodName: '苹果', status: 'unlocked', trialCount: 3, lastTriedDate: '2026-10-01', manuallyUnlocked: true, logSources: { '2026-10-01': 'r1' } }]
  assert.deepStrictEqual(foodUnlock.getTrialRevertFoods({ foods: ['苹果'], otherFoods: [], trials, date: '2026-10-01', recordId: 'r1' }), [])
  assert.deepStrictEqual(foodUnlock.getTrialRevertFoods({ foods: ['苹果'], otherFoods: [], trials, date: '2026-10-01', recordId: 'r1', lastDayOnly: false }), [])
})

test('menu trial page shows expired strict streak progress as zero while preserving trial count', () => {
  let pageConfig = null
  const originalPage = global.Page
  const originalWx = global.wx
  global.Page = config => { pageConfig = config }
  global.wx = {
    getStorageSync() { return '' },
    cloud: { callFunction() { return Promise.resolve({ result: { success: true, data: [] } }) } }
  }
  delete require.cache[require.resolve('../pages/menu/menu.js')]
  require('../pages/menu/menu.js')
  global.Page = originalPage
  global.wx = originalWx

  const page = Object.assign({}, pageConfig, {
    data: JSON.parse(JSON.stringify(pageConfig.data)),
    setData(patch) { Object.assign(this.data, patch) }
  })
  page.data.today = '2026-10-08'
  page.data.currentAgeMonth = 8
  page.data.trialMode = 'strict'
  page.data.foodTrials = [{ foodName: '红薯', status: 'tracking', trialCount: 2, lastTriedDate: '2026-10-05' }]
  page.buildTrialFoods()

  const food = page.data.trialFoods.find(item => item.name === '红薯')
  assert.ok(food)
  assert.strictEqual(food.trialCount, 2)
  assert.strictEqual(food.streakExpired, true)
  assert.deepStrictEqual(food.progressSteps, foodUnlock.buildTrialSteps(0, 'tracking'))
})

test('strict mixed-dish backfill explains a later trial even when that food is in the dish', () => {
  assert.deepStrictEqual(foodUnlock.getAutoTrialResult(['苹果', '红薯'], [
    { foodName: '苹果', status: 'tracking', trialCount: 1, lastTriedDate: '2026-10-05' }
  ], '2026-10-03', 'strict'), {
    targets: [], ambiguous: false,
    reason: '已有更晚的苹果试吃记录，红薯未计入试吃'
  })
  assert.deepStrictEqual(foodUnlock.getAutoTrialResult(['苹果', '红薯'], [
    { foodName: '苹果', status: 'tracking', trialCount: 1, lastTriedDate: '2026-10-03' }
  ], '2026-10-03', 'strict'), {
    targets: [], ambiguous: false,
    reason: '苹果正在试吃中，红薯未计入试吃'
  })
})

test('carries the allergy note and date onto the decorated food', () => {
  const food = foodUnlock.decorateFood('鸡蛋', { status: 'allergic', trialCount: 1, allergyNote: '饭后1小时嘴边起疹', allergyDate: '2026-09-12' })
  assert.strictEqual(food.status, 'allergic')
  assert.strictEqual(food.allergyNote, '饭后1小时嘴边起疹')
  assert.strictEqual(food.allergyDate, '2026-09-12')
})

test('relaxed mode logs every eligible food, ignores the one-at-a-time lock and wording changes', () => {
  const trials = [{ foodName: '南瓜', status: 'tracking', trialCount: 1, lastTriedDate: '2026-09-11', logSources: {} }]
  assert.strictEqual(foodUnlock.getActiveFoodName(trials, '2026-09-11', 'relaxed'), '')
  assert.deepStrictEqual(foodUnlock.getAutoTrialTargets(['胡萝卜', '土豆'], trials, '2026-09-11', 'relaxed'), { targets: ['胡萝卜', '土豆'], ambiguous: false })
  assert.deepStrictEqual(foodUnlock.getAutoTrialTargets(['胡萝卜', '土豆'], trials, '2026-09-11', 'strict'), { targets: [], ambiguous: false })
  assert.deepStrictEqual(foodUnlock.getAutoTrialTargets(['胡萝卜', '土豆'], [], '2026-09-11', 'strict'), { targets: [], ambiguous: true })
  assert.deepStrictEqual(foodUnlock.getAutoTrialTargets(['胡萝卜'], [], '2026-09-11', 'strict'), { targets: ['胡萝卜'], ambiguous: false })
  assert.strictEqual(foodUnlock.decorateFood('南瓜', trials[0], 'relaxed').statusText, '再吃 2 天解锁')
  assert.strictEqual(foodUnlock.normalizeMode('anything'), 'strict')
})
