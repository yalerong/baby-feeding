const assert = require('assert')
const fs = require('fs')
const path = require('path')
const vm = require('vm')

const plain = value => JSON.parse(JSON.stringify(value))
function world(initial = [], failCreate = false) {
  const rows = new Map(initial.map(record => [record._id, { ...record }]))
  let nextId = 0
  const db = {
    serverDate: () => 'SERVER-TIME',
    collection() {
      let conditions = {}, offset = 0, size = 100
      return {
        where(value) { conditions = value; return this },
        orderBy() { return this },
        limit(value) { size = value; return this },
        skip(value) { offset = value; return this },
        get() {
          const data = Array.from(rows.values()).filter(record => Object.keys(conditions).every(key => record[key] === conditions[key]))
          return Promise.resolve({ data: data.slice(offset, offset + size).map(record => ({ ...record })) })
        },
        add({ data }) {
          if (failCreate) return Promise.reject(new Error('database unavailable'))
          const id = data._id || 'random-' + (++nextId)
          if (rows.has(id)) return Promise.reject(new Error('duplicate document'))
          rows.set(id, { ...data, _id: id })
          return Promise.resolve({ _id: id })
        },
        doc(id) { return {
          get: () => rows.has(id) ? Promise.resolve({ data: { ...rows.get(id) } }) : Promise.reject(new Error('not found')),
          update({ data }) { Object.assign(rows.get(id), data); return Promise.resolve({ stats: { updated: 1 } }) }
        } }
      }
    }
  }
  const filename = path.join(__dirname, '../cloudfunctions/batchVaccine/index.js')
  const module = { exports: {} }
  const cloud = { init() {}, DYNAMIC_CURRENT_ENV: 'TEST', database: () => db, getWXContext: () => ({ OPENID: 'parent' }) }
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), {
    module, exports: module.exports, console: { error() {} },
    require(id) { return id === 'wx-server-sdk' ? cloud : id.startsWith('.') ? require(path.resolve(path.dirname(filename), id)) : require(id) }
  }, { filename })
  return { main: module.exports.main, rows }
}

const records = [
  { vaccineName: '乙肝疫苗', category: '一类', dose: 1, plannedDate: '2026-02-24' },
  { vaccineName: '乙肝疫苗', category: '一类', dose: 2, plannedDate: '2026-03-24' }
]
const tests = []
function test(name, fn) { tests.push({ name, fn }) }

test('two phones initializing together create each preset dose only once', async () => {
  const api = world()
  const results = await Promise.all([api.main({ action: 'init', familyCode: 'A', records }), api.main({ action: 'init', familyCode: 'A', records })])
  assert.ok(results.every(result => result.success))
  assert.strictEqual(api.rows.size, 2)
  await api.main({ action: 'init', familyCode: 'A', records })
  assert.strictEqual(api.rows.size, 2, 'a retry must not duplicate the initialized plan')
})

test('initializing preserves existing legacy IDs and completed or custom-planned fields', async () => {
  const legacy = { _id: 'legacy-random', familyCode: 'A', ...records[0], actualDate: '2026-03-02', status: 'completed', note: '保留', isCustomPlanned: true }
  const api = world([legacy])
  await api.main({ action: 'init', familyCode: 'A', records })
  assert.strictEqual(api.rows.size, 2)
  assert.deepStrictEqual(api.rows.get('legacy-random'), legacy)
  assert.strictEqual(Array.from(api.rows.values()).filter(row => row.dose === 1).length, 1)
})

test('initialization identities are isolated by family and do not shadow a custom vaccine with the same name', async () => {
  const custom = { _id: 'custom', familyCode: 'A', ...records[0], category: '自定义' }
  const api = world([custom])
  await Promise.all(['A', 'B'].map(familyCode => api.main({ action: 'init', familyCode, records })))
  assert.strictEqual(api.rows.size, 5)
  assert.deepStrictEqual(api.rows.get('custom'), custom)
})

test('a genuine initialization database failure is not mistaken for a concurrent success', async () => {
  const api = world([], true)
  const result = await api.main({ action: 'init', familyCode: 'A', records })
  assert.strictEqual(result.success, false)
  assert.strictEqual(api.rows.size, 0)
})

test('custom vaccine updates persist a trimmed name and a positive integer dose', async () => {
  const api = world([{ _id: 'custom', familyCode: 'A', category: '自定义', vaccineName: '原名称', dose: 1 }])
  const result = await api.main({ action: 'update', familyCode: 'A', _id: 'custom', data: { vaccineName: ' 新名称 ', dose: 2 } })
  assert.strictEqual(result.success, true)
  assert.strictEqual(api.rows.get('custom').vaccineName, '新名称')
  assert.strictEqual(api.rows.get('custom').dose, 2)
})

test('preset vaccine identities cannot be renamed or have their dose changed by an update', async () => {
  const api = world([{ _id: 'preset', familyCode: 'A', ...records[0] }])
  await api.main({ action: 'update', familyCode: 'A', _id: 'preset', data: { vaccineName: '替换', dose: 99, note: '备注' } })
  assert.strictEqual(api.rows.get('preset').vaccineName, records[0].vaccineName)
  assert.strictEqual(api.rows.get('preset').dose, 1)
  assert.strictEqual(api.rows.get('preset').note, '备注')
})

test('invalid custom vaccine names and doses are rejected without changing the record', async () => {
  for (const data of [{ vaccineName: ' ' }, { dose: 0 }, { dose: 1.5 }, { dose: Infinity }]) {
    const original = { _id: 'custom', familyCode: 'A', category: '自定义', vaccineName: '原名称', dose: 1 }
    const api = world([original])
    const result = await api.main({ action: 'update', familyCode: 'A', _id: 'custom', data })
    assert.strictEqual(result.success, false)
    assert.deepStrictEqual(plain(api.rows.get('custom')), original)
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
