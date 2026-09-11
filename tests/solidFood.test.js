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

test('ranks frequent dishes by real feeding history before catalog fillers', () => {
  const records = [
    { solidFood: true, solidFoodDishId: 'pumpkin-rice-puree', solidFoodDishName: '南瓜米糊' },
    { solidFood: true, solidFoodDishId: 'pumpkin-rice-puree', solidFoodDishName: '南瓜米糊' },
    { solidFood: true, solidFoodDishId: '', solidFoodDishName: '自制番薯泥' },
    { solidFood: true, solidFoodDishId: 'iron-rice-cereal', solidFoodDishName: '铁强化米粉糊' },
    { solidFood: true, solidFoodDishId: '', solidFoodDishName: '自制番薯泥' },
    { solidFood: true, solidFoodDishId: '', solidFoodDishName: '自制番薯泥' },
    { solidFood: false, solidFoodDishId: 'yam-puree', solidFoodDishName: '山药泥' }
  ]
  const ranked = solidFood.rankFrequentDishes({ records, ageMonth: 6 })
  assert.strictEqual(ranked.length, 6)
  assert.strictEqual(ranked[0].name, '自制番薯泥')
  assert.strictEqual(ranked[0].id, '')
  assert.strictEqual(ranked[1].id, 'pumpkin-rice-puree')
  assert.strictEqual(ranked[2].id, 'iron-rice-cereal')
  assert.ok(ranked.slice(3).every(item => item.id && item.imageEmoji))
})

test('falls back to the age catalog when there is no solid-food history', () => {
  const ranked = solidFood.rankFrequentDishes({ records: [], ageMonth: 6 })
  assert.strictEqual(ranked.length, 6)
  assert.ok(ranked.every(item => item.id && item.name && item.imageEmoji))
})

test('maps a record to canonical trial foods from dish, custom-dish foods or the typed name', () => {
  assert.deepStrictEqual(solidFood.getCanonicalFoods({ dishId: 'pumpkin-rice-puree' }), ['南瓜', '米粉'])
  assert.deepStrictEqual(solidFood.getCanonicalFoods({ dishId: '', name: '宝宝爱心餐', foods: ['胡萝卜', '土豆'] }), ['胡萝卜', '土豆'])
  assert.deepStrictEqual(solidFood.getCanonicalFoods({ dishId: '', name: '胡萝卜泥' }), ['胡萝卜'])
  assert.deepStrictEqual(solidFood.getCanonicalFoods({ dishId: '', name: '玉米糊', extraFoods: ['玉米'] }), ['玉米'])
  assert.deepStrictEqual(solidFood.getCanonicalFoods({ dishId: '', name: '神秘料理' }), [])
})

test('offers custom dishes from the saved weekly plan right after real history', () => {
  const plan = { days: [{ meals: { lunch: [{ id: 'custom-1', name: '胡萝卜土豆泥', isCustom: true, ingredients: ['胡萝卜', '土豆'] }], dinner: [{ id: 'pork-potato-puree', name: '猪肉土豆泥' }] } }] }
  const custom = solidFood.customDishesFromPlan(plan)
  assert.deepStrictEqual(custom, [{ id: '', name: '胡萝卜土豆泥', imageEmoji: '🍱', foods: ['胡萝卜', '土豆'] }])
  const ranked = solidFood.rankFrequentDishes({ records: [{ solidFood: true, solidFoodDishId: '', solidFoodDishName: '南瓜泥' }], ageMonth: 6, customDishes: custom })
  assert.strictEqual(ranked[0].name, '南瓜泥')
  assert.strictEqual(ranked[1].name, '胡萝卜土豆泥')
  assert.deepStrictEqual(ranked[1].foods, ['胡萝卜', '土豆'])
})

test('keeps custom-dish foods from feeding history on the frequent list', () => {
  const records = [{ solidFood: true, solidFoodDishId: '', solidFoodDishName: '宝宝爱心餐', solidFoodFoods: ['胡萝卜', '土豆'] }]
  const ranked = solidFood.rankFrequentDishes({ records, ageMonth: 6 })
  assert.strictEqual(ranked[0].name, '宝宝爱心餐')
  assert.deepStrictEqual(ranked[0].foods, ['胡萝卜', '土豆'])
})
