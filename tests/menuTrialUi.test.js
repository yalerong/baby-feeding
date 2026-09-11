const assert = require('assert')
const fs = require('fs')
const path = require('path')

const wxml = fs.readFileSync(path.join(__dirname, '../pages/menu/menu.wxml'), 'utf8')

assert.match(wxml, /<view[^>]*class="trial-log-btn trial-action"[^>]*catchtap="recordFoodTrial"/)
assert.match(wxml, /<view[^>]*class="trial-undo-btn trial-action"[^>]*catchtap="undoFoodTrial"/)
console.log('ok - trial actions use direct catchtap bindings')

// wxml 里绑定的每个处理函数都必须在 menu.js 里定义（防止改代码时切掉整段）
const js = fs.readFileSync(path.join(__dirname, '../pages/menu/menu.js'), 'utf8')
const handlers = new Set()
;(wxml.match(/(?:bind|catch)(?:tap|input|change|confirm)="([A-Za-z_]+)"/g) || []).forEach(m => handlers.add(m.split('"')[1]))
handlers.forEach(name => assert.match(js, new RegExp(`^  ,?${name}\\(`, 'm'), `menu.js is missing handler ${name}`))
console.log(`ok - all ${handlers.size} menu.wxml handlers exist in menu.js`)

// 解锁页"移除"只给完整菜库里没有的食材
const menuJs = fs.readFileSync(path.join(__dirname, '../pages/menu/menu.js'), 'utf8')
assert.match(menuJs, /food\.isOffCatalog = !knownFoods\.includes\(food\.name\)/)
console.log('ok - remove button is scoped to foods outside the full catalog')

// 大厅"我的菜谱"必须过过敏排除
assert.match(menuJs, /\.filter\(dish => !this\.libraryDishContainsExcluded\(dish\)\)/)
console.log('ok - library dishes in the hall are filtered by excluded ingredients')
