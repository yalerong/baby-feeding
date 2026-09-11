// 微信云函数目录之间不能互相 require，共用的小工具文件是逐字节拷贝；
// 这条测试保证同名拷贝内容一致，避免只改了一边的静默分歧。
const assert = require('assert')
const fs = require('fs')
const path = require('path')

const root = path.join(__dirname, '../cloudfunctions')
const SKIP = new Set(['index.js', 'package.json', 'config.js.example'])
const byName = {}
fs.readdirSync(root).forEach(dir => {
  const full = path.join(root, dir)
  if (!fs.statSync(full).isDirectory()) return
  fs.readdirSync(full).forEach(file => {
    if (SKIP.has(file) || !file.endsWith('.js')) return
    byName[file] = byName[file] || []
    byName[file].push(path.join(dir, file))
  })
})

let checked = 0
Object.keys(byName).forEach(file => {
  const copies = byName[file]
  if (copies.length < 2) return
  const contents = copies.map(rel => fs.readFileSync(path.join(root, rel), 'utf8').replace(/\r\n/g, '\n'))
  contents.slice(1).forEach((text, index) => {
    assert.strictEqual(text, contents[0], `${copies[index + 1]} differs from ${copies[0]}; keep the copies identical`)
  })
  checked += 1
})
assert.ok(checked >= 3, 'expected at least the validation/fetchAll/reviewId pairs')
console.log(`ok - ${checked} shared cloud-function files are identical across copies`)
