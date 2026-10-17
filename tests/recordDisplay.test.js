const assert = require('assert')

let page
global.Page = definition => { page = definition }
require('../pages/index/index.js')
delete global.Page

function display(records) {
  const instance = {
    data: {},
    setData(update, callback) {
      Object.assign(this.data, update)
      if (callback) callback()
    },
    refreshSinceLastFeeding() {},
    refreshDailyReview() {}
  }
  page.calculateStats.call(instance, records)
  return instance.data
}

function test(name, fn) {
  fn()
  console.log(`ok - ${name}`)
}

test('shows rice cereal in grams even when a stored total is present', () => {
  const record = { solidFood: true, solidFoodDishName: '米糊', solidFoodGrams: 10, total: 10 }
  const result = display([record])
  assert.strictEqual(result.records[0].quantityText, '10克')
  assert.strictEqual(result.todayStats.total, 0)
  assert.strictEqual(result.todayStats.count, 0)
  assert.strictEqual(record.quantityText, undefined)
})

test('shows milk and solid-food quantities with separate units', () => {
  const result = display([{
    breastMilk: 30, formula: 120, total: 150,
    solidFood: true, solidFoodGrams: 25
  }])
  assert.strictEqual(result.records[0].quantityText, '150ml · 25克')
  assert.strictEqual(result.todayStats.total, 150)
  assert.strictEqual(result.todayStats.count, 1)
})

test('keeps milk-only records in milliliters', () => {
  const result = display([{ breastMilk: 60, formula: 120, total: 180 }])
  assert.strictEqual(result.records[0].quantityText, '180ml')
})

test('hides empty milk totals for stool-only records', () => {
  const result = display([{ stool: true, total: 0 }])
  assert.strictEqual(result.records[0].quantityText, '')
  assert.strictEqual(result.todayStats.stool, 1)
})

test('preserves fractional gram amounts and ignores disabled solid-food fields', () => {
  const result = display([
    { solidFood: true, solidFoodGrams: 12.5 },
    { formula: 90, solidFood: false, solidFoodGrams: 10 }
  ])
  assert.strictEqual(result.records[0].quantityText, '12.5克')
  assert.strictEqual(result.records[1].quantityText, '90ml')
  assert.strictEqual(result.todayStats.total, 90)
})

test('keeps photo thumbnails available after formatting record quantities', () => {
  const images = ['cloud://feeding/rice-cereal.jpg']
  const result = display([
    { solidFood: true, solidFoodGrams: 10, images },
    { formula: 90, images: null }
  ])
  assert.deepStrictEqual(result.records[0].images, images)
  assert.deepStrictEqual(result.records[1].images, [])
})
