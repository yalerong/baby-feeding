const assert = require('assert')
const dateUtil = require('../utils/date.js')
const menuData = require('../utils/menuData.js')
const menuStorage = require('../utils/menuStorage.js')
const flush = () => new Promise(resolve => setImmediate(resolve))

function world(options = {}) {
  const storage = new Map([['familyCode', 'ADD-A'], ['babyBirthDate', '2026-02-24']])
  const calls = []
  const updates = []
  let definition
  global.Page = value => { definition = value }
  global.wx = {
    getStorageSync: key => storage.get(key) || '',
    setNavigationBarTitle() {}, showLoading() {}, hideLoading() {}, showToast() {},
    cloud: { callFunction(request) {
      let resolve
      let reject
      const promise = new Promise((yes, no) => { resolve = yes; reject = no })
      calls.push({ ...request, resolve, reject })
      return promise
    } }
  }
  const filename = require.resolve('../pages/add/add.js')
  delete require.cache[require.resolve('../utils/pageSnapshot.js')]
  delete require.cache[filename]
  require(filename)
  const page = { ...definition, data: JSON.parse(JSON.stringify(definition.data)),
    setData(patch, callback) { updates.push(patch); Object.assign(this.data, patch); if (callback) callback() } }
  page.onLoad(options)
  page.onShow()
  return { page, storage, calls, updates }
}

function candidateCalls(env) {
  return env.calls.filter(call => call.name !== 'getRecords' || call.data.startDate === dateUtil.addDays(dateUtil.todayStr(), -30))
}

function resolveCandidates(env, records = []) {
  for (const call of candidateCalls(env)) {
    call.resolve({ result: { success: true, data: call.name === 'getRecords' ? records : call.name === 'weeklyMenu' ? null : [], settings: { trialMode: 'strict' } } })
  }
}

const tests = []
function test(name, fn) { tests.push({ name, fn }) }

test('plain milk entry opens with only the required nearby feeding read', async () => {
  const env = world()
  await flush()
  assert.strictEqual(env.calls.length, 1)
  assert.strictEqual(env.calls[0].name, 'getRecords')
  assert.strictEqual(env.calls[0].data.startDate, dateUtil.addDays(dateUtil.todayStr(), -1))
  assert.strictEqual(env.page.data.solidFood, false)
  assert.deepStrictEqual(env.page.data.solidFoodFrequentDishes, [])
  assert.deepStrictEqual(env.page.data.solidFoodQuickTags, [])
  console.log('measurement - plain milk first-open cloud calls: ' + env.calls.length)
})

test('the first solid-food toggle shows local choices and coalesces pending sources', async () => {
  const env = world()
  env.page.bindSolidFoodChange({ detail: { value: true } })
  assert.ok(env.page.data.solidFoodFrequentDishes.length > 0, 'local choices should appear before any network result')
  await flush()
  assert.strictEqual(candidateCalls(env).length, 4)
  env.page.bindSolidFoodChange({ detail: { value: false } })
  env.page.bindSolidFoodChange({ detail: { value: true } })
  env.page.onShow()
  await flush()
  assert.strictEqual(candidateCalls(env).length, 4, 'toggles and repeated show must share pending candidate and trial requests')
})

test('late candidate results preserve the current food name, grams and selected foods', async () => {
  const env = world()
  env.page.bindSolidFoodChange({ detail: { value: true } })
  await flush()
  env.page.setData({ solidFoodName: '家长刚选的菜', solidFoodCustomName: '家长刚选的菜', solidFoodGrams: '12.5', solidFoodFoods: ['米粉', '胡萝卜'] })
  resolveCandidates(env, [{ date: dateUtil.todayStr(), solidFood: true, solidFoodDishName: '历史菜名', solidFoodGrams: 30, solidFoodFoods: ['菠菜'] }])
  await flush()
  assert.strictEqual(env.page.data.solidFoodName, '家长刚选的菜')
  assert.strictEqual(env.page.data.solidFoodCustomName, '家长刚选的菜')
  assert.strictEqual(env.page.data.solidFoodGrams, '12.5')
  assert.deepStrictEqual(env.page.data.solidFoodFoods, ['米粉', '胡萝卜'])
})

