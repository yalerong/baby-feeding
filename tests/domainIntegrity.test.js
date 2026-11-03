const assert = require('assert')
const fs = require('fs')
const path = require('path')
const vm = require('vm')
const dateUtil = require('../utils/date.js')

const copy = value => value === undefined ? undefined : JSON.parse(JSON.stringify(value))
const FAMILY = 'DOMAIN-TEST'

function world(name, seed = {}, hooks = {}) {
  const collections = copy(seed)
  const writes = []
  let sequence = 0
  function matches(row, query) {
    return Object.keys(query).every(key => {
      const value = query[key]
      if (value && value.op === 'exists') return Object.prototype.hasOwnProperty.call(row, key) === value.value
      if (value && value.op === 'eq') return JSON.stringify(row[key]) === JSON.stringify(value.value)
      if (value && value.op === 'lt') return row[key] < value.value
      if (value && value.op === 'gt') return row[key] > value.value
      return row[key] === value
    })
  }
  function update(row, data) {
    for (const key of Object.keys(data)) {
      const value = data[key]
      if (value && value.op === 'set') row[key] = copy(value.value)
      else if (value && !Array.isArray(value) && typeof value === 'object') row[key] = { ...(row[key] || {}), ...copy(value) }
      else row[key] = copy(value)
    }
  }
  const db = {
    command: Object.fromEntries(['eq', 'exists', 'set', 'lt', 'gt', 'gte'].map(op => [op, value => ({ op, value })])),
    serverDate: () => 'SERVER_DATE',
    collection(collection) {
      const rows = collections[collection] || (collections[collection] = [])
      const query = {}
      let size = 100, offset = 0
      return {
        where(conditions) { Object.assign(query, conditions); return this },
        orderBy() { return this },
        limit(value) { size = value; return this },
        skip(value) { offset = value; return this },
        async get() { return { data: copy(rows.filter(row => matches(row, query)).slice(offset, offset + size)) } },
        async count() {
          if (hooks.countError) throw new Error('supplement count unavailable')
          return { total: rows.filter(row => matches(row, query)).length }
        },
        async update({ data }) {
          if (hooks.beforeUpdate) hooks.beforeUpdate(collection, data, rows)
          let updated = 0
          rows.forEach(row => { if (matches(row, query)) { update(row, data); updated += 1 } })
          writes.push({ collection, query: copy(query), data: copy(data), updated })
          return { stats: { updated } }
        },
        doc(id) {
          return {
            async get() {
              const row = rows.find(item => item._id === id)
              if (!row) throw new Error('not found')
              return { data: copy(row) }
            },
            async update({ data }) {
              if (hooks.beforeUpdate) hooks.beforeUpdate(collection, data, rows)
              const row = rows.find(item => item._id === id)
              if (!row) throw new Error('not found')
              update(row, data)
              writes.push({ collection, id, data: copy(data), updated: 1 })
              return { stats: { updated: 1 } }
            }
          }
        },
        async add({ data }) {
          if (hooks.addError) throw new Error('database unavailable')
          const id = data._id || 'automatic-' + (++sequence)
          if (rows.some(row => row._id === id)) throw new Error('duplicate key')
          rows.push({ _id: id, ...copy(data) })
          return { _id: id }
        }
      }
    }
  }
  const filename = path.join(__dirname, '../cloudfunctions', name, 'index.js')
  const module = { exports: {} }
  const cloud = { init() {}, DYNAMIC_CURRENT_ENV: 'TEST', database: () => db, getWXContext: () => ({ OPENID: 'parent' }) }
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), {
    module, exports: module.exports, console: { error() {} },
    require(id) { return id === 'wx-server-sdk' ? cloud : require(id.startsWith('.') ? path.resolve(path.dirname(filename), id) : id) }
  }, { filename })
  return { main: module.exports.main, collections, writes }
}

