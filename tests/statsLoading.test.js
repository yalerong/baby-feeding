const assert = require('assert')
const Module = require('module')

function deferred() {
  let resolve, reject
  const promise = new Promise((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}

const flush = () => new Promise(resolve => setImmediate(resolve))
const tap = range => ({ currentTarget: { dataset: { range } } })
const daily = (date, total = 600) => ({ date, breast: total / 2, formula: total / 2, total,
  feedingCount: 5, stoolCount: 1, solidCount: 1, solidGrams: 30 })

function makeWorld(useRealSnapshot = false) {
  const world = { familyCode: 'stats-a', today: '2026-10-25', calls: [], writes: [], snapshots: new Map(), pending: new Map(), storage: new Map(), diskOperations: [], loading: 0, hidden: 0, toasts: [] }
  let snapshot = {
    key(parts) { return JSON.stringify(Object.keys(parts).sort().map(key => [key, parts[key]])) },
    read(scope, key) { return world.snapshots.get(scope + key) || null },
    write(scope, key, value) { world.writes.push({ scope, key, value }); world.snapshots.set(scope + key, value) },
    fetch(scope, key, loader) {
      const id = scope + key
      if (world.pending.has(id)) return world.pending.get(id)
      const promise = Promise.resolve().then(loader)
      world.pending.set(id, promise)
      const clear = () => { if (world.pending.get(id) === promise) world.pending.delete(id) }
      promise.then(clear, clear)
      return promise
    }
  }
  if (useRealSnapshot) {
    const snapshotPath = require.resolve('../utils/pageSnapshot.js')
    delete require.cache[snapshotPath]
    const real = require(snapshotPath)
    snapshot = { ...real, write(scope, key, value) { world.writes.push({ scope, key, value }); real.write(scope, key, value) } }
  }
  world.snapshot = snapshot
  world.key = range => snapshot.key({ operation: 'getStats', familyCode: world.familyCode, range, cutoffDate: world.today })
  world.seed = (range, rows) => world.snapshots.set('stats' + world.key(range), rows)
  world.resolve = (index, rows) => world.calls[index].resolve({ result: { success: true, dailyStats: rows } })
  world.install = () => {
    global.wx = {
      getStorageSync(key) { return key === 'familyCode' ? world.familyCode : world.storage.get(key) },
      setStorage(options) { world.diskOperations.push(() => { world.storage.set(options.key, options.data); options.success() }) },
      removeStorage(options) { world.diskOperations.push(() => { world.storage.delete(options.key); options.success() }) },
      showLoading() { world.loading += 1 },
      hideLoading() { world.hidden += 1 },
      showToast(options) { world.toasts.push(options.title) },
      cloud: { callFunction(options) { const read = deferred(); world.calls.push({ ...read, options }); return read.promise } }
    }
  }
  const originalLoad = Module._load
  const filename = require.resolve('../pages/stats/stats.js')
  let config
  global.Page = value => { config = value }
  try {
    delete require.cache[filename]
    Module._load = function(request, parent, isMain) {
      if (request === '../../utils/pageSnapshot.js') return snapshot
      if (request === '../../utils/date.js') return { todayStr: () => world.today }
      return originalLoad.call(this, request, parent, isMain)
    }
    require(filename)
  } finally { Module._load = originalLoad }
  world.page = overrides => {
    world.install()
    const patches = []
    const page = { ...config, data: { ...JSON.parse(JSON.stringify(config.data)), ...overrides },
      setData(patch, callback) { patches.push(patch); Object.assign(this.data, patch); if (callback) callback() },
      drawChart(rows) { this.draws.push(rows) }, draws: [], patches }
    return page
  }
  return world
}

let failures = 0
async function test(name, fn) {
  try { await fn(); console.log('ok - ' + name) }
  catch (err) { failures += 1; console.error('not ok - ' + name); console.error(err.message) }
}

;(async () => {
  await test('all-time stats send monthly summaries rather than three full daily arrays', async () => {
    const world = makeWorld(), page = world.page({ range: 'all' })
    const rows = Array.from({ length: 365 }, (_, i) => daily(new Date(Date.UTC(2025, 0, i + 1)).toISOString().slice(0, 10)))
    page.onShow()
    await flush()
    world.resolve(0, rows)
    await flush()
    const bytes = page.patches.reduce((sum, patch) => sum + Buffer.byteLength(JSON.stringify(patch)), 0)
    assert.ok(bytes < 16000, '365-day month view must send under 16KB; got ' + bytes)
    assert.strictEqual(page.data.viewMode, 'monthList')
    assert.strictEqual(page.data.monthList.length, 12)
    assert.deepStrictEqual(page.data.displayDailyStats, [])
    assert.strictEqual(page.data.allDailyStats, undefined)
    assert.strictEqual(page.data.dailyStats, undefined)
    assert.strictEqual(page._allDailyStats.length, 365)
    page.onMonthTap({ currentTarget: { dataset: { month: '2025-01' } } })
    assert.strictEqual(page.data.displayDailyStats.length, 31)
    assert.strictEqual(page.data.stats.totalMilk, 31 * 600)
    page.backToMonthList()
    assert.deepStrictEqual(page.data.displayDailyStats, [])
    assert.strictEqual(page.data.stats.totalMilk, 365 * 600)
    console.log('stats payload: 365 days, ' + bytes + ' bytes')
  })

  await test('clicking the selected range does not restart its request', async () => {
    const world = makeWorld(), page = world.page()
    page.onShow()
    page.switchRange(tap('7'))
    await flush()
    assert.strictEqual(world.calls.length, 1)
    world.resolve(0, [daily('2026-10-24')])
    await flush()
  })

  await test('cached stats display before the network and still refresh without a loading overlay', async () => {
    const world = makeWorld()
    world.seed('7', [daily('2026-10-24', 400)])
    const page = world.page()
    page.onShow()
    assert.strictEqual(page.data.stats.totalMilk, 400)
    assert.strictEqual(world.loading, 0)
    await flush()
    assert.strictEqual(world.calls.length, 1)
    world.resolve(0, [daily('2026-10-24', 500)])
    await flush()
    assert.strictEqual(page.data.stats.totalMilk, 500)
    assert.strictEqual(world.writes.length, 1)
  })

  await test('hidden and unloaded pages ignore delayed responses and never write snapshots', async () => {
    for (const method of ['onHide', 'onUnload']) {
      const world = makeWorld(), page = world.page()
      page.onShow()
      await flush()
      page[method]()
      const patches = page.patches.length
      const draws = page.draws.length
      world.resolve(0, [daily('2026-10-24')])
      await flush()
      assert.strictEqual(page.patches.length, patches)
      assert.strictEqual(page.draws.length, draws)
      assert.strictEqual(world.writes.length, 0)
    }
  })

  await test('late failures after hiding do not show errors or cache anything', async () => {
    const world = makeWorld(), page = world.page()
    page.onShow()
    await flush()
    page.onHide()
    world.calls[0].reject(new Error('request finished after leaving'))
    await flush()
    assert.deepStrictEqual(world.toasts, [])
    assert.strictEqual(world.writes.length, 0)
  })

  await test('changing family clears the previous family immediately when there is no matching snapshot', async () => {
    const world = makeWorld()
    world.seed('7', [daily('2026-10-24')])
    const page = world.page()
    page.onShow()
    await flush()
    page.onHide()
    world.familyCode = 'stats-b'
    page.onShow()
    assert.strictEqual(page.data.stats.totalMilk, 0)
    assert.deepStrictEqual(page.data.displayDailyStats, [])
    assert.deepStrictEqual(page._allDailyStats, [])
    await flush()
    world.resolve(0, [daily('2026-10-24', 900)])
    world.resolve(1, [daily('2026-10-24', 300)])
    await flush()
    assert.strictEqual(page.data.stats.totalMilk, 300)
    assert.strictEqual(world.writes.length, 1)
    assert.strictEqual(world.writes[0].key, world.key('7'))
  })

  await test('range, cutoff date and request generation isolate results while pending reads are shared', async () => {
    const world = makeWorld(), page = world.page()
    page.onShow()
    await flush()
    page.onHide()
    page.onShow()
    await flush()
    assert.strictEqual(world.calls.length, 1, 'same-query in-flight read should be shared')
    page.switchRange(tap('30'))
    await flush()
    world.resolve(1, [daily('2026-10-20', 300)])
    await flush()
    world.resolve(0, [daily('2026-10-24', 900)])
    await flush()
    assert.strictEqual(page.data.stats.totalMilk, 300)
    assert.strictEqual(world.writes.length, 1)
    page.onHide()
    world.today = '2026-10-26'
    page.onShow()
    assert.strictEqual(page.data.stats.totalMilk, 0, 'new Beijing cutoff cannot reuse yesterday\'s display')
    await flush()
    world.resolve(2, [daily('2026-10-25', 450)])
    await flush()
    assert.strictEqual(page.data.stats.totalMilk, 450)
  })

  await test('failed refresh preserves matching cached stats without caching a failure', async () => {
    const world = makeWorld()
    world.seed('7', [daily('2026-10-24', 400)])
    const page = world.page()
    page.onShow()
    await flush()
    world.calls[0].resolve({ result: { success: false, error: 'temporarily unavailable', dailyStats: [] } })
    const originalError = console.error
    try { console.error = () => {}; await flush() } finally { console.error = originalError }
    assert.strictEqual(page.data.stats.totalMilk, 400)
    assert.strictEqual(world.writes.length, 0)
  })

  await test('chart selection reads the private current range without sending its whole source again', async () => {
    const world = makeWorld(), page = world.page()
    page.onShow()
    await flush()
    world.resolve(0, [daily('2026-10-24', 400), daily('2026-10-23', 700)])
    await flush()
    page.data.chartHitAreas = [page.createHitArea(0, 0, 20, 20, page._dailyStats[1])]
    page.onChartTap({ detail: { x: 10, y: 10 } })
    assert.strictEqual(page.data.stats.totalMilk, 700)
    assert.strictEqual(page.data.displayDailyStats.length, 1)
    assert.strictEqual(page.data.selectedChartItem.date, '2026-10-23')
    assert.strictEqual(page._dailyStats.length, 2)
    assert.strictEqual(page.data.dailyStats, undefined)
    assert.strictEqual(world.calls.length, 1)
  })

  await test('a lost family code clears old records and invalidates the pending result', async () => {
    const world = makeWorld()
    world.seed('7', [daily('2026-10-24', 400)])
    const page = world.page()
    page.onShow()
    await flush()
    world.familyCode = ''
    page.onShow()
    assert.strictEqual(page.data.stats.totalMilk, 0)
    assert.deepStrictEqual(page._allDailyStats, [])
    world.resolve(0, [daily('2026-10-24', 900)])
    await flush()
    assert.strictEqual(world.writes.length, 0)
    assert.strictEqual(page.data.stats.totalMilk, 0)
  })

  await test('real snapshot storage hydrates a matching family and persists only the current family after refresh', async () => {
    const world = makeWorld(true)
    world.storage.set('pageSnapshot:v1:stats', {
      scope: 'stats', key: world.key('7'), savedAt: Date.now(), value: [daily('2026-10-24', 400)]
    })
    const page = world.page()
    page.onShow()
    assert.strictEqual(page.data.stats.totalMilk, 400, 'disk snapshot must paint before the pending cloud read')
    assert.strictEqual(world.loading, 0)
    await flush()
    page.onHide()
    world.familyCode = 'stats-b'
    page.onShow()
    assert.strictEqual(page.data.stats.totalMilk, 0)
    await flush()
    world.resolve(0, [daily('2026-10-24', 900)])
    await flush()
    assert.strictEqual(world.writes.length, 0)
    world.resolve(1, [daily('2026-10-24', 300)])
    await flush()
    assert.strictEqual(world.writes.length, 1)
    assert.strictEqual(world.diskOperations.length, 1)
    while (world.diskOperations.length) world.diskOperations.shift()()
    assert.strictEqual(world.storage.get('pageSnapshot:v1:stats').key, world.key('7'))
    assert.strictEqual(world.storage.get('pageSnapshot:v1:stats').value[0].total, 300)
    page.onHide()
    const reopened = world.page()
    reopened.onShow()
    assert.strictEqual(reopened.data.stats.totalMilk, 300)
    await flush()
    assert.strictEqual(world.calls.length, 3, 'memory snapshot must still refresh')
    world.resolve(2, [daily('2026-10-24', 350)])
    await flush()
    assert.strictEqual(reopened.data.stats.totalMilk, 350)
    while (world.diskOperations.length) world.diskOperations.shift()()
  })

  process.exitCode = failures ? 1 : 0
})()
