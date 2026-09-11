const assert = require('assert')
const menuData = require('../utils/menuData.js')

function test(name, fn) {
  try {
    fn()
    console.log(`ok - ${name}`)
  } catch (err) {
    console.error(`not ok - ${name}`)
    throw err
  }
}

test('does not generate complementary food before 6 months', () => {
  const plan = menuData.generateWeeklyMenu({
    birthDate: '2026-02-24',
    weekStart: '2026-05-25'
  })

  assert.strictEqual(plan.ageMonth, 3)
  assert.strictEqual(plan.status, 'milk_only')
  assert.strictEqual(plan.days.length, 0)
})

test('first two weeks of complementary food only schedule iron-fortified rice cereal', () => {
  const plan = menuData.generateWeeklyMenu({
    birthDate: '2026-02-24',
    weekStart: '2026-08-24'
  })

  assert.strictEqual(plan.ageMonth, 6)
  assert.strictEqual(plan.status, 'ready')
  assert.strictEqual(plan.days.length, 7)
  plan.days.forEach(day => {
    assert.strictEqual(day.phase, 'trial')
    assert.deepStrictEqual(Object.keys(day.meals), ['lunch'])
    assert.strictEqual(day.meals.lunch[0].id, 'iron-rice-cereal')
  })

  const secondWeek = menuData.generateWeeklyMenu({ birthDate: '2026-02-24', weekStart: '2026-08-31' })
  assert.ok(secondWeek.days.every(day => day.phase === 'trial'))
})

test('a week straddling the six month mark mixes milk days and trial days', () => {
  const plan = menuData.generateWeeklyMenu({
    birthDate: '2026-02-26',
    weekStart: '2026-08-24'
  })

  assert.strictEqual(plan.status, 'ready')
  assert.strictEqual(plan.days[0].phase, 'milk')
  assert.deepStrictEqual(plan.days[0].meals, {})
  assert.strictEqual(plan.days[2].phase, 'trial')
})

test('generates seven days with age-appropriate meal slots after the trial period', () => {
  const plan = menuData.generateWeeklyMenu({
    birthDate: '2026-02-24',
    weekStart: '2026-09-14'
  })

  assert.strictEqual(plan.ageMonth, 6)
  assert.strictEqual(plan.status, 'ready')
  assert.strictEqual(plan.days.length, 7)
  assert.ok(plan.days.every(day => day.phase === 'regular'))
  assert.deepStrictEqual(Object.keys(plan.days[0].meals), ['lunch', 'dinner'])
  assert.ok(plan.days[0].meals.lunch.length > 0)
})

test('menu only schedules dishes made from unlocked foods, with cereal as fallback', () => {
  const locked = menuData.generateWeeklyMenu({
    birthDate: '2026-02-24',
    weekStart: '2026-09-14',
    unlockedFoods: []
  })
  locked.days.forEach(day => {
    Object.keys(day.meals).forEach(type => {
      day.meals[type].forEach(dish => assert.strictEqual(dish.id, 'iron-rice-cereal'))
    })
  })
  assert.strictEqual(locked.lockedFallback, true)

  const partial = menuData.generateWeeklyMenu({
    birthDate: '2026-02-24',
    weekStart: '2026-09-14',
    unlockedFoods: ['南瓜', '猪肉', '土豆']
  })
  const dishes = partial.days.flatMap(day => Object.values(day.meals).flat())
  dishes.forEach(dish => {
    if (dish.lockedFallback) return
    menuData.getDishFoods(dish).forEach(food => {
      assert.ok(['米粉', '南瓜', '猪肉', '土豆'].includes(food), `${dish.name} uses locked food ${food}`)
    })
  })
})

test('excludes dishes containing a food marked as a suspected allergen', () => {
  const plan = menuData.generateWeeklyMenu({
    birthDate: '2026-02-24',
    weekStart: '2026-09-14',
    excludedIngredients: ['南瓜']
  })
  const dishes = plan.days.flatMap(day => Object.values(day.meals).flat())
  assert.ok(dishes.length > 0)
  assert.ok(dishes.every(dish => !dish.ingredients.includes('南瓜')))
})

