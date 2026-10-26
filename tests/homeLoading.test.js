const assert = require('assert')
const dateUtil = require('../utils/date.js')
const reminderCache = require('../utils/feedingReminderCache.js')
const flush = () => new Promise(resolve => setImmediate(resolve))
function deferred() {
  let resolve, reject
  const promise = new Promise((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}
function world(withRecommendation = true) {
  const today = dateUtil.todayStr()
  const storage = new Map([['familyCode', 'HOME-A'], ['babyBirthDate', '2026-02-24']])
  const calls = [], updates = [], watchers = []
  const recommendations = { daytime: { minutes: 240 }, nighttime: { minutes: 240 } }
  if (withRecommendation) storage.set(reminderCache.getKey('HOME-A', today), recommendations)
  global.wx = {
    getStorageSync: key => storage.get(key) || '',
    setStorageSync: (key, value) => storage.set(key, value),
    removeStorageSync: key => storage.delete(key),
    setStorage({ key, data, success }) { storage.set(key, data); success() },
    removeStorage({ key, success }) { storage.delete(key); success() },
    showToast() {}, showLoading() {}, hideLoading() {},
    cloud: {
      callFunction(options) { const request = deferred(); calls.push({ ...request, ...options }); return request.promise },
      database() { return { collection() { return { where() { return this }, orderBy() { return this }, watch(options) {
        const watch = { options, closed: false, close() { this.closed = true } }; watchers.push(watch); return watch
      } } } } }
    }
  }
  const snapshotPath = require.resolve('../utils/pageSnapshot.js')
  delete require.cache[snapshotPath]
  const snapshot = require(snapshotPath)
  delete require.cache[require.resolve('../utils/feedingReminderCache.js')]
  const filename = require.resolve('../pages/index/index.js')
  delete require.cache[filename]
  let definition
  global.Page = value => { definition = value }
  require(filename)
  const page = { ...definition, data: { ...JSON.parse(JSON.stringify(definition.data)), familyCode: 'HOME-A', todayDate: today, currentDate: today },
    setData(patch, callback) { updates.push(patch); Object.assign(this.data, patch); if (callback) callback() } }
  const records = [{ _id: 'fresh', date: today, time: '08:00', breastMilk: 100, total: 100 }]
  const result = rows => ({ result: { success: true, records: rows, prevFeeding: null, review: { confirmed: true }, supplementTaken: false } })
  return { page, today, snapshot, calls, updates, watchers, records, result, storage }
}
async function main() {
  let env = world()
  const cached = [{ ...env.records[0], _id: 'cached', breastMilk: 60 }]
  const key = env.snapshot.key({ familyCode: 'HOME-A', date: env.today })
  env.snapshot.write('home', key, { records: cached, prevFeeding: null })
  const loading = env.page.loadHomeSummary(env.today, env.today)
  assert.strictEqual(env.page.data.records[0]._id, 'cached', 'cached records must display before the network responds')
  await flush()
  assert.strictEqual(env.calls.length, 1)
  env.calls[0].resolve(env.result(env.records))
  await loading
  assert.strictEqual(env.page.data.records[0]._id, 'fresh')
  assert.deepStrictEqual(Object.keys(env.snapshot.read('home', key)).sort(), ['prevFeeding', 'records'])
  console.log('ok - home shows an exact snapshot immediately and refreshes only display data')

  env = world(false)
  const cold = env.page.loadHomeSummary(env.today, env.today)
  await flush()
  const summary = env.calls.find(call => call.name === 'homeSummary')
  const recommendation = env.calls.find(call => call.name === 'getRecords')
  assert.ok(summary && recommendation, 'today and recommendation reads must start independently')
  assert.strictEqual(summary.data.recommendation, null)
  summary.resolve(env.result(env.records))
  await cold
  assert.strictEqual(env.page.data.records[0]._id, 'fresh', 'today must not wait for the history recommendation')
  recommendation.resolve({ result: { success: true, data: [] } })
  await flush()
  console.log('ok - recommendation history cannot block the primary home records')

  env = world()
  const first = env.page.loadHomeSummary(env.today, env.today)
  const second = env.page.loadHomeSummary(env.today, env.today)
  await flush()
  assert.strictEqual(env.calls.length, 1, 'same in-flight read must coalesce')
  env.calls[0].resolve(env.result(env.records))
  await Promise.all([first, second])
  assert.strictEqual(env.watchers.length, 1)
  console.log('ok - duplicate home reads share one cloud request and one listener')

  for (const rejection of [false, true]) {
    env = world()
    const pending = env.page.loadHomeSummary(env.today, env.today)
    await flush()
    env.page.onHide()
    const count = env.updates.length
    if (rejection) env.calls[0].reject(new Error('offline'))
    else env.calls[0].resolve(env.result(env.records))
    await pending
    assert.strictEqual(env.updates.length, count)
    assert.strictEqual(env.watchers.length, 0)
    assert.strictEqual(env.calls.length, 1, 'hidden failure must not launch fallback requests')
  }
  console.log('ok - hidden home responses neither render nor restart requests and listeners')

  env = world()
  const old = env.page.loadHomeSummary(env.today, env.today)
  await flush()
  env.page.data.familyCode = 'HOME-B'
  env.storage.set('familyCode', 'HOME-B')
  env.storage.set(reminderCache.getKey('HOME-B', env.today), { daytime: {}, nighttime: {} })
  const next = env.page.loadHomeSummary(env.today, env.today)
  assert.strictEqual(env.page.data.records.length, 0)
  await flush()
  env.calls[1].resolve(env.result([{ ...env.records[0], _id: 'B' }]))
  await next
  env.calls[0].resolve(env.result([{ ...env.records[0], _id: 'A' }]))
  await old
  assert.strictEqual(env.page.data.records[0]._id, 'B')
  console.log('ok - family changes clear old display and reject late results from another family')

  env = world()
  const summaryPending = env.page.loadHomeSummary(env.today, env.today)
  await flush()
  const historicalDate = dateUtil.addDays(env.today, -2)
  env.page.bindDateChange({ detail: { value: historicalDate } })
  await flush()
  const historicalRead = env.calls.find(call => call.name === 'getRecords' && call.data.date === historicalDate)
  historicalRead.resolve({ result: { success: true, data: [{ ...env.records[0], _id: 'historical', date: historicalDate }] } })
  await flush()
  const reviewRead = env.calls.find(call => call.name === 'dailyReview')
  assert.ok(reviewRead, 'changing the selected date must release the obsolete summary review reservation')
  reviewRead.resolve({ result: { success: true, confirmed: true } })
  env.calls[0].resolve(env.result(env.records))
  await summaryPending
  await flush()
  assert.strictEqual(env.page.data.records[0]._id, 'historical')
  console.log('ok - date changes do not suppress the review while an older summary is pending')

  env = world()
  env.page._homeSummaryUnavailable = true
  const fallback = env.page.loadHomeSummary(env.today, env.today)
  await flush()
  assert.ok(!env.calls.some(call => call.name === 'homeSummary'))
  const read = env.calls.find(call => call.name === 'getRecords' && call.data.date === env.today)
  assert.ok(read)
  env.page.onHide()
  read.resolve({ result: { success: true, data: [] } })
  await fallback
  console.log('ok - a confirmed missing summary uses the supported fallback without another failed probe')

  for (const missing of [true, false]) {
    env = world()
    const attempt = env.page.loadHomeSummary(env.today, env.today)
    await flush()
    env.calls[0].reject(new Error(missing ? 'homeSummary function not found' : 'network timeout'))
    await flush()
    const fallbackRead = env.calls.find(call => call.name === 'getRecords' && call.data.date === env.today)
    fallbackRead.resolve({ result: { success: true, data: env.records } })
    await attempt
    assert.strictEqual(!!env.page._homeSummaryUnavailable, missing)
    const before = env.calls.length
    const retry = env.page.loadHomeSummary(env.today, env.today)
    await flush()
    const newCalls = env.calls.slice(before)
    assert.strictEqual(newCalls.some(call => call.name === 'homeSummary'), !missing)
    env.page.onHide()
    const primary = newCalls.find(call => call.name === 'homeSummary' || (call.name === 'getRecords' && call.data.date === env.today))
    primary.resolve(missing ? { result: { success: true, data: [] } } : env.result([]))
    await retry
  }
  console.log('ok - only a missing function disables summary probes; ordinary network errors remain retryable')

  env = world()
  const homeKey = env.snapshot.key({ familyCode: 'HOME-A', date: env.today })
  env.snapshot.write('home', homeKey, { records: env.records, prevFeeding: null })
  env.snapshot.write('stats', 'current', [])
  env.page.data.quickBreast = '80'
  env.page.quickSave()
  const save = env.calls.find(call => call.name === 'addRecord')
  save.resolve({ result: { success: true } })
  await flush()
  assert.strictEqual(env.snapshot.read('home', homeKey), null)
  assert.strictEqual(env.snapshot.read('stats', 'current'), null)
  env.page.onHide()
  console.log('ok - a successful quick save invalidates home and statistics snapshots')
}
main().catch(err => { console.error(err); process.exitCode = 1 })
