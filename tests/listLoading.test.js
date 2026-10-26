const assert = require('assert')
const fs = require('fs')
const path = require('path')
const vm = require('vm')

function deferred() {
  let resolve, reject
  const promise = new Promise((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}

async function flush() { for (let i = 0; i < 16; i += 1) await Promise.resolve() }

function makeEnv(options = {}) {
  const storage = { familyCode: 'A', babyBirthDate: '2026-02-24' }
  const snapshots = new Map(), pending = new Map(), timers = new Map()
  const writes = [], invalidations = [], gets = [], calls = [], watchers = [], patches = [], draws = [], notices = []
  let timerId = 0
  const snapshot = {
    key(parts) { return JSON.stringify(Object.keys(parts).sort().map(key => [key, parts[key]])) },
    read(scope, key) { return snapshots.has(scope + key) ? JSON.parse(JSON.stringify(snapshots.get(scope + key))) : null },
    write(scope, key, value) { snapshots.set(scope + key, JSON.parse(JSON.stringify(value))); writes.push({ scope, key, value }) },
    invalidate(scope) {
      invalidations.push(scope)
      for (const key of snapshots.keys()) if (key.startsWith(scope)) snapshots.delete(key)
      for (const key of pending.keys()) if (key.startsWith(scope)) pending.delete(key)
    },
    fetch(scope, key, loader) {
      const id = scope + key
      if (pending.has(id)) return pending.get(id)
      let result
      try { result = loader() } catch (err) { result = Promise.reject(err) }
      const promise = Promise.resolve(result).finally(() => { if (pending.get(id) === promise) pending.delete(id) })
      pending.set(id, promise)
      return promise
    }
  }
  const wx = {
    getStorageSync(key) { return storage[key] || '' },
    setStorageSync(key, value) { storage[key] = value },
    getSystemInfoSync() { return { windowWidth: 375, pixelRatio: 1 } },
    showToast(value) { notices.push(value) }, showLoading() {}, hideLoading() {},
    showModal(value) { value.success({ confirm: true }) },
    showActionSheet(value) { value.success({ tapIndex: 1 }) },
    navigateBack() {}, navigateTo() {}, setNavigationBarTitle() {},
    cloud: {
      database() {
        return {
          collection(name) {
            let skip = 0
            const query = {
              where() { return this }, orderBy() { return this },
              skip(value) { skip = value; return this }, limit() { return this },
              get() {
                gets.push({ name, skip })
                return options.get ? options.get(name, skip) : Promise.resolve({ data: (options.growth || []).slice(skip, skip + 20) })
              }
            }
            if (options.watch !== 'missing') query.watch = handlers => {
              if (options.watch === 'throw') throw new Error('watch unavailable')
              const watcher = { handlers, closed: 0, close() { this.closed += 1 } }
              watchers.push(watcher)
              return watcher
            }
            return query
          }
        }
      },
      callFunction(request) {
        calls.push(request)
        return options.call ? options.call(request) : Promise.resolve({ result: { success: true, data: options.vaccines || [] } })
      }
    }
  }
  function load(relative) {
    let config
    const file = path.join(__dirname, '..', relative)
    vm.runInNewContext(fs.readFileSync(file, 'utf8'), {
      Page(value) { config = value }, wx, console: { error() {} },
      setTimeout(fn, delay) { const id = ++timerId; timers.set(id, { fn, delay }); return id },
      clearTimeout(id) { timers.delete(id) },
      require(name) { return name.endsWith('/pageSnapshot.js') ? snapshot : require(path.resolve(path.dirname(file), name)) }
    }, { filename: file })
    const page = { ...config, data: JSON.parse(JSON.stringify(config.data)),
      setData(patch, callback) { patches.push(patch); Object.assign(this.data, patch); if (callback) callback() }
    }
    if (relative.includes('/growth/')) page.drawChart = rows => draws.push(rows.slice())
    return page
  }
  return { load, storage, snapshot, snapshots, timers, writes, invalidations, gets, calls, watchers, patches, draws, notices }
}

function growthRecords(count = 100) {
  return Array.from({ length: count }, (_, i) => ({ _id: 'g' + i, date: '2026-10-' + String(28 - i % 28).padStart(2, '0'), weight: 8 - i / 100, note: '' }))
}
const vaccines = [{ _id: 'v1', vaccineName: '示例', category: '一类', plannedDate: '2026-03-01', status: 'planned', note: '' }]
const tests = []
function test(name, fn) { tests.push({ name, fn }) }

test('growth shows a precise snapshot before the network and refreshes with zero paged gets', async () => {
  const env = makeEnv(), rows = growthRecords()
  env.snapshot.write('growth', env.snapshot.key({ familyCode: 'A', birthDate: '2026-02-24' }), rows)
  const page = env.load('pages/growth/growth.js')
  page.onShow()
  assert.strictEqual(page.data.recordCount, 100)
  assert.strictEqual(page.data.records.length, 20)
  assert.strictEqual(env.draws[env.draws.length - 1].length, 100)
  assert.strictEqual(env.gets.length, 0)
  const drawCount = env.draws.length
  env.watchers[0].handlers.onChange({ type: 'init', docs: rows })
  assert.strictEqual(env.draws.length, drawCount, 'identical init must not redraw cached data')
  assert.strictEqual(env.timers.size, 0)
  page.onHide()
})

test('growth keeps a full curve but grows visible history in batches of twenty', () => {
  const env = makeEnv(), rows = growthRecords()
  const page = env.load('pages/growth/growth.js')
  page.onShow()
  env.watchers[0].handlers.onChange({ type: 'init', docs: rows })
  assert.strictEqual(env.gets.length, 0)
  assert.strictEqual(page.data.records.length, 20)
  assert.strictEqual(page.data.recordCount, 100)
  for (let i = 0; i < 4; i += 1) page.showMoreHistory()
  assert.strictEqual(page.data.records.length, 100)
  const drawCount = env.draws.length
  env.watchers[0].handlers.onChange({ docs: JSON.parse(JSON.stringify(rows)) })
  assert.strictEqual(env.draws.length, drawCount)
  const changed = JSON.parse(JSON.stringify(rows)); changed[0].note = 'changed'
  env.watchers[0].handlers.onChange({ docs: changed })
  assert.strictEqual(page.data.records[0].note, 'changed')
  assert.strictEqual(env.draws.length, drawCount + 1)
  page.onHide()
})

test('missing, throwing and failed growth watches fall back to complete 20-row pagination once', async () => {
  for (const watch of ['missing', 'throw', 'error']) {
    const env = makeEnv({ watch, growth: growthRecords() })
    const page = env.load('pages/growth/growth.js')
    page.onShow()
    if (watch === 'error') {
      env.watchers[0].handlers.onError(new Error('failed'))
      env.watchers[0].handlers.onError(new Error('again'))
    }
    await flush()
    assert.strictEqual(env.gets.length, 6, watch + ': 100 rows require five full pages and one empty page')
    assert.strictEqual(page.data.recordCount, 100)
    assert.strictEqual(env.timers.size, 0)
    page.onHide()
  }
})

test('growth silent watch falls back after eight seconds and a newer init beats old pagination', async () => {
  const first = deferred(), env = makeEnv({ get: () => first.promise })
  const page = env.load('pages/growth/growth.js')
  page.onShow()
  const timer = [...env.timers.values()][0]
  assert.strictEqual(timer.delay, 8000)
  timer.fn()
  assert.strictEqual(env.gets.length, 1)
  const fresh = [{ _id: 'fresh', date: '2026-10-28', weight: 9 }]
  env.watchers[0].handlers.onChange({ type: 'init', docs: fresh })
  first.resolve({ data: [{ _id: 'old', date: '2026-10-01', weight: 7 }] })
  await flush()
  assert.strictEqual(page.data.records[0]._id, 'fresh')
  page.onHide()
})

test('growth hides without late UI writes, fallback, cache writes or reopened listeners', async () => {
  const first = deferred(), env = makeEnv({ watch: 'missing', get: () => first.promise })
  const page = env.load('pages/growth/growth.js')
  page.onShow(); page.onHide()
  const patches = env.patches.length, writes = env.writes.length
  first.resolve({ data: growthRecords(1) }); await flush()
  assert.strictEqual(env.patches.length, patches)
  assert.strictEqual(env.writes.length, writes)
  assert.strictEqual(env.watchers.length, 0)
  assert.strictEqual(env.timers.size, 0)
})

test('growth family or birthday changes clear old records and reject stale snapshots', () => {
  const env = makeEnv(), page = env.load('pages/growth/growth.js')
  page.onShow(); env.watchers[0].handlers.onChange({ docs: growthRecords(1) })
  env.storage.familyCode = 'B'; page.onShow()
  assert.strictEqual(page.data.records.length, 0)
  const patches = env.patches.length
  env.watchers[0].handlers.onChange({ docs: growthRecords(2) })
  assert.strictEqual(env.patches.length, patches)
  env.storage.babyBirthDate = '2026-03-01'
  env.watchers[1].handlers.onChange({ docs: growthRecords(3) })
  assert.strictEqual(env.patches.length, patches)
  page.onHide()
})

test('vaccine snapshot renders before list and matching list/init only commit one record patch', async () => {
  const pending = deferred(), env = makeEnv({ call: () => pending.promise })
  env.snapshot.write('vaccine', env.snapshot.key({ familyCode: 'A', birthDate: '2026-02-24' }), vaccines)
  const page = env.load('pages/vaccine/vaccine.js')
  page.onShow()
  assert.strictEqual(page.data.records.length, 1)
  assert.strictEqual(page.data.stats.pending, 1)
  assert.strictEqual(page.data.displayRecords.length, 1)
  const commits = () => env.patches.filter(patch => patch.records).length
  const count = commits()
  pending.resolve({ result: { success: true, data: vaccines } }); await flush()
  env.watchers[0].handlers.onChange({ type: 'init', docs: vaccines })
  assert.strictEqual(commits(), count)
  page.onHide()
})

test('vaccine renders records, filters and stats together and field changes still refresh', () => {
  const env = makeEnv(), page = env.load('pages/vaccine/vaccine.js')
  page.data.today = '2026-10-28'
  page.renderRecords(vaccines)
  assert.strictEqual(env.patches.length, 1)
  assert.ok(env.patches[0].records && env.patches[0].displayRecords && env.patches[0].stats)
  page.renderRecords(JSON.parse(JSON.stringify(vaccines)))
  assert.strictEqual(env.patches.length, 1)
  page.renderRecords([{ ...vaccines[0], note: 'new note' }])
  assert.strictEqual(env.patches.length, 2)
})

test('vaccine late empty list cannot initialize or start a watcher after hiding', async () => {
  const pending = deferred(), env = makeEnv({ call: () => pending.promise })
  const page = env.load('pages/vaccine/vaccine.js')
  page.onShow(); page.onHide()
  const count = env.patches.length
  pending.resolve({ result: { success: true, data: [] } }); await flush()
  assert.strictEqual(env.calls.length, 1)
  assert.strictEqual(env.watchers.length, 0)
  assert.strictEqual(env.patches.length, count)
  assert.strictEqual(env.writes.length, 0)
})

test('vaccine family changes clear visible records before the new list arrives', async () => {
  const env = makeEnv({ vaccines }), page = env.load('pages/vaccine/vaccine.js')
  page.onShow(); await flush()
  env.storage.familyCode = 'B'
  page.onShow()
  assert.strictEqual(page.data.records.length, 0)
  page.onHide(); await flush()
})

test('growth add, edit and delete invalidate their snapshot only after successful writes', async () => {
  for (const action of ['add', 'update', 'remove']) {
    for (const success of [false, true]) {
      const env = makeEnv({ call: () => Promise.resolve({ result: { success, error: 'denied' } }) })
      const page = env.load('pages/growthEdit/growthEdit.js')
      Object.assign(page.data, { isEdit: action !== 'add', _id: 'g1', date: '2026-10-28', weight: '8', note: '' })
      if (action === 'remove') page.deleteRecord()
      else page.submit()
      await flush()
      assert.strictEqual(env.calls[0].data.action, action)
      assert.strictEqual(env.invalidations.filter(scope => scope === 'growth').length, success ? 1 : 0)
    }
  }
})

test('vaccine add, edit and delete invalidate their snapshot only after successful writes', async () => {
  for (const action of ['add', 'update', 'remove']) {
    for (const success of [false, true]) {
      const env = makeEnv({ call: () => Promise.resolve({ result: { success, error: 'denied' } }) })
      const page = env.load('pages/vaccineEdit/vaccineEdit.js')
      Object.assign(page.data, { _id: action === 'add' ? '' : 'v1', vaccineName: 'custom', dose: 1, plannedDate: '2026-10-28', note: '' })
      if (action === 'remove') page.deleteRecord()
      else page.submit()
      await flush()
      assert.strictEqual(env.calls[0].data.action, action)
      assert.strictEqual(env.invalidations.filter(scope => scope === 'vaccine').length, success ? 1 : 0)
    }
  }
})

test('a new vaccine watch snapshot beats an older list response', async () => {
  const pending = deferred()
  let requests = 0
  const env = makeEnv({ call: () => ++requests === 1 ? Promise.resolve({ result: { success: true, data: vaccines } }) : pending.promise })
  const page = env.load('pages/vaccine/vaccine.js')
  page.onShow(); await flush()
  page.loadRecords()
  env.watchers[0].handlers.onChange({ docs: [{ ...vaccines[0], note: 'latest' }] })
  pending.resolve({ result: { success: true, data: vaccines } }); await flush()
  assert.strictEqual(page.data.records[0].note, 'latest')
  page.onHide()
})

test('vaccine initialization completing after hide invalidates but cannot reopen the page', async () => {
  const pending = deferred()
  const env = makeEnv({ call: request => request.data.action === 'init' ? pending.promise : Promise.resolve({ result: { success: true, data: [] } }) })
  const page = env.load('pages/vaccine/vaccine.js')
  page.onShow(); await flush()
  assert.strictEqual(env.calls[1].data.action, 'init')
  page.onHide()
  const patches = env.patches.length
  pending.resolve({ result: { success: true } }); await flush()
  assert.strictEqual(env.invalidations.length, 1)
  assert.strictEqual(env.calls.length, 2)
  assert.strictEqual(env.patches.length, patches)
  assert.strictEqual(env.watchers.length, 0)
})

test('vaccine birthday rebuild validates clear success before changing the birthday or cache', async () => {
  for (const success of [false, true]) {
    const env = makeEnv({ call: request => Promise.resolve({ result: { success: request.data.action === 'clear' ? success : true, data: vaccines } }) })
    const page = env.load('pages/vaccine/vaccine.js')
    page.onShow(); await flush()
    page.clearAndReinit('2026-03-01'); await flush()
    assert.strictEqual(env.storage.babyBirthDate, success ? '2026-03-01' : '2026-02-24')
    assert.strictEqual(env.invalidations.length, success ? 1 : 0)
    page.onHide()
  }
})

test('a previous family rebuild cannot change the new family birthday after its clear returns', async () => {
  const pending = deferred()
  const env = makeEnv({ call: request => request.data.action === 'clear' ? pending.promise : Promise.resolve({ result: { success: true, data: vaccines } }) })
  const page = env.load('pages/vaccine/vaccine.js')
  page.onShow(); await flush()
  page.clearAndReinit('2026-03-01')
  env.storage.familyCode = 'B'
  page.onShow(); await flush()
  const patches = env.patches.length
  pending.resolve({ result: { success: true } }); await flush()
  assert.strictEqual(env.storage.babyBirthDate, '2026-02-24')
  assert.strictEqual(env.patches.length, patches)
  page.onHide()
})

;(async () => {
  let failures = 0
  for (const { name, fn } of tests) {
    try { await fn(); console.log('ok - ' + name) }
    catch (err) { failures += 1; console.error('not ok - ' + name); console.error(err.stack) }
  }
  process.exitCode = failures ? 1 : 0
})()