test('keeps suspected allergens out of replacement candidates', () => {
  assert.ok(menuData.getDishesFor(7, 'lunch').some(dish => dish.ingredients.includes('熟蛋黄')))
  const candidates = menuData.getDishesFor(7, 'lunch', ['熟蛋黄'])
  assert.ok(candidates.every(dish => !dish.ingredients.includes('熟蛋黄')))
})

test('excluding a canonical food removes dishes using any of its ingredient variants', () => {
  const eggDishes = menuData.getDishesFor(12, 'breakfast').filter(dish => menuData.getDishFoods(dish).includes('鸡蛋'))
  assert.ok(eggDishes.length > 0)
  const candidates = menuData.getDishesFor(12, 'breakfast', ['鸡蛋'])
  assert.ok(candidates.every(dish => !menuData.getDishFoods(dish).includes('鸡蛋')))
})

test('maps ingredient variants to canonical trial foods and drops non-foods', () => {
  assert.deepStrictEqual(menuData.getIngredientFoods('熟蛋黄'), ['鸡蛋'])
  assert.deepStrictEqual(menuData.getIngredientFoods('牛肉末'), ['牛肉'])
  assert.deepStrictEqual(menuData.getIngredientFoods('温水'), [])
  assert.deepStrictEqual(menuData.getIngredientFoods('西葫芦或胡萝卜碎'), ['西葫芦', '胡萝卜'])
  assert.deepStrictEqual(menuData.getIngredientFoods('南瓜'), ['南瓜'])
})

test('every dish ingredient resolves to clean canonical trial foods', () => {
  const seen = {}
  menuData.DISHES.forEach(dish => {
    menuData.getDishFoods(dish).forEach(food => { seen[food] = true })
  })
  const foods = Object.keys(seen)
  assert.ok(foods.length > 0)
  foods.forEach(food => {
    assert.ok(!/温水|淀粉|或/.test(food), `non-food or compound name leaked into trial foods: ${food}`)
  })
  assert.ok(!foods.includes('熟蛋黄') && !foods.includes('牛肉末') && !foods.includes('软米饭'))
})

test('adds add-on meals only after the chewing-practice stage', () => {
  const plan = menuData.generateWeeklyMenu({
    birthDate: '2026-02-24',
    weekStart: '2026-11-24'
  })

  assert.strictEqual(plan.ageMonth, 9)
  assert.deepStrictEqual(Object.keys(plan.days[0].meals), ['breakfast', 'lunch', 'dinner', 'snack'])
})

test('defaults planning week to the first complementary food week before 6 months', () => {
  const weekStart = menuData.getDefaultPlanningWeekStart({
    birthDate: '2026-02-24',
    today: '2026-05-31'
  })

  assert.strictEqual(weekStart, '2026-08-24')
})

test('monthly menu is composed from four consecutive weekly menus', () => {
  const month = menuData.generateMonthlyMenu({
    birthDate: '2026-02-24',
    monthStart: '2026-09-01'
  })

  assert.strictEqual(month.weeks.length, 4)
  assert.deepStrictEqual(month.weeks.map(w => w.weekStart), [
    '2026-09-01',
    '2026-09-08',
    '2026-09-15',
    '2026-09-22'
  ])
  assert.ok(month.weeks.every(w => w.status === 'ready'))
})

test('dish detail includes recipe, nutrition tags, texture and cautions', () => {
  const plan = menuData.generateWeeklyMenu({
    birthDate: '2026-02-24',
    weekStart: '2026-10-24'
  })
  const firstDish = plan.days[0].meals.lunch[0]
  const detail = menuData.getDishById(firstDish.id)

  assert.ok(detail.name)
  assert.ok(detail.texture)
  assert.ok(detail.nutritionTags.length > 0)
  assert.ok(detail.steps.length > 0)
  assert.ok(detail.cautions.length > 0)
})

