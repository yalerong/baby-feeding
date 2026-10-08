const assert = require('assert')
const { repairTrials } = require('../scripts/repairFoodTrials.js')

const trials = [
  { _id: 'sweet', familyCode: 'FAM', foodName: '红薯', trialCount: 1, status: 'tracking', lastTriedDate: '2026-10-05', logDates: ['2026-10-05'], logSources: { '2026-10-05': 'r5' }, isCustom: true },
  { _id: 'spinach', familyCode: 'FAM', foodName: '菠菜', trialCount: 2, status: 'tracking', lastTriedDate: '2026-10-08', logDates: ['2026-10-07', '2026-10-08'], logSources: { '2026-10-07': 'r7', '2026-10-08': 'r8' } },
  { _id: 'apple', familyCode: 'FAM', foodName: '苹果', trialCount: 1, status: 'tracking', lastTriedDate: '2026-10-03', logDates: ['2026-10-03'], logSources: {} }
]
const records = [3, 4, 5, 6, 7, 8].map(day => ({
  _id: `r${day}`, familyCode: 'FAM', date: `2026-10-0${day}`, solidFood: true,
  solidFoodFoods: ['米粉', day <= 5 ? '红薯' : '菠菜']
}))
const originals = JSON.stringify({ records, trials })
const repaired = repairTrials(records, trials, ['红薯', '菠菜'])
assert.strictEqual(repaired.length, 2)
assert.deepStrictEqual(repaired.map(t => [t.foodName, t.trialCount, t.status]), [['红薯', 3, 'unlocked'], ['菠菜', 3, 'unlocked']])
assert.deepStrictEqual(repaired[0].logDates, ['2026-10-03', '2026-10-04', '2026-10-05'])
assert.deepStrictEqual(repaired[1].logSources, { '2026-10-06': 'r6', '2026-10-07': 'r7', '2026-10-08': 'r8' })
assert.strictEqual(repaired[0].lastLogRecordId, 'r5')
assert.strictEqual(repaired[0].isCustom, true)
assert.strictEqual(JSON.stringify({ records, trials }), originals)
assert.deepStrictEqual(repairTrials(records, repaired, ['红薯', '菠菜']), [])
console.log('ok - repairs the red-sweet-potato and spinach missed days without changing inputs; reruns are idempotent')

assert.deepStrictEqual(repairTrials(records.filter(r => r._id !== 'r4'), trials, ['红薯']), [])
assert.deepStrictEqual(repairTrials(records.concat(records), trials, ['红薯'])[0].logDates, repaired[0].logDates)
assert.deepStrictEqual(repairTrials(records.map(r => ({ ...r, familyCode: 'OTHER' })), trials, ['红薯']), [])
assert.deepStrictEqual(repairTrials(records.map(r => ({ ...r, solidFood: false })), trials, ['红薯']), [])
assert.deepStrictEqual(repairTrials(records, [{ ...trials[0], status: 'allergic', allergyNote: '皮疹' }], ['红薯']), [])
assert.deepStrictEqual(repairTrials(records, trials, []), [])
console.log('ok - does not count gaps, duplicate days, other families, or non-solid records; preserves allergies and unselected foods')

const manual = { ...trials[0], logSources: {}, lastLogRecordId: '' }
const manualRepair = repairTrials(records, [manual], ['红薯'])[0]
assert.strictEqual(manualRepair.lastLogRecordId, '')
assert.strictEqual(manualRepair.logSources['2026-10-05'], undefined)
const extra = { _id: 'future', familyCode: 'FAM', date: '2026-10-06', solidFood: true, solidFoodFoods: ['红薯'] }
assert.strictEqual(repairTrials(records.concat(extra), trials, ['红薯'])[0].lastTriedDate, '2026-10-05')
assert.throws(() => repairTrials(records, trials.concat({ ...trials[0], _id: 'duplicate' }), ['红薯']), /重复/)
console.log('ok - keeps manual provenance and the latest trial anchor; rejects duplicate trial documents')

const withBanana = trials.concat({ _id: 'banana', familyCode: 'FAM', foodName: '香蕉', trialCount: 0, status: 'tracking', lastTriedDate: '', isCustom: true })
const confirmed = repairTrials(records, withBanana, ['红薯', '菠菜'], ['苹果', '香蕉'], '2026-10-08')
assert.deepStrictEqual(confirmed.map(t => [t.foodName, t.trialCount, t.status]), [['红薯', 3, 'unlocked'], ['菠菜', 3, 'unlocked'], ['苹果', 3, 'unlocked'], ['香蕉', 3, 'unlocked']])
assert.strictEqual(confirmed[2].manuallyUnlocked, true)
assert.strictEqual(confirmed[2].unlockedDate, '2026-10-08')
assert.deepStrictEqual(confirmed[2].logDates, ['2026-10-03'])
assert.deepStrictEqual(confirmed[2].logSources, {})
assert.strictEqual(confirmed[3].lastTriedDate, '')
assert.strictEqual(confirmed[3].logDates, undefined)
assert.throws(() => repairTrials(records, [{ ...trials[2], status: 'allergic' }], [], ['苹果']), /疑似过敏/)
assert.throws(() => repairTrials(records, trials, [], ['香蕉']), /没有食材/)
console.log('ok - records parent-confirmed prior unlocks without inventing eating dates or clearing allergy flags')

// 直接用实际菜单页的数据构建入口核对数据库状态，而非另写一份页面映射。
let menuConfig
global.Page = config => { menuConfig = config }
global.wx = { getStorageSync: () => '' }
require('../pages/menu/menu.js')
const previouslyUnlocked = ['米粉', '胡萝卜', '南瓜', '鸡肝', '猪肝'].map(foodName => ({
  _id: foodName, familyCode: 'FAM', foodName, status: 'unlocked', trialCount: 3
}))
function buildMenu(rows) {
  const page = {
    ...menuConfig,
    data: { ...menuConfig.data, today: '2026-10-08', currentAgeMonth: 7, trialMode: 'strict', foodTrials: rows },
    setData(update) { Object.assign(this.data, update) }
  }
  page.buildTrialFoods()
  return page.data
}
const originalMenu = buildMenu(previouslyUnlocked.concat(withBanana))
assert.strictEqual(originalMenu.unlockedFoodCount, 5)
assert.strictEqual(originalMenu.trialFoods.find(food => food.name === '菠菜').status, 'tracking')
const correctedMenu = buildMenu(previouslyUnlocked.concat(confirmed))
assert.strictEqual(correctedMenu.unlockedFoodCount, 9)
;['红薯', '菠菜', '苹果', '香蕉'].forEach(name => {
  assert.strictEqual(correctedMenu.trialFoods.find(food => food.name === name).statusText, '已解锁')
})
console.log('ok - actual menu page agrees with database rows: five original unlocks become nine after the four corrections')
