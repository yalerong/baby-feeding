const assert = require('assert')
const fs = require('fs')

const flush = () => new Promise(resolve => setImmediate(resolve))
const row = { time: '09:00', breastMilk: '30', formula: '60', stool: false, stoolDesc: '' }
function world() {
  let definition
  const calls = [], modals = [], toasts = [], ui = [], navigation = []
  const storage = { familyCode: 'FAMILY' }
  global.Page = value => { definition = value }
  global.wx = {
    getStorageSync: key => storage[key] || '',
    removeStorageSync() {},
    showToast: options => { toasts.push(options.title); ui.push('toast') },
    showModal: options => modals.push(options),
    showLoading() { ui.push('loading') }, hideLoading() { ui.push('hideLoading') },
    switchTab(options) { navigation.push(options); ui.push('switchTab') },
    cloud: { callFunction(request) {
      let resolve
      const promise = new Promise(yes => { resolve = yes })
      calls.push({ ...request, resolve })
      return promise
    } }
  }
  const filename = require.resolve('../pages/batch/batch.js')
  delete require.cache[filename]
  require(filename)
  const page = { ...definition, data: { ...JSON.parse(JSON.stringify(definition.data)), date: '2026-11-03', rows: [{ ...row }] },
    setData(patch) { ui.push('setData'); Object.assign(this.data, patch) } }
  return { page, calls, modals, toasts, ui, navigation, storage }
}

async function main() {
  let env = world()
  env.page.data.rows = Array.from({ length: 100 }, () => ({ ...row }))
  env.page.addRow()
  assert.strictEqual(env.page.data.rows.length, 100)
  env.page.data.rows.push({ ...row })
  env.page.submitBatch()
  assert.strictEqual(env.calls.length, 0)
  assert.strictEqual(env.modals.length, 0)
  console.log('ok - batch editor cannot create or submit more than one hundred rows')

  env = world()
  env.page.data.rows.push({ ...row, time: '09:20' })
  env.page.submitBatch()
  env.page.submitBatch()
  assert.strictEqual(env.modals.length, 1, 'rapid taps must not open multiple confirmations')
  env.modals[0].success({ confirm: true })
  env.page.submitBatch()
  assert.strictEqual(env.calls.length, 1)
  assert.strictEqual(env.page.data.saving, true)
  env.calls[0].resolve({ result: { success: false } })
  await flush()
  assert.strictEqual(env.page.data.saving, false)
  env.page.submitBatch()
  assert.strictEqual(env.modals.length, 2, 'a failed save must allow a new attempt')
  console.log('ok - confirmation and saving share one submission guard, released after failure')

  env = world()
  env.page.data.rows.push({ ...row, time: '09:20' })
  env.page.submitBatch()
  env.modals[0].success({ confirm: false })
  env.page.submitBatch()
  assert.strictEqual(env.modals.length, 2)
  env.modals[1].fail(new Error('modal unavailable'))
  env.page.submitBatch()
  assert.strictEqual(env.modals.length, 3)
  console.log('ok - cancelled or failed confirmations unlock the batch editor')

  env = world()
  env.page.data.rows = [{ ...row, time: '', breastMilk: '', formula: '' }]
  env.page.bindTimeChange({ currentTarget: { dataset: { index: 0 } }, detail: { value: '09:00' } })
  env.page.bindStoolChange({ currentTarget: { dataset: { index: 0 } }, detail: { value: true } })
  assert.strictEqual(env.page.data.validCount, 1)
  const template = fs.readFileSync(require('path').join(__dirname, '../pages/batch/batch.wxml'), 'utf8')
  assert.ok(template.includes('disabled="{{saving}}"') && template.includes('loading="{{saving}}"'))
  console.log('ok - time and stool changes update the batch preview and saving disables the button')

  env = world()
  env.page.saveRows('FAMILY', [{ ...row }])
  const firstToken = env.calls[0].data.requestId
  assert.ok(typeof firstToken === 'string' && /^[a-zA-Z0-9_-]{8,80}$/.test(firstToken))
  env.calls[0].resolve({ result: { success: false } })
  await flush()
  env.page.saveRows('FAMILY', [{ ...row }])
  assert.strictEqual(env.calls[1].data.requestId, firstToken, 'identical retries retain the idempotency key')
  env.calls[1].resolve({ result: { success: false } })
  await flush()
  env.page.saveRows('FAMILY', [{ ...row, formula: '100' }])
  assert.notStrictEqual(env.calls[2].data.requestId, firstToken, 'changed quantities create a separate batch token')
  console.log('ok - identical payload retries reuse the request id and changes use a new one')

  const nativeTimeout = global.setTimeout
  const nativeClearTimeout = global.clearTimeout
  const timers = []
  global.setTimeout = callback => { timers.push(callback); return timers.length }
  global.clearTimeout = () => {}
  try {
    env = world()
    env.page.onShow()
    env.page.saveRows('FAMILY', [row])
    env.page.onHide()
    env.page.onUnload()
    const count = env.ui.length
    env.calls[0].resolve({ result: { success: true } })
    await flush()
    assert.strictEqual(env.ui.length, count, 'an unloaded form cannot toast, render, hide other loading or navigate after saving')
    assert.strictEqual(env.page._submitting, true, 'a saved batch remains locked against duplicate submission')
    assert.strictEqual(env.navigation.length, 0)
    console.log('ok - saving after the batch form unloads makes no late UI changes')

    env = world()
    env.page.onShow()
    env.page.saveRows('FAMILY', [row])
    env.page.onHide()
    const hiddenCount = env.ui.length
    env.calls[0].resolve({ result: { success: true } })
    await flush()
    assert.strictEqual(env.ui.length, hiddenCount)
    env.page.onShow()
    const navigate = timers[timers.length - 1]
    assert.strictEqual(typeof navigate, 'function')
    env.page.onHide()
    navigate()
    assert.strictEqual(env.navigation.length, 0, 'a scheduled navigation must recheck visibility when it fires')
    env.page.onShow()
    timers[timers.length - 1]()
    assert.strictEqual(env.navigation.length, 1, 'the saved form can finish when it becomes visible again')
    assert.strictEqual(env.page._submitting, true)
    console.log('ok - hidden completion waits for the batch form and scheduled navigation rechecks visibility')

    env = world()
    env.page.onShow()
    env.page.saveRows('FAMILY', [row])
    env.page.onUnload()
    const failedCount = env.ui.length
    env.calls[0].resolve({ result: { success: false } })
    await flush()
    assert.strictEqual(env.ui.length, failedCount, 'an unloaded form cannot render a late failure')
    console.log('ok - an unloaded batch form ignores a late save failure')
  } finally {
    global.setTimeout = nativeTimeout
    global.clearTimeout = nativeClearTimeout
  }

  for (const change of ['unload', 'family', 'date']) {
    env = world()
    env.page.loadExistingFeedings('2026-11-03')
    if (change === 'unload') env.page.onUnload()
    if (change === 'family') env.storage.familyCode = 'ANOTHER-FAMILY'
    if (change === 'date') env.page.data.date = '2026-11-02'
    env.calls[0].resolve({ result: { success: true, data: [{ date: '2026-11-03', time: '08:00', formula: 90 }] } })
    await flush()
    assert.deepStrictEqual(env.page._existingFeedings, [], change + ' must reject the old feeding read')
  }
  console.log('ok - stale existing-feeding responses are scoped to the live family and date')
}
main().catch(error => { console.error(error); process.exitCode = 1 })
