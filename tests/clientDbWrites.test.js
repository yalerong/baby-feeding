const assert = require('assert')
const fs = require('fs')

function test(name, fn) {
  try {
    fn()
    console.log(`ok - ${name}`)
  } catch (err) {
    console.error(`not ok - ${name}`)
    throw err
  }
}

function assertPageDoesNotWriteCollection(file, collection) {
  const source = fs.readFileSync(file, 'utf8')
  const writes = [
    `.collection('${collection}').add(`,
    `.collection("${collection}").add(`,
    `.collection('${collection}').doc(`,
    `.collection("${collection}").doc(`
  ]
  writes.forEach(pattern => {
    assert.strictEqual(source.includes(pattern), false, `${file} still writes ${collection}`)
  })
}

test('growth pages do not write growth_records directly from the client', () => {
  assertPageDoesNotWriteCollection('pages/growthEdit/growthEdit.js', 'growth_records')
})

test('menu pages do not write weekly_menus directly from the client', () => {
  assertPageDoesNotWriteCollection('pages/menu/menu.js', 'weekly_menus')
  assertPageDoesNotWriteCollection('pages/menuDish/menuDish.js', 'weekly_menus')
})
