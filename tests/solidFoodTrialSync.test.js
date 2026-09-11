// 用假 wx / 假云函数把录入页的"辅食记录 ↔ 试吃打卡"同步链路跑一遍
const assert = require('assert')
const dateUtil = require('../utils/date.js')

function test(name, fn) {
  return Promise.resolve().then(fn).then(() => console.log(`ok - ${name}`)).catch(err => {
    console.error(`not ok - ${name}`)
    throw err
  })
}

const today = dateUtil.todayStr()
const yesterday = dateUtil.addDays(today, -1)

function makeWorld() {
  const world = { trials: [], records: [], toasts: [], calls: [] }
  const storage = { familyCode: 'FAM', babyBirthDate: '2026-03-05' }
  let pageConfig = null
  global.Page = config => { pageConfig = config }
  global.wx = {
    getStorageSync: key => storage[key] || '',
    setStorageSync: (key, value) => { storage[key] = value },
    removeStorageSync: () => {},
    showToast: opts => world.toasts.push(opts.title),
    showLoading: () => {},
    hideLoading: () => {},
    setNavigationBarTitle: () => {},
    cloud: {
      callFunction: ({ name, data }) => {
        world.calls.push(`${name}:${data.action || data.date || ''}`)
        if (name === 'getRecords') {
          return Promise.resolve({ result: { success: true, data: world.records.filter(r => !data.date || r.date === data.date) } })
        }
        if (name === 'weeklyMenu') return Promise.resolve({ result: { success: true, data: null } })
        if (name !== 'foodTrial') return Promise.resolve({ result: { success: true } })
        const find = () => world.trials.find(t => t.foodName === data.foodName)
        if (data.action === 'list') return Promise.resolve({ result: { success: true, data: world.trials.map(t => ({ ...t })) } })
        if (data.action === 'log') {
          const existing = find()
          const consecutive = existing && existing.lastTriedDate && dateUtil.addDays(existing.lastTriedDate, 1) === data.date
          const trialCount = consecutive ? existing.trialCount + 1 : 1
          const next = { foodName: data.foodName, trialCount, status: trialCount >= 3 ? 'unlocked' : 'tracking', lastTriedDate: data.date }
          if (existing) Object.assign(existing, next); else world.trials.push(next)
          return Promise.resolve({ result: { success: true, data: { ...next } } })
        }
        if (data.action === 'undoLog') {
          const existing = find()
          if (!existing || existing.lastTriedDate !== data.date) return Promise.resolve({ result: { success: false, error: 'only today' } })
          if (existing.trialCount <= 1) Object.assign(existing, { trialCount: 0, lastTriedDate: '', status: 'tracking' })
          else Object.assign(existing, { trialCount: existing.trialCount - 1, lastTriedDate: dateUtil.addDays(data.date, -1), status: 'tracking' })
          return Promise.resolve({ result: { success: true } })
        }
        return Promise.resolve({ result: { success: false, error: 'unknown' } })
      }
    }
  }
  delete require.cache[require.resolve('../pages/add/add.js')]
  require('../pages/add/add.js')
  const page = Object.assign({}, pageConfig, { data: JSON.parse(JSON.stringify(pageConfig.data)), setData(patch) { Object.assign(this.data, patch) } })
  world.page = page
  return world
}

function record(fields) {
  return { _id: fields._id || 'r1', date: today, time: '12:00', solidFood: true, solidFoodDishId: '', solidFoodDishName: '', solidFoodGrams: 20, solidFoodFoods: [], ...fields }
}

