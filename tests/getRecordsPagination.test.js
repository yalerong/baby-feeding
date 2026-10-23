const assert = require('assert')
const { fetchAllRecords } = require('../cloudfunctions/getRecords/fetchAll.js')

function test(name, fn) {
  return Promise.resolve().then(fn).then(() => console.log(`ok - ${name}`))
}

test('fetches every page for a reminder calculation range', async () => {
  const records = Array.from({ length: 217 }, (_, index) => ({ _id: String(index) }))
  let calls = 0
  const sorts = []
  let currentSort = []
  const collection = {
    where() { currentSort = []; return this },
    orderBy(field, direction) { currentSort.push(`${field}:${direction}`); return this },
    skip(offset) { this.offset = offset; return this },
    limit(size) { this.size = size; return this },
    async get() {
      calls += 1
      sorts.push(currentSort.join(','))
      return { data: records.slice(this.offset, this.offset + this.size) }
    }
  }

  const result = await fetchAllRecords(collection, { familyCode: 'FAMILY' })
  assert.strictEqual(result.length, 217)
  assert.strictEqual(calls, 3)
  // 同一天同一分钟的记录顺序必须确定，否则翻页会重复或漏记录
  assert.deepStrictEqual(sorts, [
    'date:asc,time:asc,_id:asc',
    'date:asc,time:asc,_id:asc',
    'date:asc,time:asc,_id:asc'
  ])
}).catch(err => { console.error(err); process.exitCode = 1 })
