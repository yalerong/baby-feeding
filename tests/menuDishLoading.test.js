const assert = require('assert')
const menuData = require('../utils/menuData.js')
const menuStorage = require('../utils/menuStorage.js')

let config
global.Page = value => { config = value }
require('../pages/menuDish/menuDish.js')
const birthDate = '2026-03-05', weekStart = '2026-09-21'
const options = { weekStart, dayIndex: '1', mealType: 'lunch', dishIndex: '0' }
const makePlan = () => menuData.generateWeeklyMenu({ birthDate, weekStart, unlockedFoods: ['米粉', '南瓜'] })

function deferred() {
  let resolve, reject
  const promise = new Promise((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}
async function flush() { for (let i = 0; i < 16; i += 1) await Promise.resolve() }
function makePage(seed) {
  const storage = { familyCode: 'A', babyBirthDate: birthDate, ...seed }
  const calls = [], patches = [], removed = [], toasts = [], timers = []
  global.wx = {
    getStorageSync: key => storage[key] || '',
    setStorageSync: (key, value) => { storage[key] = value },
    removeStorageSync: key => { removed.push(key); delete storage[key] },
    showToast: value => toasts.push(value), showLoading() {}, hideLoading() {}, navigateBack() {},
    cloud: { callFunction(request) { const pending = deferred(); calls.push({ ...request, ...pending }); return pending.promise } }
  }
  const page = {
    ...config, data: JSON.parse(JSON.stringify(config.data)),
    setData(patch) {
      patches.push(JSON.parse(JSON.stringify(patch)))
      Object.entries(patch).forEach(([name, value]) => {
        const parts = name.split('.'); let target = this.data
        parts.slice(0, -1).forEach(part => { target = target[part] })
        target[parts[parts.length - 1]] = value
      })
    }
  }
  return { page, storage, calls, patches, removed, toasts, timers }
}
const success = data => ({ result: { success: true, data } })
const trials = [{ foodName: '南瓜', status: 'unlocked', trialCount: 3 }, { foodName: '鸡蛋', status: 'allergic', trialCount: 0 }]
async function validate(host, values = trials) {
  host.calls.filter(call => call.name === 'foodTrial').at(-1).resolve(success(values))
  host.calls.filter(call => call.name === 'weeklyMenu' && call.data.action === 'get').at(-1).resolve(success(null))
  await flush()
}
const tests = []
function test(name, fn) { tests.push({ name, fn }) }

test('shows a valid scoped menu immediately and blocks saves until checks finish', async () => {
  const plan = makePlan()
  const host = makePage({ [menuStorage.planKey('A', weekStart)]: plan })
  host.page.onLoad(options)
  assert.ok(host.page.data.dish, 'cached dish must be visible before any request settles')
  assert.strictEqual(host.page.data.dish.id, plan.days[1].meals.lunch[0].id)
  assert.strictEqual(host.calls.length, 2)
  assert.strictEqual(host.page.data.validating, true)
  host.page.saveDish()
  assert.strictEqual(host.calls.length, 2, 'checking must not allow a write')
  await validate(host)
  assert.strictEqual(host.page.data.canSave, true)
})

test('a valid scoped draft also displays before the network', async () => {
  const host = makePage({ [menuStorage.draftKey('A', weekStart)]: makePlan() })
  host.page.onLoad(options)
  assert.ok(host.page.data.dish)
  assert.strictEqual(host.page.getDraftKey(), menuStorage.draftKey('A', weekStart))
})

test('background checks preserve custom placeholders and every edited form field', async () => {
  const host = makePage({ [menuStorage.planKey('A', weekStart)]: makePlan() })
  host.page.onLoad({ ...options, custom: '1' })
  assert.ok(host.page.data.dish)
  const id = host.page.data.dish.id
  host.page.bindNameInput({ detail: { value: '我的南瓜糊' } })
  host.page.bindTextureInput({ detail: { value: '细泥' } })
  host.page.bindIngredientsInput({ detail: { value: '南瓜\n米粉' } })
  host.page.bindStepsInput({ detail: { value: '蒸熟' } })
  host.page.bindCautionsInput({ detail: { value: '放温' } })
  await validate(host)
  assert.strictEqual(host.page.data.dish.id, id)
  assert.strictEqual(host.page.data.dish.name, '我的南瓜糊')
  assert.strictEqual(host.page.data.dish.texture, '细泥')
  assert.strictEqual(host.page.data.ingredientsText, '南瓜\n米粉')
  assert.strictEqual(host.page.data.stepsText, '蒸熟')
  assert.strictEqual(host.page.data.cautionsText, '放温')
  assert.strictEqual(host.page.data.canSave, true)
})

test('no cache waits for both fresh reads and generates with verified restrictions', async () => {
  const host = makePage()
  host.page.onLoad(options)
  assert.strictEqual(host.page.data.dish, null)
  host.calls.find(call => call.name === 'weeklyMenu').resolve(success(null))
  await flush()
  assert.strictEqual(host.page.data.dish, null)
  host.calls.find(call => call.name === 'foodTrial').resolve(success(trials))
  await flush()
  assert.ok(host.page.data.dish)
  assert.deepStrictEqual(host.page._unlockedFoods, ['南瓜'])
  assert.strictEqual(host.page.data.canSave, true)
})

test('other family and legacy keys remain unread and are not migrated', async () => {
  const old = makePlan(); old.note = 'family A private'
  const host = makePage({ familyCode: 'B', [menuStorage.planKey('A', weekStart)]: old, ['menuPlanCache:' + weekStart]: old, ['menuDraft:' + weekStart]: old })
  host.page.onLoad(options)
  assert.strictEqual(host.page.data.dish, null)
  await validate(host)
  assert.ok(host.page.data.dish)
  assert.notStrictEqual(host.page.data.plan.note, 'family A private')
  assert.ok(host.storage['menuPlanCache:' + weekStart])
  assert.strictEqual(host.removed.length, 0)
})

test('a cache object for the wrong week is rejected', async () => {
  const old = makePlan(); old.weekStart = '2026-09-14'
  const host = makePage({ [menuStorage.planKey('A', weekStart)]: old })
  host.page.onLoad(options)
  assert.strictEqual(host.page.data.dish, null)
})

test('failed validation keeps the cached dish and prevents unknown-status saves', async () => {
  const host = makePage({ [menuStorage.planKey('A', weekStart)]: makePlan() })
  host.page.onLoad(options)
  assert.ok(host.page.data.dish)
  const id = host.page.data.dish.id
  host.calls.find(call => call.name === 'foodTrial').resolve({ result: { success: false, error: 'unavailable' } })
  host.calls.find(call => call.name === 'weeklyMenu').resolve(success(null))
  await flush()
  assert.strictEqual(host.page.data.dish.id, id)
  assert.strictEqual(host.page.data.canSave, false)
  assert.ok(host.page.data.validationError)
  host.page.saveDish()
  assert.strictEqual(host.calls.length, 2)
})

test('retrying validation preserves the edited form and unlocks saving only after success', async () => {
  const host = makePage({ [menuStorage.planKey('A', weekStart)]: makePlan() })
  host.page.onLoad(options)
  host.page.bindNameInput({ detail: { value: '手写菜名' } })
  host.page.bindIngredientsInput({ detail: { value: '南瓜' } })
  host.calls[0].resolve(success(trials))
  host.calls[1].resolve({ result: { success: false, error: 'menu unavailable' } })
  await flush()
  assert.strictEqual(host.page.data.canSave, false)
  host.page.loadDish()
  assert.strictEqual(host.page.data.dish.name, '手写菜名')
  assert.strictEqual(host.page.data.ingredientsText, '南瓜')
  await validate(host)
  assert.strictEqual(host.page.data.canSave, true)
  assert.strictEqual(host.page.data.dish.name, '手写菜名')
  assert.strictEqual(host.page.data.ingredientsText, '南瓜')
})

test('hidden and unloaded details ignore late successes and failures', async () => {
  for (const method of ['onHide', 'onUnload']) {
    const host = makePage({ [menuStorage.planKey('A', weekStart)]: makePlan() })
    host.page.onLoad({ ...options, custom: '1' })
    assert.ok(host.page.data.dish)
    host.page[method]()
    const before = host.patches.length
    host.calls[0].reject(new Error('late trial failure'))
    host.calls[1].resolve(success({ _id: 'late', days: makePlan().days }))
    await flush()
    assert.strictEqual(host.patches.length, before)
    assert.strictEqual(host.removed.length, 0)
  }
})

test('switching families clears the old dish while the new family loads', async () => {
  const host = makePage({ [menuStorage.planKey('A', weekStart)]: makePlan() })
  host.page.onLoad(options)
  assert.ok(host.page.data.dish)
  const oldCalls = host.calls.slice()
  host.storage.familyCode = 'B'
  host.page.loadDish()
  assert.strictEqual(host.page.data.dish, null)
  oldCalls[0].resolve(success(trials)); oldCalls[1].resolve(success(null))
  await flush()
  assert.strictEqual(host.page.data.dish, null)
  assert.strictEqual(host.page.data.canSave, false)
})

test('switching weeks ignores the previous week response', async () => {
  const host = makePage()
  host.page.onLoad(options)
  const previous = host.calls.slice()
  host.page.setData({ weekStart: '2026-09-28' })
  host.page.loadDish()
  previous[0].resolve(success(trials)); previous[1].resolve(success(null))
  await flush()
  assert.strictEqual(host.page.data.dish, null)
  await validate(host)
  assert.strictEqual(host.page.data.plan.weekStart, '2026-09-28')
})

test('saves library then menu, preserves verified empty locks, and clears only scoped keys', async () => {
  const plan = makePlan()
  const key = menuStorage.planKey('A', weekStart)
  const draftKey = menuStorage.draftKey('A', weekStart)
  const bKey = menuStorage.draftKey('B', weekStart)
  const host = makePage({ [key]: plan, [draftKey]: plan, [bKey]: plan, ['menuDraft:' + weekStart]: plan })
  host.page.onLoad(options)
  await validate(host, [])
  host.page.saveDish(); host.page.saveDish()
  const library = host.calls.find(call => call.name === 'customDish')
  assert.ok(library)
  assert.strictEqual(host.calls.filter(call => call.data.action === 'save').length, 1)
  library.resolve({ result: { success: true, _id: 'library-1' } })
  await flush()
  const save = host.calls.find(call => call.name === 'weeklyMenu' && call.data.action === 'save')
  assert.ok(save)
  assert.deepStrictEqual(save.data.data.unlockedFoods, [])
  assert.strictEqual(save.data.data.days[1].meals.lunch[0].libraryId, 'library-1')
  save.resolve({ result: { success: true, _id: 'menu-1' } })
  await flush()
  assert.deepStrictEqual(host.removed.sort(), [draftKey, key].sort())
  assert.ok(host.storage[bKey])
  assert.ok(host.storage['menuDraft:' + weekStart])
  host.page.onUnload()
})

test('a late library save cannot start another write after changing families', async () => {
  const host = makePage({ [menuStorage.planKey('A', weekStart)]: makePlan() })
  host.page.onLoad(options)
  await validate(host)
  host.page.saveDish()
  const library = host.calls.find(call => call.name === 'customDish')
  assert.ok(library)
  host.storage.familyCode = 'B'
  library.resolve({ result: { success: true, _id: 'A-library' } })
  await flush()
  assert.strictEqual(host.calls.filter(call => call.name === 'weeklyMenu' && call.data.action === 'save').length, 0)
  assert.strictEqual(host.removed.length, 0)
})

test('a changed family can reload while the previous family save is pending', async () => {
  const host = makePage({ [menuStorage.planKey('A', weekStart)]: makePlan() })
  host.page.onLoad(options)
  await validate(host)
  host.page.saveDish()
  const oldLibrary = host.calls.find(call => call.name === 'customDish')
  host.storage.familyCode = 'B'
  host.page.loadDish()
  assert.strictEqual(host.page.data.dish, null)
  oldLibrary.resolve({ result: { success: true, _id: 'old-A' } })
  await validate(host)
  assert.strictEqual(host.page.data.canSave, true)
  assert.strictEqual(host.page._saving, false)
  assert.strictEqual(host.calls.filter(call => call.name === 'weeklyMenu' && call.data.action === 'save').length, 0)
})

test('library failure still allows menu save and reports the existing partial-success message', async () => {
  const host = makePage({ [menuStorage.planKey('A', weekStart)]: makePlan() })
  host.page.onLoad(options)
  await validate(host)
  host.page.saveDish()
  host.calls.find(call => call.name === 'customDish').resolve({ result: { success: false, error: 'library unavailable' } })
  await flush()
  const save = host.calls.find(call => call.name === 'weeklyMenu' && call.data.action === 'save')
  assert.ok(save)
  save.resolve({ result: { success: true } })
  await flush()
  assert.ok(host.toasts.some(toast => toast.title.includes('菜单已保存，但没进菜谱库')))
  host.page.onUnload()
})

test('late menu-save success never clears a different family draft or changes its interface', async () => {
  const bDraft = menuStorage.draftKey('B', weekStart)
  const host = makePage({ [menuStorage.planKey('A', weekStart)]: makePlan(), [bDraft]: makePlan() })
  host.page.onLoad(options)
  await validate(host)
  host.page.saveDish()
  host.calls.find(call => call.name === 'customDish').resolve({ result: { success: true, _id: 'lib-A' } })
  await flush()
  const save = host.calls.find(call => call.name === 'weeklyMenu' && call.data.action === 'save')
  assert.ok(save)
  host.page.onHide()
  host.storage.familyCode = 'B'
  const before = host.patches.length
  save.resolve({ result: { success: true } })
  await flush()
  assert.strictEqual(host.patches.length, before)
  assert.strictEqual(host.removed.length, 0)
  assert.ok(host.storage[bDraft])
})

;(async () => {
  let failed = 0
  for (const item of tests) {
    try { await item.fn(); console.log('ok - ' + item.name) }
    catch (err) { failed += 1; console.error('not ok - ' + item.name); console.error(err.message.slice(0, 350)) }
  }
  process.exitCode = failed ? 1 : 0
})()
