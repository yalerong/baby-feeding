const assert = require('assert')
const fs = require('fs')
const path = require('path')
const vm = require('vm')
const dateUtil = require('../utils/date.js')

function deferred() {
  let resolve, reject
  const promise = new Promise((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}
async function flush() { for (let i = 0; i < 8; i += 1) await Promise.resolve() }
const saved = { milestoneId: '6-cognitive-2', status: 'yes', observedDate: '2026-10-01', note: '已有观察' }
const tap = (key, value) => ({ currentTarget: { dataset: { [key]: value } } })
const item = (page, id = saved.milestoneId) => page.data.groups.flatMap(group => group.items).find(row => row.id === id)

function world(options = {}) {
  const storage = { familyCode: 'A', babyBirthDate: dateUtil.addDays(dateUtil.todayStr(), -220) }
  const cache = new Map(), calls = [], writes = [], invalidations = [], patches = [], clipboards = []
  const snapshot = {
    key(parts) { return JSON.stringify(Object.keys(parts).sort().map(key => [key, parts[key]])) },
    read(scope, key) { return cache.has(scope + key) ? JSON.parse(JSON.stringify(cache.get(scope + key))) : null },
    write(scope, key, value) { cache.set(scope + key, JSON.parse(JSON.stringify(value))); writes.push({ scope, key, value }) },
    invalidate(scope) { invalidations.push(scope); for (const key of cache.keys()) if (key.startsWith(scope)) cache.delete(key) }
  }
  const wx = {
    getStorageSync(key) { return storage[key] || '' },
    showToast() {}, stopPullDownRefresh() {},
    setClipboardData(value) { clipboards.push(value.data) },
    cloud: { callFunction(request) {
      calls.push(request.data)
      return options.call ? options.call(request.data) : Promise.resolve({ result: { success: true, data: [saved] } })
    } }
  }
  const file = path.join(__dirname, '../pages/milestones/milestones.js')
  function newPage() {
    let config
    vm.runInNewContext(fs.readFileSync(file, 'utf8'), {
      Page(value) { config = value }, wx, console,
      require(name) { return name.endsWith('/pageSnapshot.js') ? snapshot : require(path.resolve(path.dirname(file), name)) }
    }, { filename: file })
    return { ...config, data: JSON.parse(JSON.stringify(config.data)), setData(patch) { patches.push(patch); Object.assign(this.data, patch) } }
  }
  function seed(records = [saved]) {
    snapshot.write('milestones', snapshot.key({ familyCode: storage.familyCode, birthDate: storage.babyBirthDate }), records)
  }
  return { storage, snapshot, cache, calls, writes, invalidations, patches, clipboards, newPage, seed }
}

const tests = []
function test(name, fn) { tests.push({ name, fn }) }

test('milestone cache is visible before list resolves while edit/save/export remain protected', async () => {
  const pending = deferred(), env = world({ call: () => pending.promise })
  env.seed()
  const page = env.newPage(), reading = page.onShow()
  assert.strictEqual(page.data.loading, false)
  assert.strictEqual(page.data.refreshing, true)
  assert.strictEqual(page.data.recordedCount, 1)
  assert.strictEqual(item(page).note, saved.note)
  page.openObservation(tap('id', saved.milestoneId))
  assert.strictEqual(page.data.editor, null)
  page.copySummary()
  assert.strictEqual(env.clipboards.length, 0)
  page.data.editor = { ...item(page), status: 'yes' }
  await page.saveObservation()
  assert.strictEqual(env.calls.filter(call => call.action === 'set').length, 0)
  page.data.editor = null
  pending.resolve({ result: { success: true, data: [] } }); await reading
  assert.strictEqual(page.data.recordedCount, 0)
  assert.strictEqual(page.data.refreshing, false)
  page.openObservation(tap('id', saved.milestoneId))
  assert.ok(page.data.editor)
})

test('a known empty milestone snapshot still shows the checklist during refresh', async () => {
  const pending = deferred(), env = world({ call: () => pending.promise })
  env.seed([])
  const page = env.newPage(), reading = page.onShow()
  assert.strictEqual(page.data.loading, false)
  assert.strictEqual(page.data.hasSnapshot, true)
  assert.strictEqual(page.data.total, 12)
  assert.strictEqual(page.data.recordedCount, 0)
  pending.resolve({ result: { success: true, data: [] } }); await reading
})

test('no milestone snapshot keeps first-load protection until the network returns', async () => {
  const pending = deferred(), env = world({ call: () => pending.promise })
  const page = env.newPage(), reading = page.onShow()
  assert.strictEqual(page.data.loading, true)
  assert.strictEqual(page.data.refreshing, false)
  page.openObservation(tap('id', saved.milestoneId))
  assert.strictEqual(page.data.editor, null)
  pending.resolve({ result: { success: true, data: [saved] } }); await reading
  assert.strictEqual(page.data.loading, false)
  assert.strictEqual(page.data.loadError, false)
})

test('same-context return preserves selected stage and in-page observations during refresh', async () => {
  const pending = deferred()
  const records = [saved, { ...saved, milestoneId: '9-motor-4', note: '九个月预览记录' }]
  let count = 0
  const env = world({ call: () => ++count === 1 ? Promise.resolve({ result: { success: true, data: records } }) : pending.promise })
  const page = env.newPage()
  await page.onShow()
  page.selectMonth(tap('month', 9))
  page.onHide()
  env.snapshot.invalidate('milestones')
  const reading = page.onShow()
  assert.strictEqual(page.data.selectedMonth, 9)
  assert.strictEqual(item(page, '9-motor-4').note, '九个月预览记录')
  assert.strictEqual(page.data.refreshing, true)
  pending.resolve({ result: { success: true, data: records } }); await reading
})

test('failed background refresh retains observations but blocks editing and export until retry', async () => {
  let down = true
  const env = world({ call: () => down ? Promise.reject(new Error('offline')) : Promise.resolve({ result: { success: true, data: [saved] } }) })
  env.seed()
  const page = env.newPage()
  await page.onShow()
  assert.strictEqual(page.data.loading, false)
  assert.strictEqual(page.data.refreshing, false)
  assert.strictEqual(page.data.hasSnapshot, true)
  assert.strictEqual(page.data.loadError, true)
  assert.strictEqual(item(page).note, saved.note)
  page.openObservation(tap('id', saved.milestoneId)); page.copySummary()
  assert.strictEqual(page.data.editor, null)
  assert.strictEqual(env.clipboards.length, 0)
  down = false
  await page.loadRecords()
  assert.strictEqual(page.data.loadError, false)
  page.openObservation(tap('id', saved.milestoneId))
  assert.ok(page.data.editor)
})

test('hide and unload reject late milestone responses without replacing UI or snapshot', async () => {
  for (const method of ['onHide', 'onUnload']) {
    const pending = deferred(), env = world({ call: () => pending.promise })
    env.seed()
    const page = env.newPage(), reading = page.onShow()
    page[method]()
    const patches = env.patches.length, writes = env.writes.length
    pending.resolve({ result: { success: true, data: [] } }); await reading
    assert.strictEqual(env.patches.length, patches)
    assert.strictEqual(env.writes.length, writes)
    assert.strictEqual(item(page).note, saved.note)
  }
})

test('a family change clears an old editor and observations before its new request completes', async () => {
  const pending = deferred()
  let count = 0
  const env = world({ call: () => ++count === 1 ? Promise.resolve({ result: { success: true, data: [saved] } }) : pending.promise })
  const page = env.newPage()
  await page.onShow()
  page.openObservation(tap('id', saved.milestoneId))
  page.onNoteInput({ detail: { value: '未保存草稿' } })
  env.storage.familyCode = 'B'
  const reading = page.onShow()
  assert.strictEqual(page.data.editor, null)
  assert.strictEqual(page.data.recordedCount, 0)
  assert.strictEqual(page.data.loading, true)
  assert.strictEqual(page._records.length, 0)
  pending.resolve({ result: { success: true, data: [] } }); await reading
})

test('birthday change changes cache identity and prevents an old list from restoring observations', async () => {
  const reads = [], env = world({ call: () => { const read = deferred(); reads.push(read); return read.promise } })
  env.seed()
  const page = env.newPage(), first = page.onShow()
  env.storage.babyBirthDate = dateUtil.addDays(dateUtil.todayStr(), -380)
  const second = page.onShow()
  assert.strictEqual(page.data.recordedCount, 0)
  assert.strictEqual(page.data.selectedMonth, 12)
  reads[0].resolve({ result: { success: true, data: [saved] } }); await first
  assert.strictEqual(page.data.recordedCount, 0)
  reads[1].resolve({ result: { success: true, data: [] } }); await second
  assert.strictEqual(page.data.selectedMonth, 12)
})

test('same-context editor survives onShow and pull-to-refresh without a background overwrite', async () => {
  const env = world(), page = env.newPage()
  await page.onShow()
  page.openObservation(tap('id', saved.milestoneId))
  page.onNoteInput({ detail: { value: '保留草稿' } })
  const calls = env.calls.length
  page.onHide(); await page.onShow(); await page.onPullDownRefresh()
  assert.strictEqual(page.data.editor.note, '保留草稿')
  assert.strictEqual(env.calls.length, calls)
})

test('saved observation updates the milestone snapshot for the next opening', async () => {
  const pending = deferred()
  let reads = 0
  const env = world({ call: data => data.action === 'set' ? Promise.resolve({ result: { success: true } }) : ++reads === 1 ? Promise.resolve({ result: { success: true, data: [saved] } }) : pending.promise })
  const page = env.newPage()
  await page.onShow()
  page.openObservation(tap('id', saved.milestoneId))
  page.onNoteInput({ detail: { value: '已保存的新观察' } })
  await page.saveObservation()
  const next = env.newPage(), reading = next.onShow()
  assert.strictEqual(item(next).note, '已保存的新观察')
  assert.strictEqual(next.data.refreshing, true)
  pending.resolve({ result: { success: true, data: [{ ...saved, note: '已保存的新观察' }] } }); await reading
})

test('a submitted save cannot patch a later family or its current editor', async () => {
  const pending = deferred()
  const env = world({ call: data => data.action === 'set' ? pending.promise : Promise.resolve({ result: { success: true, data: data.familyCode === 'A' ? [saved] : [] } }) })
  const page = env.newPage()
  await page.onShow()
  page.openObservation(tap('id', saved.milestoneId))
  const saving = page.saveObservation()
  env.storage.familyCode = 'B'; await page.onShow()
  assert.strictEqual(page.data.saving, false)
  assert.strictEqual(page.data.recordedCount, 0)
  page.openObservation(tap('id', saved.milestoneId))
  page.onNoteInput({ detail: { value: 'B的新草稿' } })
  const patches = env.patches.length
  pending.resolve({ result: { success: true } }); await saving
  assert.strictEqual(env.patches.length, patches)
  assert.strictEqual(page.data.editor.note, 'B的新草稿')
  assert.strictEqual(page.data.recordedCount, 0)
})

test('a hidden completed save is reconciled when the same page returns', async () => {
  const pending = deferred()
  const env = world({ call: data => data.action === 'set' ? pending.promise : Promise.resolve({ result: { success: true, data: [saved] } }) })
  const page = env.newPage()
  await page.onShow(); page.openObservation(tap('id', saved.milestoneId))
  const saving = page.saveObservation()
  page.onHide()
  const patches = env.patches.length
  pending.resolve({ result: { success: true } }); await saving
  assert.strictEqual(env.patches.length, patches)
  await page.onShow()
  assert.strictEqual(page.data.saving, false)
  assert.strictEqual(page.data.editor, null)
})

;(async () => {
  let failed = 0
  for (const { name, fn } of tests) {
    try { await fn(); console.log('ok - ' + name) }
    catch (err) { failed += 1; console.error('not ok - ' + name); console.error(err.stack) }
  }
  process.exitCode = failed ? 1 : 0
})()