test('completed choices are reused while returning to solids refreshes the trial state', async () => {
  const env = world()
  env.page.bindSolidFoodChange({ detail: { value: true } })
  await flush()
  resolveCandidates(env)
  await flush()
  env.page.bindSolidFoodChange({ detail: { value: false } })
  env.page.bindSolidFoodChange({ detail: { value: true } })
  await flush()
  assert.strictEqual(candidateCalls(env).length, 4, 'completed choices should be reused between toggles')
  assert.strictEqual(typeof env.page.onHide, 'function')
  env.page.onHide()
  env.page.onShow()
  await flush()
  assert.strictEqual(candidateCalls(env).filter(call => call.name === 'foodTrial').length, 2)
  assert.strictEqual(candidateCalls(env).filter(call => call.name !== 'foodTrial').length, 3)
})

test('milk edits fetch only their record and solid edits initialize choices after loading', async () => {
  for (const solidFood of [false, true]) {
    const env = world({ id: 'record-1' })
    await flush()
    assert.strictEqual(env.calls.length, 1)
    assert.strictEqual(env.calls[0].data._id, 'record-1')
    env.calls[0].resolve({ result: { success: true, data: [{ _id: 'record-1', date: dateUtil.todayStr(), time: '09:00', formula: 90, solidFood, solidFoodDishName: '编辑原菜名', solidFoodGrams: 20, solidFoodFoods: ['米粉'] }] } })
    await flush()
    assert.strictEqual(candidateCalls(env).filter(call => !call.data._id).length, solidFood ? 4 : 0)
    assert.strictEqual(env.page.data.solidFoodName, '编辑原菜名')
    assert.strictEqual(env.page.data.solidFoodGrams, '20')
  }
})

test('hidden, unloaded and switched-family read results cannot update the old page', async () => {
  for (const end of ['hide', 'unload', 'family']) {
    const env = world()
    env.page.bindSolidFoodChange({ detail: { value: true } })
    await flush()
    if (end === 'family') env.storage.set('familyCode', 'ADD-B')
    else if (end === 'hide') env.page.onHide()
    else env.page.onUnload()
    const updates = env.updates.length
    for (const call of env.calls) call.resolve({ result: { success: true, data: [], settings: { trialMode: 'strict' } } })
    await flush()
    assert.strictEqual(env.updates.length, updates)
  }
})

test('returning to an unfinished edit reuses the read and restores the record', async () => {
  const env = world({ id: 'record-pending' })
  await flush()
  env.page.onHide()
  env.page.onShow()
  await flush()
  assert.strictEqual(env.calls.length, 1, 'an unfinished record request should be shared across the return')
  env.calls[0].resolve({ result: { success: true, data: [{ _id: 'record-pending', date: dateUtil.todayStr(), time: '10:00', formula: 120 }] } })
  await flush()
  assert.strictEqual(env.page.data.formula, '120')
  assert.strictEqual(env.page.data.date, dateUtil.todayStr())
})

test('pending choices can finish for the active return without duplicate requests', async () => {
  const env = world()
  env.page.bindSolidFoodChange({ detail: { value: true } })
  await flush()
  env.page.onHide()
  env.page.onShow()
  await flush()
  assert.strictEqual(candidateCalls(env).length, 4)
  resolveCandidates(env, [{ date: dateUtil.todayStr(), solidFood: true, solidFoodDishName: '返回后的候选', solidFoodGrams: 20 }])
  await flush()
  assert.ok(env.page.data.solidFoodFrequentDishes.some(dish => dish.name === '返回后的候选'))
})

test('solid choices read only the family-scoped draft key and ignore unowned legacy drafts', async () => {
  const env = world()
  const today = dateUtil.todayStr()
  const weekStart = menuData.getDefaultPlanningWeekStart({ birthDate: '2026-02-24', today })
  const plan = name => ({ days: [{ date: today, meals: { lunch: [{ isCustom: true, name, ingredients: ['胡萝卜'] }] } }] })
  env.storage.set('menuDraft:' + weekStart, plan('旧家庭无归属草稿'))
  env.storage.set(menuStorage.draftKey('ADD-A', weekStart), plan('本家庭草稿'))
  env.page.bindSolidFoodChange({ detail: { value: true } })
  await flush()
  resolveCandidates(env)
  await flush()
  const names = env.page.data.solidFoodFrequentDishes.map(dish => dish.name)
  assert.ok(names.includes('本家庭草稿'))
  assert.ok(!names.includes('旧家庭无归属草稿'))
  assert.ok(env.storage.has('menuDraft:' + weekStart), 'the unowned old draft must remain untouched')
})

;(async () => {
  let failed = 0
  for (const entry of tests) {
    try { await entry.fn(); console.log('ok - ' + entry.name) }
    catch (error) { failed += 1; console.error('not ok - ' + entry.name); console.error(error) }
  }
  process.exitCode = failed ? 1 : 0
})()
