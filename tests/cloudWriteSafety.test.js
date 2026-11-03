const assert = require('assert')
const fs = require('fs')
const path = require('path')
const vm = require('vm')

function world(name, options = {}) {
  const docs = [], queries = []
  let writeCount = 0, transactions = 0, collections = 0, commitReplyLost = false
  const existing = { _id: 'existing', familyCode: 'FAMILY', date: '2026-11-03', images: ['cloud://keep'] }
  function collection(buffer = docs) {
    collections += 1
    return {
      where(query) {
        queries.push(query)
        return { count: async () => { throw new Error('database unavailable') }, limit() { return this }, get: async () => ({ data: [existing] }) }
      },
      async add({ data }) {
        writeCount += 1
        if (options.failWrite === writeCount) throw new Error('write failed')
        const _id = data._id || 'record-' + (docs.length + buffer.length + 1)
        if (docs.some(doc => doc._id === _id) || buffer !== docs && buffer.some(doc => doc._id === _id)) throw new Error('duplicate id')
        buffer.push({ _id, ...data })
        return { _id }
      },
      doc(id) {
        return {
          get: async () => ({ data: docs.find(doc => doc._id === id) || (id === existing._id ? existing : null) }),
          update: async ({ data }) => { docs.push({ _id: id, ...data }); return { stats: { updated: 1 } } }
        }
      }
    }
  }
  const db = {
    command: { neq: value => ({ neq: value }) },
    RegExp: value => value,
    serverDate: () => 'SERVER_DATE',
    createCollection: async () => {},
    collection: () => collection(),
    async runTransaction(callback) {
      transactions += 1
      const pending = []
      await callback({ collection: () => collection(pending) })
      docs.push(...pending)
      if (options.loseCommitReply && !commitReplyLost) {
        commitReplyLost = true
        throw new Error('response lost after commit')
      }
      return { result: undefined }
    }
  }
  const cloud = { init() {}, database: () => db, getWXContext: () => ({ OPENID: 'parent' }) }
  const filename = path.resolve(__dirname, '../cloudfunctions', name, 'index.js')
  const module = { exports: {} }
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), {
    module, exports: module.exports, console: { error() {} },
    require(id) { return id === 'wx-server-sdk' ? cloud : id.startsWith('.') ? require(path.resolve(path.dirname(filename), id)) : require(id) }
  }, { filename })
  return { main: module.exports.main, docs, queries, transactions: () => transactions, collections: () => collections }
}

const base = { familyCode: 'FAMILY', date: '2026-11-03', time: '09:00' }
const rows = [1, 2, 3].map(index => ({ date: base.date, time: '0' + index + ':00', breastMilk: '30', formula: '60', total: 999 }))
const tests = []
function test(name, fn) { tests.push({ name, fn }) }

test('a failed batch rolls back earlier rows and a retry saves exactly one complete batch', async () => {
  const failed = world('batchFeeding', { failWrite: 2 })
  const result = await failed.main({ familyCode: 'FAMILY', records: rows })
  assert.strictEqual(result.success, false)
  assert.strictEqual(failed.docs.length, 0, 'a rejected batch must leave no partial records')
  assert.strictEqual(failed.transactions(), 1)
  const retry = await failed.main({ familyCode: 'FAMILY', records: rows })
  assert.strictEqual(retry.success, true)
  assert.strictEqual(failed.docs.length, 3)
  assert.strictEqual(retry.count, 3)
  assert.strictEqual(retry.ids.length, 3)
})

test('batch limit matches the one-hundred-operation transaction limit', async () => {
  const api = world('batchFeeding')
  const rejected = await api.main({ familyCode: 'FAMILY', records: Array.from({ length: 101 }, () => rows[0]) })
  assert.strictEqual(rejected.success, false)
  assert.strictEqual(api.docs.length, 0)
  assert.strictEqual(api.transactions(), 0)
  const accepted = await api.main({ familyCode: 'FAMILY', records: Array.from({ length: 100 }, () => rows[0]) })
  assert.strictEqual(accepted.success, true)
  assert.strictEqual(api.docs.length, 100)
})

test('retrying a committed batch with the same request id never creates a second copy', async () => {
  const api = world('batchFeeding', { loseCommitReply: true })
  const request = { familyCode: 'FAMILY', requestId: 'request-safe-retry-1', records: rows }
  const first = await api.main(request)
  const retry = await api.main(request)
  assert.strictEqual(first.success, true, 'lost commit acknowledgement can be checked against the committed records')
  assert.strictEqual(retry.success, true)
  assert.strictEqual(api.docs.length, 3)
  assert.deepStrictEqual(Array.from(first.ids), Array.from(retry.ids))
})