const trial = patch => ({
  _id: 'egg', familyCode: FAMILY, foodName: '鸡蛋', trialCount: 1, status: 'tracking',
  lastTriedDate: '2026-11-02', logDates: ['2026-11-02'], logSources: { '2026-11-02': 'record-1' },
  lastLogRecordId: 'record-1', ...patch
})
const families = [{ _id: 'family', familyCode: FAMILY, trialMode: 'relaxed' }]
const log = { action: 'log', familyCode: FAMILY, foodName: '鸡蛋', date: '2026-11-03', recordId: 'record-2' }
const tests = []
function test(name, fn) { tests.push({ name, fn }) }

test('a delayed trial log cannot overwrite another parent allergy flag', async () => {
  const env = world('foodTrial', { food_trials: [trial()], families })
  const [logged, flagged] = await Promise.all([
    env.main(log),
    env.main({ action: 'setStatus', familyCode: FAMILY, foodName: '鸡蛋', status: 'allergic', date: log.date, note: '皮疹' })
  ])
  assert.strictEqual(flagged.success, true)
  assert.strictEqual(env.collections.food_trials[0].status, 'allergic')
  assert.strictEqual(logged.success, false)
  assert.match(logged.error, /变化|刷新/)
})

test('trial undo neither clears an existing allergy nor a newly committed allergy', async () => {
  for (const alreadyFlagged of [true, false]) {
    let raced = false
    const env = world('foodTrial', { food_trials: [trial({ status: alreadyFlagged ? 'allergic' : 'tracking' })], families }, {
      beforeUpdate(collection, data, rows) {
        if (alreadyFlagged || raced || collection !== 'food_trials') return
        raced = true
        rows[0].status = 'allergic'
      }
    })
    const result = await env.main({ action: 'undoLog', familyCode: FAMILY, foodName: '鸡蛋', date: '2026-11-02' })
    assert.strictEqual(result.success, false)
    assert.strictEqual(env.collections.food_trials[0].status, 'allergic')
    assert.strictEqual(env.collections.food_trials[0].trialCount, 1)
  }
})

test('same-status competing trial logs report conflict and can be retried without losing a day', async () => {
  const env = world('foodTrial', { food_trials: [trial({ trialCount: 0, lastTriedDate: '', logDates: [], logSources: {}, lastLogRecordId: '' })], families })
  const results = await Promise.all([env.main({ ...log, date: '2026-11-02' }), env.main(log)])
  assert.strictEqual(results.filter(result => result.success).length, 1)
  const failed = results.find(result => !result.success)
  assert.match(failed.error, /变化|刷新/)
  const retry = await env.main(log)
  assert.strictEqual(retry.success, true)
  assert.strictEqual(env.collections.food_trials[0].trialCount, 2)
  assert.deepStrictEqual(env.collections.food_trials[0].logDates, ['2026-11-02', '2026-11-03'])
})

test('trial logs reject a stale source map even when status, count and last date are unchanged', async () => {
  let raced = false
  const env = world('foodTrial', { food_trials: [trial({
    trialCount: 2, logDates: ['2026-11-01', '2026-11-02'],
    logSources: { '2026-11-01': 'removed-record', '2026-11-02': 'record-1' }
  })], families }, {
    beforeUpdate(collection, data, rows) {
      if (raced || collection !== 'food_trials') return
      raced = true
      rows[0].logSources['2026-11-01'] = 'remaining-record'
    }
  })
  const result = await env.main(log)
  assert.strictEqual(result.success, false)
  assert.strictEqual(env.collections.food_trials[0].logSources['2026-11-01'], 'remaining-record')
})

test('normal trial log and undo work for legacy fields and remove the reverted source key', async () => {
  const legacy = trial()
  delete legacy.logDates
  delete legacy.logSources
  delete legacy.lastLogRecordId
  const env = world('foodTrial', { food_trials: [legacy], families })
  const logged = await env.main(log)
  assert.strictEqual(logged.success, true)
  const undone = await env.main({ action: 'undoLog', familyCode: FAMILY, foodName: '鸡蛋', date: log.date })
  assert.strictEqual(undone.success, true)
  assert.strictEqual(env.collections.food_trials[0].trialCount, 1)
  assert.deepStrictEqual(env.collections.food_trials[0].logDates, ['2026-11-02'])
  assert.deepStrictEqual(env.collections.food_trials[0].logSources, {}, 'cloud updates must replace the source map, not merge deleted dates back')
})

