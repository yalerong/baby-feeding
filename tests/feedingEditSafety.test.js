const assert = require('assert')

function world(record, reply) {
  let definition
  const saves = [], toasts = []
  global.Page = value => { definition = value }
  global.wx = {
    getStorageSync: key => key === 'familyCode' ? 'FAMILY' : '',
    showLoading() {}, hideLoading() {},
    showToast: options => toasts.push(options.title),
    cloud: { callFunction: () => reply ? reply() : Promise.resolve({ result: { success: true, data: [record] } }) }
  }
  delete require.cache[require.resolve('../utils/pageSnapshot.js')]
  delete require.cache[require.resolve('../pages/add/add.js')]
  require('../pages/add/add.js')
  const page = { ...definition, data: { ...JSON.parse(JSON.stringify(definition.data)), isEdit: true, _id: 'record-1', date: '2026-11-03', time: '09:00', breastMilk: '90' },
    setData(patch) { Object.assign(this.data, patch) },
    saveRecord(payload) { saves.push(payload) } }
  return { page, saves, toasts, saveRecord: definition.saveRecord }
}

const original = stoolDesc => ({ _id: 'record-1', familyCode: 'FAMILY', date: '2026-11-03', time: '09:00', stool: true, stoolDesc, images: ['cloud://family/feeding-photos/1793700000000-abc123.jpg'] })
const tests = []
function test(name, fn) { tests.push({ name, fn }) }

test('an edit cannot overwrite an unloaded record with the default empty form', () => {
  const env = world()
  env.page.submit()
  assert.strictEqual(env.saves.length, 0)
  assert.ok(env.toasts.length > 0)
})

test('an edit cannot overwrite a record after its read fails', async () => {
  const env = world(null, () => Promise.reject(new Error('offline')))
  await env.page.loadRecord('record-1')
  env.page.submit()
  assert.strictEqual(env.saves.length, 0)
})

test('a loaded edit keeps photos and unrecognized stool notes when only milk changes', async () => {
  const record = original('稀，黄，少量，有奶瓣')
  const env = world(record)
  await env.page.loadRecord('record-1')
  env.page.setData({ breastMilk: '120' })
  env.page.submit()
  assert.strictEqual(env.saves.length, 1)
  assert.strictEqual(env.saves[0].stoolDesc, record.stoolDesc)
  assert.deepStrictEqual(env.saves[0].images, record.images)
})

test('optional stool fields restore by their own values rather than their positions', async () => {
  for (const desc of ['黄，中', '成型，多', '非黄色', '少']) {
    const env = world(original(desc))
    await env.page.loadRecord('record-1')
    const parts = desc.split('，')
    assert.strictEqual(env.page.data.stoolTextureIndex, env.page.data.stoolTextures.findIndex(value => parts.includes(value)))
    assert.strictEqual(env.page.data.stoolColorIndex, env.page.data.stoolColors.findIndex(value => parts.includes(value)))
    assert.strictEqual(env.page.data.stoolAmountIndex, env.page.data.stoolAmounts.findIndex(value => parts.includes(value)))
    assert.strictEqual(env.page.buildStoolDesc(), desc)
  }
})

test('explicit stool picker changes still build the new description', async () => {
  const env = world(original('稀，黄，少量，有奶瓣'))
  await env.page.loadRecord('record-1')
  env.page.bindStoolTextureChange({ detail: { value: '2' } })
  env.page.bindStoolAmountChange({ detail: { value: '1' } })
  assert.strictEqual(env.page.buildStoolDesc(), '成型，黄，中')
})

test('a delayed successful save cannot navigate away from a different page', async () => {
  const env = world(original('成型，黄，中'))
  const timers = []
  let navigated = 0
  const originalTimeout = global.setTimeout
  global.setTimeout = callback => { timers.push(callback); return timers.length }
  try {
    wx.removeStorageSync = () => {}
    wx.navigateBack = () => { navigated += 1 }
    wx.cloud.callFunction = () => Promise.resolve({ result: { success: true, _id: 'new-record' } })
    env.page.data.isEdit = false
    env.page._addActive = true
    env.page._addFamilyCode = 'FAMILY'
    env.page.syncSolidFoodTrial = () => Promise.resolve({ status: 'noop', message: '' })
    env.saveRecord.call(env.page, { familyCode: 'FAMILY', date: '2026-11-03', time: '09:00', breastMilk: 90, formula: 0, total: 90, images: [] })
    await new Promise(resolve => setImmediate(resolve))
    assert.strictEqual(timers.length, 1)
    env.page.onHide()
    timers[0]()
    assert.strictEqual(navigated, 0)
    env.page.onShow()
    assert.strictEqual(navigated, 1, 'returning to the saved form should complete its own navigation')
  } finally {
    global.setTimeout = originalTimeout
  }
})

test('trial synchronization stays with the saved record family after local storage changes', async () => {
  const env = world()
  const calls = []
  wx.getStorageSync = key => key === 'familyCode' ? 'FAMILY-B' : ''
  wx.cloud.callFunction = request => {
    calls.push(request)
    return Promise.resolve({ result: { success: true, data: request.data.action === 'list' ? [] : { trialCount: 1 }, settings: { trialMode: 'strict' } } })
  }
  const result = await env.page.syncSolidFoodTrial({ before: null, after: {
    familyCode: 'FAMILY-A', date: require('../utils/date.js').todayStr(), solidFood: true,
    solidFoodDishName: '米糊', solidFoodFoods: ['米粉'], solidFoodGrams: 10
  }, recordId: 'saved-1', silent: true })
  assert.strictEqual(result.status, 'synced')
  assert.ok(calls.length >= 2)
  assert.ok(calls.every(call => call.data.familyCode === 'FAMILY-A'))
})

;(async () => {
  let failed = 0
  for (const entry of tests) {
    try { await entry.fn(); console.log('ok - ' + entry.name) }
    catch (error) { failed += 1; console.error('not ok - ' + entry.name); console.error(error) }
  }
  process.exitCode = failed ? 1 : 0
})()