test('a request id cannot hide a changed payload, and another family has separate ids', async () => {
  const api = world('batchFeeding')
  const request = { familyCode: 'FAMILY', requestId: 'request-safe-retry-1', records: rows }
  assert.strictEqual((await api.main(request)).success, true)
  const changed = { ...request, records: rows.map((row, index) => index ? row : { ...row, formula: 100 }) }
  assert.strictEqual((await api.main(changed)).success, false)
  assert.strictEqual(api.docs.length, 3)
  assert.strictEqual((await api.main({ ...request, familyCode: 'ANOTHER-FAMILY' })).success, true)
  assert.strictEqual(api.docs.length, 6)
  assert.strictEqual(new Set(api.docs.map(doc => doc._id)).size, 6)
})

test('malformed supplied request ids fail before any transaction or record lookup', async () => {
  for (const requestId of ['', 'tiny', null, {}, 'with spaces', 'a'.repeat(81)]) {
    const api = world('batchFeeding')
    const result = await api.main({ familyCode: 'FAMILY', requestId, records: rows })
    assert.strictEqual(result.success, false)
    assert.strictEqual(api.docs.length, 0)
    assert.strictEqual(api.transactions(), 0)
    assert.strictEqual(api.collections(), 0)
  }
})

for (const name of ['addRecord', 'updateRecord', 'batchFeeding']) {
  const request = milk => name === 'batchFeeding'
    ? { familyCode: 'FAMILY', records: [{ ...rows[0], ...milk }] }
    : { ...base, _id: 'existing', ...milk }
  test(name + ' derives milk total from validated quantities and preserves empty fields', async () => {
    for (const [milk, expected] of [
      [{ breastMilk: '30.5', formula: '60', total: 999 }, [30.5, 60, 90.5]],
      [{ breastMilk: '', formula: '90', total: -50 }, [0, 90, 90]],
      [{ breastMilk: null, formula: undefined }, [0, 0, 0]]
    ]) {
      const api = world(name)
      const result = await api.main(request(milk))
      assert.strictEqual(result.success, true)
      const saved = api.docs[0]
      assert.deepStrictEqual([saved.breastMilk, saved.formula, saved.total], expected)
      if (name === 'updateRecord') assert.deepStrictEqual(saved.images, ['cloud://keep'])
    }
  })
  test(name + ' rejects invalid milk quantities before writing any record', async () => {
    for (const value of [-1, '-20', Infinity, 'Infinity', NaN, 'not-a-number', {}, []]) {
      for (const field of ['breastMilk', 'formula']) {
        const api = world(name)
        const result = await api.main(request({ [field]: value }))
        assert.strictEqual(result.success, false, field + ': ' + String(value))
        assert.strictEqual(api.docs.length, 0)
      }
    }
    const api = world(name)
    assert.strictEqual((await api.main(request({ breastMilk: Number.MAX_VALUE, formula: Number.MAX_VALUE }))).success, false)
    assert.strictEqual(api.docs.length, 0)
  })
}

test('invalid rows reject the entire batch before starting a transaction', async () => {
  for (const records of [[rows[0], { ...rows[1], formula: -1 }], [rows[0], null]]) {
    const api = world('batchFeeding')
    const result = await api.main({ familyCode: 'FAMILY', records })
    assert.strictEqual(result.success, false)
    assert.strictEqual(api.docs.length, 0)
    assert.strictEqual(api.transactions(), 0)
  }
})

test('supplement lookup failure stays a failure instead of clearing the taken state', async () => {
  const api = world('supplement')
  const result = await api.main({ action: 'get', familyCode: 'FAMILY', date: base.date, name: 'VD' })
  assert.strictEqual(result.success, false)
  assert.strictEqual(result.error, 'database unavailable')
  assert.strictEqual(result.taken, undefined)
})

for (const name of ['fixFamilyCode', 'fixDates']) {
  test(name + ' cannot rewrite any records through its retired cloud entrypoint', async () => {
    const api = world(name)
    const result = await api.main({ fromYear: '2025', toYear: '2026', familyCode: 'FAMILY' })
    assert.strictEqual(result.success, false)
    assert.strictEqual(result.error, 'MAINTENANCE_DISABLED')
    assert.strictEqual(api.collections(), 0)
    assert.strictEqual(api.docs.length, 0)
  })
}

;(async () => {
  let failed = 0
  for (const entry of tests) {
    try { await entry.fn(); console.log('ok - ' + entry.name) }
    catch (error) { failed += 1; console.error('not ok - ' + entry.name); console.error(error) }
  }
  process.exitCode = failed ? 1 : 0
})()
