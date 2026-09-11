const assert = require('assert')
const menuData = require('../utils/menuData.js')
const menuRefresh = require('../utils/menuRefresh.js')

function test(name, fn) {
  try {
    fn()
    console.log(`ok - ${name}`)
  } catch (err) {
    console.error(`not ok - ${name}`)
    throw err
  }
}

test('lists foods unlocked since the menu was saved, and nothing for legacy menus without a snapshot', () => {
  assert.deepStrictEqual(menuRefresh.getNewlyUnlockedFoods(['米粉', '南瓜', '胡萝卜'], ['米粉']), ['南瓜', '胡萝卜'])
  assert.deepStrictEqual(menuRefresh.getNewlyUnlockedFoods(['米粉', '南瓜'], ['米粉', '南瓜']), [])
  assert.deepStrictEqual(menuRefresh.getNewlyUnlockedFoods(['米粉'], null), [])
  assert.deepStrictEqual(menuRefresh.getNewlyUnlockedFoods(null, []), [])
})

test('refreshes only regular days after today and keeps earlier days untouched', () => {
  const birthDate = '2026-03-05'
  const weekStart = '2026-09-21'
  const saved = menuData.generateWeeklyMenu({ birthDate, weekStart, excludedIngredients: [], unlockedFoods: ['米粉'] })
  const generated = menuData.generateWeeklyMenu({ birthDate, weekStart, excludedIngredients: [], unlockedFoods: ['米粉', '南瓜', '猪肉', '土豆'] })
  const today = '2026-09-23'
  const { plan, changedDates } = menuRefresh.refreshFutureDays({ plan: saved, generated, today })
  assert.deepStrictEqual(changedDates, ['2026-09-24', '2026-09-25', '2026-09-26', '2026-09-27'])
  // 今天和之前的三天原样保留
  for (let i = 0; i < 3; i++) assert.deepStrictEqual(plan.days[i], saved.days[i])
  // 之后的日子换成了新生成的
  for (let i = 3; i < 7; i++) assert.deepStrictEqual(plan.days[i], generated.days[i])
  assert.ok(Object.keys(plan.nutritionSummary).length > 0)
})

test('never touches milk or trial-phase days', () => {
  const plan = { days: [{ date: '2026-09-22', phase: 'trial', meals: {} }, { date: '2026-09-23', phase: 'milk', meals: {} }] }
  const generated = { days: [{ date: '2026-09-22', phase: 'regular', meals: {} }, { date: '2026-09-23', phase: 'regular', meals: {} }] }
  const result = menuRefresh.refreshFutureDays({ plan, generated, today: '2026-09-20' })
  assert.deepStrictEqual(result.changedDates, [])
  assert.deepStrictEqual(result.plan.days, plan.days)
})