test('two parents first saving the same menu week create one shared document', async () => {
  const env = world('weeklyMenu')
  const input = { action: 'save', familyCode: FAMILY, weekStart: '2026-11-02' }
  const [first, second] = await Promise.all([
    env.main({ ...input, data: { days: [{ date: '2026-11-03', note: 'A' }] } }),
    env.main({ ...input, data: { days: [{ date: '2026-11-03', note: 'B' }] } })
  ])
  assert.strictEqual(first.success, true)
  assert.strictEqual(second.success, true)
  assert.strictEqual(first._id, second._id)
  assert.strictEqual(env.collections.weekly_menus.length, 1)
  const read = await env.main({ action: 'get', familyCode: FAMILY, weekStart: input.weekStart })
  assert.strictEqual(read.data.days[0].note, 'B')
})

test('existing weekly menus retain their legacy id and another family stays separate', async () => {
  const env = world('weeklyMenu', { weekly_menus: [
    { _id: 'legacy-menu', familyCode: FAMILY, weekStart: '2026-11-02', days: [], createBy: 'original-parent' },
    { _id: 'other-menu', familyCode: 'OTHER', weekStart: '2026-11-02', days: [{ note: 'other' }] }
  ] })
  const result = await env.main({ action: 'save', familyCode: FAMILY, weekStart: '2026-11-02', data: { days: [{ note: 'updated' }] } })
  assert.strictEqual(result._id, 'legacy-menu')
  assert.strictEqual(env.collections.weekly_menus.length, 2)
  assert.strictEqual(env.collections.weekly_menus[0].createBy, 'original-parent')
  assert.deepStrictEqual(env.collections.weekly_menus[1].days, [{ note: 'other' }])
})

test('a failed menu creation is not reported as a successful concurrent save', async () => {
  const env = world('weeklyMenu', {}, { addError: true })
  const result = await env.main({ action: 'save', familyCode: FAMILY, weekStart: '2026-11-02', data: { days: [] } })
  assert.strictEqual(result.success, false)
  assert.strictEqual(env.collections.weekly_menus.length, 0)
})

test('calendar month additions clamp to the target month for vaccine and food-start dates', () => {
  assert.strictEqual(dateUtil.addMonths('2026-01-31', 1), '2026-02-28')
  assert.strictEqual(dateUtil.addMonths('2024-01-31', 1), '2024-02-29')
  assert.strictEqual(dateUtil.addMonths('2026-08-31', 6), '2027-02-28')
  assert.strictEqual(dateUtil.addMonths('2026-03-31', -1), '2026-02-28')
  assert.strictEqual(dateUtil.addMonths('2026-01-31', 12), '2027-01-31')
  assert.strictEqual(dateUtil.addMonths('2026-02-24', 6), '2026-08-24')
})

test('home summary never converts a supplement read error into an untaken state', async () => {
  const env = world('homeSummary', {}, { countError: true })
  const result = await env.main({ familyCode: FAMILY, date: '2026-11-03', supplementName: 'VD' })
  assert.strictEqual(result.success, false)
  assert.strictEqual(result.supplementTaken, undefined)
  assert.strictEqual(result.error, 'supplement count unavailable')
})

test('home summary still distinguishes known taken and untaken supplements', async () => {
  for (const taken of [false, true]) {
    const env = world('homeSummary', { supplement_records: taken ? [{ familyCode: FAMILY, date: '2026-11-03', name: 'VD' }] : [] })
    const result = await env.main({ familyCode: FAMILY, date: '2026-11-03', supplementName: 'VD' })
    assert.strictEqual(result.success, true)
    assert.strictEqual(result.supplementTaken, taken)
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
