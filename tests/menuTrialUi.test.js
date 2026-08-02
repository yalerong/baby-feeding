const assert = require('assert')
const fs = require('fs')
const path = require('path')

const wxml = fs.readFileSync(path.join(__dirname, '../pages/menu/menu.wxml'), 'utf8')

assert.match(wxml, /<view[^>]*class="trial-log-btn trial-action"[^>]*catchtap="recordFoodTrial"/)
assert.match(wxml, /<view[^>]*class="trial-undo-btn trial-action"[^>]*catchtap="undoFoodTrial"/)
console.log('ok - trial actions use direct catchtap bindings')
