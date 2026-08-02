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

test('generates seven days with age-appropriate meal slots for a 6 month baby', () => {
  const plan = menuData.generateWeeklyMenu({
    birthDate: '2026-02-24',
    weekStart: '2026-08-24'
  })

  assert.strictEqual(plan.ageMonth, 6)
  assert.strictEqual(plan.status, 'ready')
  assert.strictEqual(plan.days.length, 7)
  assert.deepStrictEqual(Object.keys(plan.days[0].meals), ['lunch', 'dinner'])
  assert.ok(plan.days[0].meals.lunch.length > 0)
})

test('excludes dishes containing a food marked as a suspected allergen', () => {
  const plan = menuData.generateWeeklyMenu({
    birthDate: '2026-02-24',
    weekStart: '2026-08-24',
    excludedIngredients: ['南瓜']
  })
  const dishes = plan.days.flatMap(day => Object.values(day.meals).flat())
  assert.ok(dishes.every(dish => !dish.ingredients.includes('南瓜')))
})

test('keeps suspected allergens out of replacement candidates', () => {
  assert.ok(menuData.getDishesFor(7, 'lunch').some(dish => dish.ingredients.includes('熟蛋黄')))
  const candidates = menuData.getDishesFor(7, 'lunch', ['熟蛋黄'])
  assert.ok(candidates.every(dish => !dish.ingredients.includes('熟蛋黄')))
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
