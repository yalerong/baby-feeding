// 菜品详情页必须显示菜单页跳转前缓存的那份菜单，而不是自己不带解锁状态重新生成一份
const assert = require('assert')
const menuData = require('../utils/menuData.js')

const birthDate = '2026-03-05'
const weekStart = '2026-09-21'
const storage = { babyBirthDate: birthDate, familyCode: 'FAM' }
const shown = menuData.generateWeeklyMenu({ birthDate, weekStart, excludedIngredients: [], unlockedFoods: ['米粉', '南瓜'] })
const unrestricted = menuData.generateWeeklyMenu({ birthDate, weekStart })
assert.notStrictEqual(shown.days[1].meals.lunch[0].id, unrestricted.days[1].meals.lunch[0].id, 'fixture must differ between restricted and unrestricted plans')
storage[`menuPlanCache:${weekStart}`] = shown

let pageConfig = null
global.Page = config => { pageConfig = config }
global.wx = {
  getStorageSync: key => storage[key] || '',
  setStorageSync: (key, value) => { storage[key] = value },
  removeStorageSync: key => { delete storage[key] },
  showToast: () => {},
  cloud: {
    callFunction: ({ name }) => {
      if (name === 'foodTrial') return Promise.reject(new Error('trial service down'))
      if (name === 'weeklyMenu') return Promise.resolve({ result: { success: true, data: null } })
      return Promise.resolve({ result: { success: true } })
    }
  }
}
console.error = () => {}  // 试吃服务故意不可用，压掉预期内的错误日志
require('../pages/menuDish/menuDish.js')
const page = Object.assign({}, pageConfig, { data: JSON.parse(JSON.stringify(pageConfig.data)), setData(patch) { Object.assign(this.data, patch) } })
page.onLoad({ weekStart, dayIndex: '1', mealType: 'lunch', dishIndex: '0' })

setTimeout(() => {
  assert.ok(page.data.dish, 'dish should be loaded')
  assert.strictEqual(page.data.dish.id, shown.days[1].meals.lunch[0].id)
  assert.strictEqual(page.data.plan.days[1].meals.lunch[0].id, shown.days[1].meals.lunch[0].id)
  console.log('ok - dish detail opens the same dish the menu page showed')
}, 20)
