// 试吃区与菜谱库的行为测试：装载页面配置、调用真实方法，不靠正则扫源码。
// 这样把方法搬到 pages/menu/trial.js 之类的模块后，测试依然有效。
const assert = require('assert')
const fs = require('fs')
const path = require('path')

let page = null
global.Page = config => { page = config }
require('../pages/menu/menu.js')

const wxml = fs.readFileSync(path.join(__dirname, '../pages/menu/menu.wxml'), 'utf8')

function makeHost(data) {
  return {
    ...page,
    data: { ...JSON.parse(JSON.stringify(page.data)), ...data },
    setData(patch) { Object.assign(this.data, patch) }
  }
}

// 1. wxml 里绑定的每个处理函数都必须是页面上的函数，改名或漏搬会在这里暴露
const handlers = new Set(
  [...wxml.matchAll(/(?:bind|catch)(?:tap|input|change|confirm)="([A-Za-z_]+)"/g)].map(match => match[1])
)
handlers.forEach(name => assert.strictEqual(typeof page[name], 'function', `menu page is missing handler ${name}`))
console.log(`ok - all ${handlers.size} menu.wxml handlers exist as page methods`)

// 2. 试吃列表：菜库外食材也必须出现在列表里并带上 isOffCatalog，否则「移除」按钮不可达
const trialHost = makeHost({
  today: '2026-10-20',
  ageMonth: 6,
  currentAgeMonth: 6,
  trialMode: 'strict',
  activeTrialFood: '',
  foodTrials: [
    { foodName: '胡萝卜', trialCount: 1, trialDates: ['2026-10-19'], lastTriedDate: '2026-10-19', status: 'tracking' },
    { foodName: '鳕鱼', trialCount: 3, trialDates: ['2026-10-18', '2026-10-19', '2026-10-20'], lastTriedDate: '2026-10-20', status: 'unlocked' },
    { foodName: '自制米糊', trialCount: 1, isCustom: true, trialDates: ['2026-10-20'], lastTriedDate: '2026-10-20', status: 'tracking' }
  ]
})
trialHost.buildTrialFoods()
const trialByName = Object.fromEntries(trialHost.data.trialFoods.map(food => [food.name, food]))
assert.strictEqual(trialByName['胡萝卜'].isOffCatalog, false, 'catalog food is not off-catalog')
assert.strictEqual(trialByName['鳕鱼'].status, 'unlocked')
assert.strictEqual(trialHost.data.unlockedFoodCount, 1)
assert.ok(trialByName['自制米糊'], 'off-catalog trial food must stay visible')
assert.strictEqual(trialByName['自制米糊'].isOffCatalog, true, 'custom food is off-catalog')

// 「移除」按钮的显示条件直接取自 wxml，再喂真实构造出来的条目，避免两边各写一套判断
const removeButton = wxml.match(/<button[^>]*class="trial-remove-btn"[^>]*>/)
assert.ok(removeButton, 'remove button must exist in the trial card')
assert.match(removeButton[0], /bindtap="removeFood"/)
const removeCondition = removeButton[0].match(/wx:if="\{\{(.*?)\}\}"/)[1]
const canRemove = new Function('item', `return Boolean(${removeCondition})`)
assert.strictEqual(canRemove(trialByName['鳕鱼']), true, 'unlocked foods can always be removed')
assert.strictEqual(canRemove(trialByName['自制米糊']), true, 'off-catalog foods can be removed while still tracking')
assert.strictEqual(canRemove(trialByName['胡萝卜']), false, 'catalog foods keep the remove action hidden until unlocked')
console.log('ok - off-catalog trial foods stay visible and removable, tracking catalog foods do not')

// 3. 菜谱库里带过敏食材的菜不进大厅候选
const libraryHost = makeHost({
  excludedIngredients: ['鸡蛋'],
  libraryDishes: [
    { _id: 'a', name: '蛋黄粥', foods: ['鸡蛋'], ingredients: ['鸡蛋'], mealTypes: ['breakfast'] },
    { _id: 'b', name: '南瓜粥', foods: ['南瓜'], ingredients: ['南瓜'], mealTypes: ['breakfast'] },
    { _id: 'c', name: '苹果泥', foods: ['苹果'], ingredients: ['苹果'], mealTypes: ['snack'] }
  ],
  hallContext: { mealType: 'breakfast' }
})
const hallDishes = libraryHost.buildHallLibraryDishes('breakfast')
assert.deepStrictEqual(hallDishes.map(dish => dish.name), ['南瓜粥'],
  'hall offers must respect both meal type and excluded ingredients')
console.log('ok - library dishes are filtered by meal type and excluded ingredients')