async function run() {
  await test('a hand-typed 胡萝卜泥 record auto-logs 胡萝卜, not the dish name', async () => {
    const world = makeWorld()
    await world.page.syncSolidFoodTrial({ before: null, after: record({ solidFoodDishName: '胡萝卜泥' }), recordId: 'r1' })
    assert.deepStrictEqual(world.trials.map(t => [t.foodName, t.trialCount]), [['胡萝卜', 1]])
    assert.ok(world.toasts.some(t => t.includes('已自动记 胡萝卜 试吃 1/3')))
  })

  await test('deleting that record reverts the same-day trial log', async () => {
    const world = makeWorld()
    world.trials.push({ foodName: '胡萝卜', trialCount: 2, status: 'tracking', lastTriedDate: today })
    const rec = record({ solidFoodDishName: '胡萝卜泥' })
    world.records.push(rec)
    await world.page.syncSolidFoodTrial({ before: rec, after: null, recordId: 'r1' })
    assert.strictEqual(world.trials[0].trialCount, 1)
    assert.strictEqual(world.trials[0].lastTriedDate, yesterday)
    assert.ok(world.toasts.some(t => t.includes('已回退 胡萝卜')))
  })

  await test('does not revert when another record that day still has the food', async () => {
    const world = makeWorld()
    world.trials.push({ foodName: '胡萝卜', trialCount: 1, status: 'tracking', lastTriedDate: today })
    const rec = record({ _id: 'r1', solidFoodDishName: '胡萝卜泥' })
    world.records.push(rec, record({ _id: 'r2', solidFoodDishName: '胡萝卜土豆泥' }))
    await world.page.syncSolidFoodTrial({ before: rec, after: null, recordId: 'r1' })
    assert.strictEqual(world.trials[0].trialCount, 1)
    assert.strictEqual(world.calls.filter(c => c === 'foodTrial:undoLog').length, 0)
  })

  await test('editing only the grams of a logged food neither reverts nor re-logs', async () => {
    const world = makeWorld()
    world.trials.push({ foodName: '胡萝卜', trialCount: 1, status: 'tracking', lastTriedDate: today })
    const before = record({ solidFoodDishName: '胡萝卜泥', solidFoodGrams: 10 })
    world.records.push(before)
    await world.page.syncSolidFoodTrial({ before, after: record({ solidFoodDishName: '胡萝卜泥', solidFoodGrams: 30 }), recordId: 'r1' })
    assert.strictEqual(world.trials[0].trialCount, 1)
    assert.strictEqual(world.calls.filter(c => c === 'foodTrial:undoLog' || c === 'foodTrial:log').length, 0)
  })

  await test('changing the dish reverts the old food and logs the new one', async () => {
    const world = makeWorld()
    world.trials.push({ foodName: '胡萝卜', trialCount: 1, status: 'tracking', lastTriedDate: today })
    const before = record({ solidFoodDishName: '胡萝卜泥' })
    world.records.push(before)
    await world.page.syncSolidFoodTrial({ before, after: record({ solidFoodDishName: '玉米糊', solidFoodFoods: ['玉米'] }), recordId: 'r1' })
    const byName = {}
    world.trials.forEach(t => { byName[t.foodName] = t })
    assert.strictEqual(byName['胡萝卜'].trialCount, 0)
    assert.strictEqual(byName['玉米'].trialCount, 1)
  })

  await test('an unrecognised name warns instead of storing the dish name as a food', async () => {
    const world = makeWorld()
    await world.page.syncSolidFoodTrial({ before: null, after: record({ solidFoodDishName: '神秘料理' }), recordId: 'r1' })
    assert.deepStrictEqual(world.trials, [])
    assert.ok(world.toasts.some(t => t.includes('没认出食材')))
  })

  await test('back-filling yesterday logs with the date, future dates are ignored', async () => {
    const world = makeWorld()
    await world.page.syncSolidFoodTrial({ before: null, after: record({ date: yesterday, solidFoodDishName: '胡萝卜泥' }), recordId: 'r1' })
    assert.deepStrictEqual(world.trials.map(t => [t.foodName, t.lastTriedDate]), [['胡萝卜', yesterday]])
    assert.ok(world.toasts.some(t => t.includes(`${yesterday.substring(5)} 胡萝卜`)))
    const before = world.trials.length
    await world.page.syncSolidFoodTrial({ before: null, after: record({ date: dateUtil.addDays(today, 1), solidFoodDishName: '南瓜泥' }), recordId: 'r2' })
    assert.strictEqual(world.trials.length, before)
  })
}

run().catch(err => {
  console.error(err)
  process.exit(1)
})
