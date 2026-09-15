const assert = require('assert')

let pageConfig = null
global.Page = config => { pageConfig = config }
global.wx = {
  getStorageSync(key) {
    return { familyCode: 'FAM', babyBirthDate: '2026-03-01' }[key] || ''
  },
  cloud: {
    callFunction({ name, data }) {
      assert.strictEqual(name, 'foodTrial')
      assert.strictEqual(data.action, 'list')
      return Promise.resolve({
        result: {
          success: true,
          data: [
            { foodName: '胡萝卜', status: 'unlocked', trialCount: 3 },
            { foodName: '鸡肝', status: 'tracking', trialCount: 0, isCustom: true }
          ]
        }
      })
    }
  }
}

delete require.cache[require.resolve('../pages/add/add.js')]
require('../pages/add/add.js')

const page = Object.assign({}, pageConfig, {
  data: JSON.parse(JSON.stringify(pageConfig.data)),
  setData(patch) { Object.assign(this.data, patch) }
})
page.data.date = '2026-09-14'

page.loadSolidFoodQuickTags().then(() => {
  const names = page.data.solidFoodQuickTags.map(item => item.name)
  assert.ok(names.includes('胡萝卜'))
  assert.ok(names.includes('鸡肝'))

  page.selectSolidFoodQuickTag({ currentTarget: { dataset: { name: '米粉' } } })
  page.selectSolidFoodQuickTag({ currentTarget: { dataset: { name: '鸡肝' } } })
  assert.strictEqual(page.data.solidFoodCustomName, '鸡肝米糊')
  assert.deepStrictEqual(page.data.solidFoodFoods, ['米粉', '鸡肝'])
  assert.deepStrictEqual(
    page.data.solidFoodQuickTags.filter(item => item.selected).map(item => item.name).sort(),
    ['米粉', '鸡肝'].sort()
  )

  console.log('ok - unlock-list food tags build a combined solid-food entry')
}).catch(err => {
  console.error('not ok - unlock-list food tags build a combined solid-food entry')
  console.error(err)
  process.exit(1)
})
