const assert = require('assert')
const menuData = require('../utils/menuData.js')
const dateUtil = require('../utils/date.js')
dateUtil.todayStr = () => '2026-10-26'

let config
global.Page = value => { config = value }
require('../pages/menu/menu.js')

function deferred() {
  let resolve, reject
  const promise = new Promise((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}

async function flush() { for (let i = 0; i < 16; i += 1) await Promise.resolve() }

function makePage(data) {
  const storage = { familyCode: 'A', babyBirthDate: '2026-02-24', menuGuideDismissed: true }
  const calls = [], patches = [], watches = [], toasts = []
  global.wx = {
    getStorageSync: key => storage[key] || '',
    setStorageSync: (key, value) => { storage[key] = value },
    removeStorageSync: key => { delete storage[key] },
    showToast: value => toasts.push(value),
    cloud: {
      callFunction(request) {
        const pending = deferred()
        calls.push({ ...request, ...pending })
        if (request.name === 'customDish') pending.resolve({ result: { success: true, data: [] } })
        return pending.promise
      },
      database() {
        return { collection() { return {
          where() { return this },
          watch(callbacks) { const watcher = { callbacks, closed: false, close() { this.closed = true } }; watches.push(watcher); return watcher }
        } } }
      }
    }
  }
  const page = {
    ...config,
    data: { ...JSON.parse(JSON.stringify(config.data)), ...data },
    setData(patch, callback) { patches.push(JSON.parse(JSON.stringify(patch))); Object.assign(this.data, patch); if (callback) callback() }
  }
  return { page, storage, calls, patches, watches, toasts }
}

const trialResult = foods => ({ result: { success: true, settings: { trialMode: 'strict' }, data: foods || [
  { foodName: '南瓜', trialCount: 3, status: 'unlocked' },
  { foodName: '鸡蛋', trialCount: 0, status: 'allergic' }
] } })
const weekResult = data => ({ result: { success: true, data: data || null } })
const originals = Object.fromEntries(['generateWeeklyMenu', 'generateMonthlyMenu', 'getDishCatalog'].map(name => [name, menuData[name]]))
function spy(name) {
  const calls = []
  menuData[name] = (...args) => { calls.push(args[0]); return originals[name](...args) }
  return calls
}
async function loaded(host) {
  host.calls.find(call => call.name === 'foodTrial').resolve(trialResult())
  await flush()
  host.calls.find(call => call.name === 'weeklyMenu').resolve(weekResult())
  await flush()
}

const tests = []
function test(name, fn) { tests.push({ name, fn }) }

test('starts week and trial reads together and waits for restrictions before generating', async () => {
  const weekly = spy('generateWeeklyMenu'), monthly = spy('generateMonthlyMenu'), catalog = spy('getDishCatalog')
  const host = makePage()
  host.page.onShow()
  const week = host.calls.find(call => call.name === 'weeklyMenu')
  assert.ok(week, 'weeklyMenu GET must start before foodTrial has returned')
  assert.ok(host.calls.find(call => call.name === 'foodTrial'))
  assert.strictEqual(weekly.length, 0, 'generation must wait for fresh restrictions')
  week.resolve(weekResult())
  await flush()
  assert.strictEqual(host.page.data.currentPlan, null)
  host.calls.find(call => call.name === 'foodTrial').resolve(trialResult())
  await flush()
  assert.ok(host.page.data.currentPlan)
  assert.deepStrictEqual(weekly[0].excludedIngredients, ['鸡蛋'])
  assert.deepStrictEqual(weekly[0].unlockedFoods, ['南瓜'])
  assert.strictEqual(monthly.length, 0)
  assert.strictEqual(catalog.length, 0)
  assert.deepStrictEqual(host.page.data.trialFoods, [])
  assert.ok(host.page.data.weekDays.every(day => !Object.hasOwn(day, 'meals')))
  assert.ok(host.page.data.selectedDay.meals)
  const navBytes = Buffer.byteLength(JSON.stringify(host.page.data.weekDays))
  const previousRows = host.page.data.currentPlan.days.map((day, index) => ({
    ...day, shortDate: day.date.substring(5), weekday: host.page.getWeekdayLabel(day.date), selected: index === host.page.data.selectedDayIndex
  }))
  const oldBytes = Buffer.byteLength(JSON.stringify(previousRows))
  assert.ok(navBytes < oldBytes / 4)
  console.log('menu navigation payload: ' + oldBytes + ' -> ' + navBytes + ' bytes')
})

test('builds extra views only when entered and rebuilds changed month constraints', async () => {
  const monthly = spy('generateMonthlyMenu')
  const host = makePage()
  host.page.onShow()
  await loaded(host)
  host.page.switchView({ currentTarget: { dataset: { mode: 'month' } } })
  assert.strictEqual(monthly.length, 1)
  host.page.switchView({ currentTarget: { dataset: { mode: 'week' } } })
  host.page.buildMonth(host.page.data.monthStart)
  assert.strictEqual(monthly.length, 1)
  host.page.switchView({ currentTarget: { dataset: { mode: 'month' } } })
  assert.strictEqual(monthly.length, 1, 'unchanged monthly view is reused')
  const refreshing = host.page.loadFoodTrials()
  host.calls.filter(call => call.name === 'foodTrial').at(-1).resolve(trialResult([{ foodName: '南瓜', status: 'allergic', trialCount: 0 }]))
  await refreshing
  host.page.buildMonth(host.page.data.monthStart)
  assert.strictEqual(monthly.length, 2)
  assert.deepStrictEqual(monthly[1].excludedIngredients, ['南瓜'])
  host.page.enterCatalog()
  assert.ok(host.page.data.catalogDishes.length)
  host.page.switchView({ currentTarget: { dataset: { mode: 'trial' } } })
  assert.ok(host.page.data.trialFoods.some(food => food.name === '南瓜' && food.status === 'allergic'))
})

test('late week responses cannot replace a newer selected week', async () => {
  const host = makePage()
  host.page.onShow()
  host.calls.find(call => call.name === 'foodTrial').resolve(trialResult())
  await flush()
  const old = host.calls.find(call => call.name === 'weeklyMenu')
  host.page.nextWeek()
  const newer = host.calls.filter(call => call.name === 'weeklyMenu').at(-1)
  newer.resolve(weekResult({ _id: 'new', note: 'new' }))
  await flush()
  old.resolve(weekResult({ _id: 'old', note: 'old' }))
  await flush()
  assert.strictEqual(host.page.data.savedDocId, 'new')
  assert.strictEqual(host.page.data.currentPlan.weekStart, newer.data.weekStart)
  assert.strictEqual(host.watches.length, 1)
})

test('entering month or trial before restrictions arrive does not build unrestricted content', async () => {
  const monthly = spy('generateMonthlyMenu')
  const host = makePage()
  host.page.onShow()
  host.page.switchView({ currentTarget: { dataset: { mode: 'month' } } })
  assert.strictEqual(monthly.length, 0)
  host.page.switchView({ currentTarget: { dataset: { mode: 'trial' } } })
  assert.strictEqual(host.page.data.trialFoods.length, 0)
  host.calls.find(call => call.name === 'foodTrial').resolve(trialResult())
  await flush()
  assert.ok(host.page.data.trialFoods.some(food => food.name === '鸡蛋' && food.status === 'allergic'))
})

test('a failed week read waits for restrictions and keeps the local draft', async () => {
  const weekly = spy('generateWeeklyMenu')
  const host = makePage()
  host.page.onShow()
  const week = host.calls.find(call => call.name === 'weeklyMenu')
  const draft = originals.generateWeeklyMenu({ birthDate: host.storage.babyBirthDate, weekStart: week.data.weekStart, unlockedFoods: ['南瓜'] })
  draft.note = 'unsaved'
  host.storage[host.page.getDraftKey(week.data.weekStart)] = draft
  week.reject(new Error('expected week read failure'))
  await flush()
  assert.strictEqual(weekly.length, 0)
  host.calls.find(call => call.name === 'foodTrial').resolve(trialResult())
  await flush()
  assert.deepStrictEqual(weekly[0].excludedIngredients, ['鸡蛋'])
  assert.strictEqual(host.page.data.currentPlan.note, 'unsaved')
  assert.strictEqual(host.page.data.dirty, true)
})

test('a previous family response cannot populate a new family while it is loading', async () => {
  const host = makePage()
  host.page.onShow()
  const oldTrial = host.calls.find(call => call.name === 'foodTrial')
  const oldWeek = host.calls.find(call => call.name === 'weeklyMenu')
  host.page.onHide()
  host.storage.familyCode = 'B'
  host.page.onShow()
  oldTrial.resolve(trialResult())
  oldWeek.resolve(weekResult({ _id: 'A-save', note: 'A plan' }))
  await flush()
  assert.strictEqual(host.page.data.currentPlan, null)
  assert.strictEqual(host.page.data.foodTrials.length, 0)
  assert.strictEqual(host.watches.length, 0)
})

test('hidden and unloaded pages ignore late read successes and failures', async () => {
  for (const method of ['onHide', 'onUnload']) {
    const host = makePage()
    host.page.onShow()
    host.page[method]()
    const before = host.patches.length
    host.calls.find(call => call.name === 'weeklyMenu').reject(new Error('late week failure'))
    host.calls.find(call => call.name === 'foodTrial').reject(new Error('late trial failure'))
    await flush()
    assert.strictEqual(host.patches.length, before)
    assert.strictEqual(host.watches.length, 0)
    assert.strictEqual(host.toasts.length, 0)
  }
})

test('queued render callbacks do not update a page after it is hidden', async () => {
  const host = makePage()
  const callbacks = []
  const setData = host.page.setData
  host.page.setData = function (patch, callback) {
    setData.call(this, patch)
    if (callback) callbacks.push(callback)
  }
  host.page.onShow()
  await loaded(host)
  assert.ok(callbacks.length)
  host.page.onHide()
  const before = host.patches.length
  callbacks.forEach(callback => callback())
  assert.strictEqual(host.patches.length, before)
})

test('family changes clear visible data immediately and ignore the previous family', async () => {
  const host = makePage()
  host.page.onShow()
  await loaded(host)
  host.page.onHide()
  host.storage.familyCode = 'B'
  host.page.onShow()
  assert.strictEqual(host.page.data.currentPlan, null)
  assert.deepStrictEqual(host.page.data.foodTrials, [])
  assert.deepStrictEqual(host.page.data.libraryDishes, [])
  assert.deepStrictEqual(host.page.data.weekDays, [])
  const before = host.patches.length
  host.watches[0].callbacks.onChange({ docs: [{ _id: 'A-old', note: 'old' }] })
  assert.strictEqual(host.patches.length, before)
})

test('local drafts win over saved menus and watchers never overwrite dirty plans', async () => {
  const host = makePage()
  host.page.onShow()
  const week = host.calls.find(call => call.name === 'weeklyMenu')
  assert.ok(week)
  const draft = originals.generateWeeklyMenu({ birthDate: host.storage.babyBirthDate, weekStart: week.data.weekStart, unlockedFoods: ['南瓜'] })
  draft.note = 'local draft'
  host.storage[host.page.getDraftKey(week.data.weekStart)] = draft
  host.calls.find(call => call.name === 'foodTrial').resolve(trialResult())
  week.resolve(weekResult({ _id: 'saved', note: 'saved' }))
  await flush()
  assert.strictEqual(host.page.data.currentPlan.note, 'local draft')
  assert.strictEqual(host.page.data.dirty, true)
  host.watches[0].callbacks.onChange({ docs: [{ _id: 'new-save', note: 'remote' }] })
  assert.strictEqual(host.page.data.currentPlan.note, 'local draft')
})

test('standalone trial reload still updates constraints without constructing hidden cards', async () => {
  const host = makePage({ today: '2026-10-26', birthDate: '2026-02-24', currentAgeMonth: 8 })
  const read = host.page.loadFoodTrials()
  host.calls[0].resolve(trialResult())
  await read
  assert.deepStrictEqual(host.page.data.excludedIngredients, ['鸡蛋'])
  assert.deepStrictEqual(host.page.data.unlockedFoods, ['南瓜'])
  assert.deepStrictEqual(host.page.data.trialFoods, [])
})

test('an older standalone trial reload cannot override a newer reload', async () => {
  const host = makePage({ today: '2026-10-26', birthDate: '2026-02-24' })
  const first = host.page.loadFoodTrials()
  const second = host.page.loadFoodTrials()
  host.calls[1].resolve(trialResult([{ foodName: '南瓜', status: 'allergic', trialCount: 0 }]))
  await second
  host.calls[0].resolve(trialResult())
  await first
  assert.deepStrictEqual(host.page.data.excludedIngredients, ['南瓜'])
  assert.strictEqual(host.page._trialLoading, false)
})

;(async () => {
  let failed = 0
  for (const item of tests) {
    try { await item.fn(); console.log('ok - ' + item.name) }
    catch (err) { failed += 1; console.error('not ok - ' + item.name); console.error(err.message) }
    finally { Object.assign(menuData, originals) }
  }
  process.exitCode = failed ? 1 : 0
})()
