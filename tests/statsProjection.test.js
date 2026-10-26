const assert = require('assert')
const Module = require('module')

const rows = Array.from({ length: 201 }, (_, i) => ({
  _id: 'r' + i, familyCode: 'stats-family', date: '2026-10-24', time: '12:00',
  breastMilk: 30, formula: 20, stool: i === 0, solidFood: i === 0, solidFoodGrams: i === 0 ? 10 : 0,
  note: 'not needed for statistics', images: ['not-needed']
}))
rows.push(
  { _id: 'stool-only', familyCode: 'stats-family', date: '2026-10-24', time: '11:00', stool: true },
  { _id: 'solid-only', familyCode: 'stats-family', date: '2026-10-24', time: '10:00', solidFood: true, solidFoodGrams: 15 }
)
const queries = []
const db = {
  command: {},
  collection(name) {
    assert.strictEqual(name, 'feeding_records')
    const query = { orders: [], fields: null, offset: 0,
      where(conditions) { assert.strictEqual(conditions.familyCode, 'stats-family'); return this },
      orderBy(key, direction) { this.orders.push([key, direction]); return this },
      field(fields) { this.fields = fields; return this },
      skip(offset) { this.offset = offset; return this },
      limit(size) { this.size = size; return this },
      async get() {
        queries.push(this)
        const selected = rows.slice(this.offset, this.offset + this.size)
        return { data: selected.map(row => this.fields
          ? Object.fromEntries(Object.keys(this.fields).filter(key => this.fields[key]).map(key => [key, row[key]])) : row) }
      }
    }
    return query
  }
}
const originalLoad = Module._load
let main
try {
  Module._load = function(request, parent, isMain) {
    if (request === 'wx-server-sdk') return { init() {}, DYNAMIC_CURRENT_ENV: 'test', database: () => db }
    return originalLoad.call(this, request, parent, isMain)
  }
  main = require('../cloudfunctions/getStats/index.js').main
} finally { Module._load = originalLoad }

main({ familyCode: 'stats-family', range: 'all' }).then(result => {
  assert.strictEqual(result.success, true)
  assert.strictEqual(queries.length, 3)
  const required = ['date', 'time', '_id', 'breastMilk', 'formula', 'stool', 'solidFood', 'solidFoodGrams'].sort()
  queries.forEach(query => {
    assert.ok(query.fields, 'statistics query should project only aggregation and stable-sort fields')
    assert.deepStrictEqual(Object.keys(query.fields).filter(key => query.fields[key]).sort(), required)
    assert.deepStrictEqual(query.orders, [['date', 'desc'], ['time', 'desc'], ['_id', 'desc']])
  })
  assert.strictEqual(result.stats.totalCount, 201)
  assert.strictEqual(result.stats.totalMilk, 201 * 50)
  assert.strictEqual(result.stats.totalStool, 2)
  assert.strictEqual(result.stats.totalSolid, 2)
  assert.strictEqual(result.stats.totalSolidGrams, 25)
  assert.strictEqual(result.dailyStats.length, 1)
  assert.strictEqual(result.dailyStats[0].stoolCount, 2)
  console.log('ok - statistics project required fields while preserving all pages, stable sort and totals')
}).catch(err => { console.error(err); process.exitCode = 1 })
