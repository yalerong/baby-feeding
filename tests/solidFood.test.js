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
    solidFoodGrams: 30,
    solidFoodFoods: []
  })
  assert.strictEqual(solidFood.restoreLastSelection({ dishId: 'missing', grams: 30 }), null)
  // 自定义菜的食材要跟着上次选择一起恢复
  assert.deepStrictEqual(solidFood.restoreLastSelection({ dishId: '', name: '宝宝爱心餐', grams: 20, solidFoodFoods: ['胡萝卜', '土豆'] }).solidFoodFoods, ['胡萝卜', '土豆'])
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

test('keeps the latest custom-dish foods from feeding history on the frequent list', () => {
  const records = [
    { solidFood: true, solidFoodDishId: '', solidFoodDishName: '宝宝爱心餐', solidFoodFoods: ['胡萝卜', '土豆'] },
    { solidFood: true, solidFoodDishId: '', solidFoodDishName: '宝宝爱心餐', solidFoodFoods: ['胡萝卜', '南瓜'] }
  ]
  const ranked = solidFood.rankFrequentDishes({ records, ageMonth: 6 })
  assert.strictEqual(ranked[0].name, '宝宝爱心餐')
  assert.deepStrictEqual(ranked[0].foods, ['胡萝卜', '南瓜'])
})

test('canonicalises alias ingredients of custom dishes from the weekly plan', () => {
  const plan = { days: [{ meals: { lunch: [{ id: 'custom-1', name: '蛋黄番薯泥', isCustom: true, ingredients: ['蛋黄', '番薯', '玉米', '温水'] }] } }] }
  assert.deepStrictEqual(solidFood.customDishesFromPlan(plan)[0].foods, ['鸡蛋', '红薯', '玉米'])
})

test('keeps current-week custom dishes on the picker even when history already fills it', () => {
  const records = []
  for (let i = 0; i < 8; i++) records.push({ solidFood: true, solidFoodDishId: '', solidFoodDishName: `历史菜${i}` })
  const ranked = solidFood.rankFrequentDishes({ records, ageMonth: 6, customDishes: [{ name: '宝宝爱心餐', foods: ['胡萝卜'] }] })
  assert.strictEqual(ranked.length, 6)
  assert.ok(ranked.some(item => item.name === '宝宝爱心餐'))
})

test('a current-week custom dish overrides same-named history ingredients', () => {
  const records = [{ solidFood: true, solidFoodDishId: '', solidFoodDishName: '宝宝爱心餐', solidFoodFoods: ['胡萝卜'] }]
  const ranked = solidFood.rankFrequentDishes({ records, ageMonth: 6, customDishes: [{ name: '宝宝爱心餐', foods: ['胡萝卜', '土豆'] }] })
  assert.strictEqual(ranked.filter(item => item.name === '宝宝爱心餐').length, 1)
  assert.deepStrictEqual(ranked[0].foods, ['胡萝卜', '土豆'])
})

test('a same-named weekly dish does not steal a slot from genuine history', () => {
  const records = []
  for (let i = 0; i < 6; i++) records.push({ solidFood: true, solidFoodDishId: '', solidFoodDishName: `历史菜${i}` })
  const ranked = solidFood.rankFrequentDishes({ records, ageMonth: 6, customDishes: [{ name: '历史菜0', foods: ['胡萝卜'] }] })
  assert.deepStrictEqual(ranked.map(item => item.name).sort(), ['历史菜0', '历史菜1', '历史菜2', '历史菜3', '历史菜4', '历史菜5'])
})

test('normalises the foods array the same way the cloud function stores it', () => {
  const many = Array.from({ length: 12 }, (_, i) => `食材${i}`)
  assert.strictEqual(solidFood.normalizeFoods(many).length, 10)
  assert.deepStrictEqual(solidFood.normalizeFoods([' 胡萝卜 ', '胡萝卜', '']), ['胡萝卜'])
})

