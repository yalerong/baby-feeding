const assert = require('assert')
const menuStorage = require('../utils/menuStorage.js')

const week = '2026-10-26'
assert.notStrictEqual(menuStorage.draftKey('family-a', week), menuStorage.draftKey('family-b', week))
assert.notStrictEqual(menuStorage.planKey('family-a', week), menuStorage.planKey('family-b', week))
assert.notStrictEqual(menuStorage.draftKey('family-a', week), menuStorage.planKey('family-a', week))
assert.notStrictEqual(menuStorage.draftKey('family-a', week), 'menuDraft:' + week)
assert.notStrictEqual(menuStorage.planKey('family-a', week), 'menuPlanCache:' + week)
assert.notStrictEqual(menuStorage.draftKey('a:b', week), menuStorage.draftKey('a%3Ab', week))
console.log('ok - menu storage separates families, record types and ambiguous family delimiters')

let config
global.Page = value => { config = value }
require('../pages/menu/menu.js')
let family = 'family-a'
global.wx = { getStorageSync: key => key === 'familyCode' ? family : '' }
const a = config.getDraftKey(week)
const planA = config.getPlanCacheKey(week)
assert.strictEqual(a, menuStorage.draftKey(family, week), 'menu page must use the shared key contract')
assert.strictEqual(planA, menuStorage.planKey(family, week))
family = 'family-b'
assert.notStrictEqual(config.getDraftKey(week), a)
assert.notStrictEqual(config.getPlanCacheKey(week), planA)
console.log('ok - the menu page reads and writes the same family namespace as its detail and entry pages')

async function saveIsolation() {
  family = 'family-a'
  const aKey = menuStorage.draftKey(family, week)
  const bKey = menuStorage.draftKey('family-b', week)
  const drafts = new Map([[aKey, { owner: 'A' }], [bKey, { owner: 'B' }]])
  let finishSave
  Object.assign(global.wx, {
    showLoading() {}, hideLoading() {}, showToast() {},
    removeStorageSync: key => drafts.delete(key),
    cloud: { callFunction: () => new Promise(resolve => { finishSave = resolve }) }
  })
  const page = { ...config,
    data: { ...JSON.parse(JSON.stringify(config.data)), birthDate: '2026-02-24', weekStart: week,
      currentPlan: { status: 'ready', weekStart: week, ageMonth: 8, stage: {}, days: [], nutritionSummary: {} }, dirty: true },
    setData(patch) { Object.assign(this.data, patch) }
  }
  page.saveWeek()
  family = 'family-b'
  page.data.savedDocId = 'b-doc'
  finishSave({ result: { success: true, _id: 'a-doc' } })
  await new Promise(resolve => setImmediate(resolve))
  assert.ok(!drafts.has(aKey), 'the saved family draft should be cleared')
  assert.ok(drafts.has(bKey), 'a late save from another family must not delete this family draft')
  assert.strictEqual(page.data.savedDocId, 'b-doc')
  assert.strictEqual(page.data.dirty, true)
  console.log('ok - late menu saves clear only their captured family draft and preserve the current page')
}
saveIsolation().catch(err => { console.error(err); process.exitCode = 1 })
