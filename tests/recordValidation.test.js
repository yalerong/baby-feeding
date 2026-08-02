const assert = require('assert')
const validation = require('../cloudfunctions/addRecord/validation.js')

function test(name, fn) {
  try {
    fn()
    console.log(`ok - ${name}`)
  } catch (err) {
    console.error(`not ok - ${name}`)
    throw err
  }
}

test('rejects enabled solid food without a positive amount and name', () => {
  assert.strictEqual(validation.normalizeSolidFood({ solidFood: true, solidFoodDishName: '', solidFoodGrams: 20 }), null)
  assert.strictEqual(validation.normalizeSolidFood({ solidFood: true, solidFoodDishName: '米糊', solidFoodGrams: 0 }), null)
  assert.strictEqual(validation.normalizeSolidFood({ solidFood: true, solidFoodDishName: '米糊', solidFoodGrams: -5 }), null)
})

test('normalizes valid solid-food fields for storage', () => {
  assert.deepStrictEqual(validation.normalizeSolidFood({
    solidFood: true,
    solidFoodDishId: 'rice',
    solidFoodDishName: ' 米糊 ',
    solidFoodGrams: '20'
  }), {
    solidFood: true,
    solidFoodDishId: 'rice',
    solidFoodDishName: '米糊',
    solidFoodGrams: 20
  })
})
