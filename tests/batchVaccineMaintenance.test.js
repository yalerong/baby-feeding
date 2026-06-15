const assert = require('assert')
const maintenance = require('../cloudfunctions/batchVaccine/maintenance.js')

function test(name, fn) {
  try {
    fn()
    console.log(`ok - ${name}`)
  } catch (err) {
    console.error(`not ok - ${name}`)
    throw err
  }
}

test('continues deleting vaccine pages until a short page is reached', async () => {
  const pages = [
    [{ _id: 'a' }, { _id: 'b' }],
    [{ _id: 'c' }],
    []
  ]
  const removed = []
  const collection = {
    where() {
      return {
        limit() {
          return {
            async get() {
              return { data: pages.shift() || [] }
            }
          }
        }
      }
    },
    doc(id) {
      return {
        async remove() {
          removed.push(id)
        }
      }
    }
  }

  const count = await maintenance.removeAllForFamily(collection, 'FAMILY', 2)

  assert.strictEqual(count, 3)
  assert.deepStrictEqual(removed, ['a', 'b', 'c'])
})
