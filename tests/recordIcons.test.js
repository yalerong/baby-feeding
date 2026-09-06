const assert = require('assert')
const { recordIcons } = require('../utils/recordIcons.js')

function test(name, fn) {
  try {
    fn()
    console.log(`ok - ${name}`)
  } catch (err) {
    console.error(`not ok - ${name}`)
    throw err
  }
}

test('shows every matching icon when a record mixes milk, solid food and stool', () => {
  assert.deepStrictEqual(recordIcons({ formula: 120, solidFood: true }), ['🍼', '🍚'])
  assert.deepStrictEqual(recordIcons({ breastMilk: 60, solidFood: true, stool: true }), ['🍼', '🍚', '💩'])
  assert.deepStrictEqual(recordIcons({ solidFood: true, stool: true }), ['🍚', '💩'])
})

test('keeps single-type records unchanged and falls back to a note icon', () => {
  assert.deepStrictEqual(recordIcons({ breastMilk: 60, formula: 0 }), ['🍼'])
  assert.deepStrictEqual(recordIcons({ solidFood: true }), ['🍚'])
  assert.deepStrictEqual(recordIcons({ stool: true }), ['💩'])
  assert.deepStrictEqual(recordIcons({}), ['📝'])
})
