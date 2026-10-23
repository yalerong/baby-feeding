// 首次克隆没有 config.local.js 时，app.js 也必须能加载并完成 onLaunch，
// 否则开发者工具里整个小程序起不来。
const assert = require('assert')

let appOptions = null
const storage = {}
global.App = options => { appOptions = options }
global.wx = {
  cloud: { init() {} },
  setStorageSync: (key, value) => { storage[key] = value },
  getStorageSync: key => storage[key] || ''
}

require('../app.js')

assert.ok(appOptions, 'App() should be called even without config.local.js')
assert.strictEqual(typeof appOptions.onLaunch, 'function')
appOptions.onLaunch()
assert.ok(storage.familyCode, 'onLaunch should always set a family code to work with')
assert.ok(storage.babyBirthDate, 'onLaunch should always set a default birth date')

console.log('ok - app boots without config.local.js and keeps working defaults')
