const assert = require('assert')
const fs = require('fs')
const path = require('path')
const vm = require('vm')

const DATE = '2026-10-25'
const FAMILY = 'PERFORMANCE-TEST'
const plain = value => JSON.parse(JSON.stringify(value))

function deferred() {
  let resolve
  let reject
  const promise = new Promise((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}

function loadFunction(name, get) {
  const calls = []
  const command = {}
  for (const op of ['lt', 'gte', 'gt']) {
    command[op] = value => ({ op, value, and(other) { return { op: 'and', values: [this, other] } } })
  }
  const db = {
    command,
    collection(collection) {
      const query = { collection, conditions: {}, sorts: [], offset: 0, size: 100 }
      return {
        where(conditions) { query.conditions = conditions; query.sorts = []; return this },
        orderBy(field, direction) { query.sorts.push(field + ':' + direction); return this },
        skip(offset) { query.offset = offset; return this },
        limit(size) { query.size = size; return this },
        get() {
          const operation = { ...query, sorts: query.sorts.slice() }
          calls.push(operation)
          return get(operation)
        }
      }
    }
  }
  const filename = path.join(__dirname, '../cloudfunctions', name, 'index.js')
  const module = { exports: {} }
  const cloud = { init() {}, DYNAMIC_CURRENT_ENV: 'TEST-ONLY', database: () => db }
  const context = vm.createContext({
    module, exports: module.exports,
    console: { error() {} },
    require(id) {
      if (id === 'wx-server-sdk') return cloud
      return require(path.resolve(path.dirname(filename), id))
    }
  })
  vm.runInContext(fs.readFileSync(filename, 'utf8'), context, { filename })
  return { main: module.exports.main, calls }
}

function record(index) {
  return { _id: 'record-' + String(index).padStart(4, '0'), familyCode: FAMILY, date: DATE, time: '12:00', total: 90 }
}

const tests = []
function test(name, fn) { tests.push({ name, fn }) }

for (const name of ['homeSummary', 'getRecords']) {
  test(name + ' starts daily records and previous feeding before either query resolves', async () => {
    const day = deferred()
    const previous = deferred()
    const api = loadFunction(name, query => typeof query.conditions.date === 'string' ? day.promise : previous.promise)
    const request = api.main({ familyCode: FAMILY, date: DATE })
    assert.strictEqual(api.calls.length, 2, 'both independent get operations must start without awaiting the first')
    const dailyQuery = api.calls.find(query => query.conditions.date === DATE)
    const previousQuery = api.calls.find(query => query.conditions.date && query.conditions.date.op === 'lt')
    assert.ok(dailyQuery && previousQuery)
    assert.ok(api.calls.every(query => query.conditions.familyCode === FAMILY))
    assert.deepStrictEqual(dailyQuery.sorts, ['date:asc', 'time:asc', '_id:asc'])
    assert.deepStrictEqual(previousQuery.sorts, ['date:desc', 'time:desc'])
    assert.strictEqual(previousQuery.conditions.date.value, DATE)
    assert.strictEqual(previousQuery.conditions.total.op, 'gt')
    assert.strictEqual(previousQuery.conditions.total.value, 0)
    assert.strictEqual(previousQuery.size, 1)

    const prior = { ...record(0), date: '2026-10-24' }
    previous.resolve({ data: [prior] })
    day.resolve({ data: [record(1)] })
    const result = plain(await request)
    assert.strictEqual(result.success, true)
    assert.deepStrictEqual(name === 'homeSummary' ? result.records : result.data, [record(1)])
    assert.deepStrictEqual(result.prevFeeding, prior)
    if (name === 'homeSummary') {
      assert.strictEqual(result.review, null)
      assert.strictEqual(result.supplementTaken, null)
      assert.strictEqual(result.recommendationRecords, null)
    }
  })

  test(name + ' preserves complete and stably sorted pagination at full-page boundaries', async () => {
    for (const length of [100, 200, 217]) {
      const rows = Array.from({ length }, (_, index) => record(index))
      const api = loadFunction(name, query => Promise.resolve({
        data: typeof query.conditions.date === 'string'
          ? rows.slice(query.offset, query.offset + query.size)
          : []
      }))
      const result = plain(await api.main({ familyCode: FAMILY, date: DATE }))
      assert.strictEqual(result.success, true)
      assert.deepStrictEqual(name === 'homeSummary' ? result.records : result.data, rows)
      assert.strictEqual(result.prevFeeding, null)
      const pages = api.calls.filter(query => query.conditions.date === DATE)
      assert.strictEqual(pages.length, Math.floor(length / 100) + 1)
      assert.deepStrictEqual(pages.map(query => query.offset), Array.from({ length: pages.length }, (_, index) => index * 100))
      assert.ok(pages.every(query => query.size === 100 && query.conditions.familyCode === FAMILY))
      assert.ok(pages.every(query => query.sorts.join(',') === 'date:asc,time:asc,_id:asc'))
    }
  })

  test(name + ' preserves its error response when either parallel read rejects', async () => {
    for (const failedQuery of ['day', 'previous']) {
      const api = loadFunction(name, query => {
        const kind = typeof query.conditions.date === 'string' ? 'day' : 'previous'
        return kind === failedQuery ? Promise.reject(new Error(kind + ' unavailable')) : Promise.resolve({ data: [] })
      })
      const result = plain(await api.main({ familyCode: FAMILY, date: DATE }))
      assert.strictEqual(api.calls.length, 2)
      const expected = { success: false, error: failedQuery + ' unavailable' }
      if (name === 'getRecords') expected.data = []
      assert.deepStrictEqual(result, expected)
    }
  })

  test(name + ' rejects a missing family before accessing the database', async () => {
    const api = loadFunction(name, () => { throw new Error('must not query') })
    const result = plain(await api.main({ date: DATE }))
    assert.strictEqual(result.success, false)
    assert.strictEqual(api.calls.length, 0)
    if (name === 'getRecords') assert.deepStrictEqual(result.data, [])
  })
}

test('getRecords keeps id, date-range and family-only lookups separate from previous-feeding reads', async () => {
  for (const input of [{ _id: 'record-0001', date: DATE }, { startDate: '2026-10-01', endDateExclusive: DATE }, {}]) {
    const api = loadFunction('getRecords', () => Promise.resolve({ data: [record(1)] }))
    const result = plain(await api.main({ familyCode: FAMILY, ...input }))
    assert.strictEqual(result.success, true)
    assert.deepStrictEqual(result.data, [record(1)])
    assert.strictEqual(result.prevFeeding, null)
    assert.strictEqual(api.calls.length, 1)
    assert.strictEqual(api.calls[0].conditions.familyCode, FAMILY)
    if (input._id) {
      assert.strictEqual(api.calls[0].conditions._id, input._id)
      assert.strictEqual(api.calls[0].conditions.date, undefined)
    } else if (input.startDate) {
      const condition = api.calls[0].conditions.date
      assert.strictEqual(condition.op, 'and')
      assert.deepStrictEqual(condition.values.map(item => [item.op, item.value]), [['gte', input.startDate], ['lt', DATE]])
    } else {
      assert.strictEqual(api.calls[0].conditions.date, undefined)
    }
  }
})

;(async () => {
  let failures = 0
  for (const entry of tests) {
    try { await entry.fn(); console.log('ok - ' + entry.name) }
    catch (error) { failures += 1; console.error('not ok - ' + entry.name); console.error(error) }
  }
  process.exitCode = failures ? 1 : 0
})()