test('builds quick-entry tags from the unlock list and excludes allergic foods', () => {
  const names = solidFood.getQuickFoodNames({
    ageMonth: 6,
    trials: [
      { foodName: '胡萝卜', status: 'unlocked', trialCount: 3 },
      { foodName: '鸡肝', status: 'tracking', trialCount: 0, isCustom: true },
      { foodName: '鸡肉', status: 'allergic', trialCount: 1 }
    ]
  })
  assert.ok(names.includes('米粉'))
  assert.ok(names.includes('南瓜'))
  assert.ok(names.includes('胡萝卜'))
  assert.ok(names.includes('鸡肝'))
  assert.ok(!names.includes('鸡肉'))
})

test('turns selected food tags into a stable quick-entry dish name', () => {
  assert.strictEqual(solidFood.buildQuickFoodName(['米粉', '南瓜']), '南瓜米糊')
  assert.strictEqual(solidFood.buildQuickFoodName(['鸡肝', '米粉']), '鸡肝米糊')
  assert.strictEqual(solidFood.buildQuickFoodName(['南瓜', '南瓜', '米粉']), '南瓜米糊')
})

test('a weekly dish whose same-named history ranks below the cut still gets a slot', () => {
  const records = []
  for (let i = 0; i < 7; i++) for (let j = 0; j <= i; j++) records.push({ solidFood: true, solidFoodDishId: '', solidFoodDishName: `历史菜${i}` })
  // 历史菜0 只出现 1 次，排第 7；本周菜单里有同名自定义菜
  const ranked = solidFood.rankFrequentDishes({ records, ageMonth: 6, customDishes: [{ name: '历史菜0', foods: ['胡萝卜'] }] })
  assert.strictEqual(ranked.length, 6)
  const hit = ranked.find(item => item.name === '历史菜0')
  assert.ok(hit)
  assert.deepStrictEqual(hit.foods, ['胡萝卜'])
  assert.ok(!ranked.some(item => item.name === '历史菜1'), 'the lowest-ranked genuine history entry gives way')
})

test('library dishes fill the picker after history and before catalog fillers, and back-fill foods', () => {
  const records = [{ solidFood: true, solidFoodDishId: '', solidFoodDishName: '南瓜泥' }, { solidFood: true, solidFoodDishId: '', solidFoodDishName: '宝宝爱心餐' }]
  const library = solidFood.libraryDishesFromDocs([
    { _id: 'a', name: '宝宝爱心餐', ingredients: ['蛋黄', '番薯'] },
    { _id: 'b', name: '牛油果泥', foods: ['牛油果'], imageEmoji: '🥑' }
  ])
  assert.deepStrictEqual(library[0].foods, ['鸡蛋', '红薯'])
  const ranked = solidFood.rankFrequentDishes({ records, ageMonth: 6, libraryDishes: library })
  assert.strictEqual(ranked.length, 6)
  assert.strictEqual(ranked[2].name, '牛油果泥')
  assert.strictEqual(ranked[2].imageEmoji, '🥑')
  assert.deepStrictEqual(ranked.find(item => item.name === '宝宝爱心餐').foods, ['鸡蛋', '红薯'])
  assert.ok(ranked.slice(3).every(item => item.id))
})

test('a full picker still back-fills foods onto a same-named legacy history entry from the library', () => {
  const records = []
  for (let i = 0; i < 6; i++) records.push({ solidFood: true, solidFoodDishId: '', solidFoodDishName: `历史菜${i}` })
  const ranked = solidFood.rankFrequentDishes({ records, ageMonth: 6, libraryDishes: [{ name: '历史菜3', foods: ['胡萝卜'] }, { name: '新菜', foods: ['土豆'] }] })
  assert.strictEqual(ranked.length, 6)
  assert.deepStrictEqual(ranked.find(item => item.name === '历史菜3').foods, ['胡萝卜'])
  assert.ok(!ranked.some(item => item.name === '新菜'))
})