test('can replace a dish with another age-appropriate option', () => {
  const plan = menuData.generateWeeklyMenu({
    birthDate: '2026-02-24',
    weekStart: '2026-09-24'
  })
  const current = plan.days[0].meals.breakfast[0]
  const replacement = menuData.pickReplacementDish({
    ageMonth: plan.ageMonth,
    mealType: 'breakfast',
    currentDishId: current.id
  })

  assert.ok(replacement)
  assert.notStrictEqual(replacement.id, current.id)
  assert.ok(replacement.ageMinMonth <= plan.ageMonth)
})

test('dish hall filters options by age month and meal type', () => {
  const dishes = menuData.getDishesFor(6, 'lunch')

  assert.ok(dishes.length > 0)
  assert.ok(dishes.every(dish => dish.ageMinMonth <= 6 && dish.ageMaxMonth >= 6))
  assert.ok(dishes.every(dish => dish.mealTypes.includes('lunch')))
})

test('dish catalog exposes age, meal, nutrition and recipe summaries', () => {
  const catalog = menuData.getDishCatalog()
  const dish = catalog[0]

  assert.ok(catalog.length > 0)
  assert.ok(dish.ageLabel.includes('月龄'))
  assert.ok(dish.mealLabel.length > 0)
  assert.ok(dish.nutritionLabel.length > 0)
  assert.ok(dish.ingredientsLabel.length > 0)
  assert.ok(dish.servingLabel.length > 0)
  assert.ok(dish.stepsPreview.length > 0)
  assert.ok(dish.cautionsPreview.length > 0)
})

test('dish catalog can be filtered by age range, meal type and nutrition tag', () => {
  const catalog = menuData.getDishCatalog({
    ageRange: '6',
    mealType: 'lunch',
    nutritionTag: '富铁'
  })

  assert.ok(catalog.length > 0)
  assert.ok(catalog.every(dish => dish.ageMinMonth <= 6 && dish.ageMaxMonth >= 6))
  assert.ok(catalog.every(dish => dish.mealTypes.includes('lunch')))
  assert.ok(catalog.every(dish => dish.nutritionTags.includes('富铁')))
})

test('dish catalog has enough choices for each complementary feeding stage', () => {
  assert.ok(menuData.getDishCatalog({ ageRange: '6' }).length >= 6)
  assert.ok(menuData.getDishCatalog({ ageRange: '7-8' }).length >= 8)
  assert.ok(menuData.getDishCatalog({ ageRange: '9-11' }).length >= 8)
  assert.ok(menuData.getDishCatalog({ ageRange: '12+' }).length >= 6)
})

test('recognises canonical foods inside a hand-typed dish name', () => {
  assert.deepStrictEqual(menuData.matchFoodsInName('胡萝卜泥'), ['胡萝卜'])
  assert.deepStrictEqual(menuData.matchFoodsInName('苹果燕麦糊'), ['苹果', '燕麦'])
  assert.deepStrictEqual(menuData.matchFoodsInName('自制番薯泥'), ['红薯'])
  assert.deepStrictEqual(menuData.matchFoodsInName('三文鱼肉泥'), ['三文鱼'])
  assert.deepStrictEqual(menuData.matchFoodsInName('南瓜米糊'), ['南瓜', '米粉'])
  assert.deepStrictEqual(menuData.matchFoodsInName('宝宝爱心餐'), [])
  assert.deepStrictEqual(menuData.matchFoodsInName('玉米泥', ['玉米']), ['玉米'])
})

test('resolves a custom food input to one canonical name or keeps the typed text', () => {
  assert.strictEqual(menuData.resolveFoodName(' 胡萝卜泥 '), '胡萝卜')
  assert.strictEqual(menuData.resolveFoodName('玉米'), '玉米')
  assert.strictEqual(menuData.resolveFoodName('胡萝卜土豆泥'), '胡萝卜土豆泥')
  assert.strictEqual(menuData.resolveFoodName(''), '')
})

test('drops trial names that are catalog foods or derivable dish names from the extra-food dictionary', () => {
  assert.deepStrictEqual(menuData.filterExtraFoods(['胡萝卜', '胡萝卜泥', '玉米', '', '南瓜米糊']), ['玉米'])
  assert.deepStrictEqual(menuData.matchFoodsInName('胡萝卜泥', menuData.filterExtraFoods(['胡萝卜泥'])), ['胡萝卜'])
})
