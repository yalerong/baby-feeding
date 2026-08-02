const assert = require('assert')
const solidFood = require('../utils/solidFood.js')

function test(name, fn) {
  try {
    fn()
    console.log(`ok - ${name}`)
  } catch (err) {
    console.error(`not ok - ${name}`)
    throw err
  }
}

test('does not persist solid-food fields when the option is off', () => {
  assert.deepStrictEqual(solidFood.normalize({
    enabled: false,
    dishId: 'iron-rice-cereal',
    grams: '30'
  }), {
    solidFood: false,
    solidFoodDishId: '',
    solidFoodDishName: '',
    solidFoodGrams: 0
  })
})

test('links a selected solid food to the menu dish and gram amount', () => {
  assert.deepStrictEqual(solidFood.normalize({
    enabled: true,
    dishId: 'iron-rice-cereal',
    grams: '30'
  }), {
    solidFood: true,
    solidFoodDishId: 'iron-rice-cereal',
    solidFoodDishName: '铁强化米粉糊',
    solidFoodGrams: 30
  })
})

test('rejects enabled solid food without a valid menu dish and amount', () => {
  assert.strictEqual(solidFood.normalize({ enabled: true, dishId: 'missing', grams: '30' }), null)
  assert.strictEqual(solidFood.normalize({ enabled: true, dishId: 'iron-rice-cereal', grams: '0' }), null)
})

test('accepts a manually entered solid-food name when it is not in frequent dishes', () => {
  assert.deepStrictEqual(solidFood.normalize({
    enabled: true,
    customName: '自制番薯泥',
    grams: '25'
  }), {
    solidFood: true,
    solidFoodDishId: '',
    solidFoodDishName: '自制番薯泥',
    solidFoodGrams: 25
  })
})

test('returns a small set of age-appropriate frequent dishes', () => {
  const dishes = solidFood.getFrequentDishes(6)
  assert.ok(dishes.length > 0 && dishes.length <= 6)
  assert.ok(dishes.every(dish => dish.ageMinMonth <= 6 && dish.ageMaxMonth >= 6))
  assert.ok(dishes.some(dish => dish.id === 'iron-rice-cereal'))
})

test('restores the last valid solid-food selection for quick entry', () => {
  assert.deepStrictEqual(solidFood.restoreLastSelection({
    dishId: 'iron-rice-cereal',
    grams: 30
  }), {
    solidFood: true,
    solidFoodDishId: 'iron-rice-cereal',
    solidFoodDishName: '铁强化米粉糊',
    solidFoodGrams: 30
  })
  assert.strictEqual(solidFood.restoreLastSelection({ dishId: 'missing', grams: 30 }), null)
})
