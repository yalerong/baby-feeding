const assert = require('assert')
const fs = require('fs')
const path = require('path')

const wxml = fs.readFileSync(path.join(__dirname, '../pages/menu/menu.wxml'), 'utf8')

assert.match(wxml, /<view[^>]*class="trial-log-btn trial-action"[^>]*catchtap="recordFoodTrial"/)
assert.match(wxml, /<view[^>]*class="trial-undo-btn trial-action"[^>]*catchtap="undoFoodTrial"/)
console.log('ok - trial actions use direct catchtap bindings')

assert.match(wxml, /class="trial-progress" wx:if="\{\{item\.status !== 'allergic' && item\.status !== 'unlocked'\}\}"/)
assert.match(wxml, /wx:if="\{\{item\.status !== 'unlocked'\}\}" class="allergen-tag/)
assert.match(wxml, /class="allergen-hint" wx:if="\{\{item\.status !== 'unlocked'\}\}"/)
assert.match(wxml, /wx:if="\{\{item\.status === 'unlocked'\}\}" class="trial-alert-subtle-btn" bindtap="markFoodAllergic"[^>]*>记录异常<\/button>/)
assert.match(wxml, /wx:if="\{\{item\.status === 'tracking'\}\}" class="trial-alert-btn" bindtap="markFoodAllergic"[^>]*>疑似过敏<\/button>/)
console.log('ok - unlocked trial cards stay compact and keep a low-emphasis abnormal-record action')

// wxml 里绑定的每个处理函数都必须在 menu.js 里定义（防止改代码时切掉整段）
const js = fs.readFileSync(path.join(__dirname, '../pages/menu/menu.js'), 'utf8')
const handlers = new Set()
;(wxml.match(/(?:bind|catch)(?:tap|input|change|confirm)="([A-Za-z_]+)"/g) || []).forEach(m => handlers.add(m.split('"')[1]))
handlers.forEach(name => assert.match(js, new RegExp(`^  ,?${name}\\(`, 'm'), `menu.js is missing handler ${name}`))
console.log(`ok - all ${handlers.size} menu.wxml handlers exist in menu.js`)

// 所有已解锁食材都可移除档案；未解锁/疑似过敏食材仍仅允许移除菜库外条目。
const removeButton = wxml.match(/<button[^>]*class="trial-remove-btn"[^>]*>/)[0]
const removeCondition = removeButton.match(/wx:if="\{\{(.*?)\}\}"/)[1]
const canRemove = new Function('item', `return Boolean(${removeCondition})`)
;['unlocked', 'tracking', 'allergic'].forEach(status => {
  assert.strictEqual(canRemove({ status, isOffCatalog: false }), status === 'unlocked', `${status} catalog removal visibility`)
  assert.strictEqual(canRemove({ status, isOffCatalog: true }), true, `${status} custom removal visibility`)
})
const menuJs = fs.readFileSync(path.join(__dirname, '../pages/menu/menu.js'), 'utf8')
assert.match(menuJs, /food\.isOffCatalog = !knownFoods\.includes\(food\.name\)/)
console.log('ok - all unlocked foods share the remove action, while unfinished catalog foods keep the existing restriction')

// 大厅"我的菜谱"必须过过敏排除
assert.match(menuJs, /\.filter\(dish => !this\.libraryDishContainsExcluded\(dish\)\)/)
console.log('ok - library dishes in the hall are filtered by excluded ingredients')
