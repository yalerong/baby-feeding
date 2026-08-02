const assert = require('assert')
const { fetchAllRecords } = require('../cloudfunctions/getRecords/fetchAll.js')

function test(name, fn) {
  return Promise.resolve().then(fn).then(() => console.log(`ok - ${name}`))
}

test('fetches every page for a reminder calculation range', async () => {
  const records = Array.from({ length: 217 }, (_, index) => ({ _id: String(index) }))
  let calls = 0
  const collection = {
    where() { return this },
    orderBy() { return this },
    skip(offset) { this.offset = offset; return this },
    limit(size) { this.size = size; return this },
    async get() {
      calls += 1
      return { data: records.slice(this.offset, this.offset + this.size) }
    }
  }

  const result = await fetchAllRecords(collection, { familyCode: 'FAMILY' })
  assert.strictEqual(result.length, 217)
  assert.strictEqual(calls, 3)
}).catch(err => { console.error(err); process.exitCode = 1 })
