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
          if (world.recordsDown) return Promise.reject(new Error('records down'))
          return Promise.resolve({ result: { success: true, data: world.records.filter(r => !data.date || r.date === data.date) } })
        }
        if (name === 'weeklyMenu') return Promise.resolve({ result: { success: true, data: null } })
        if (name !== 'foodTrial') return Promise.resolve({ result: { success: true } })
        const find = () => world.trials.find(t => t.foodName === data.foodName)
        if (data.action === 'list') {
          if (world.listDown) return Promise.resolve({ result: { success: false, error: 'db error' } })
          return Promise.resolve({ result: { success: true, data: world.trials.map(t => ({ ...t, logSources: { ...(t.logSources || {}) } })) } })
        }
        if (data.action === 'log') {
          const existing = find()
          const consecutive = existing && existing.lastTriedDate && dateUtil.addDays(existing.lastTriedDate, 1) === data.date
          const trialCount = consecutive ? existing.trialCount + 1 : 1
          const logSources = { ...(consecutive ? existing.logSources : {}) }
          if (data.recordId) logSources[data.date] = data.recordId
          const next = { foodName: data.foodName, trialCount, status: trialCount >= 3 ? 'unlocked' : 'tracking', lastTriedDate: data.date, logSources, lastLogRecordId: data.recordId || '' }
          if (existing) Object.assign(existing, next); else world.trials.push(next)
          return Promise.resolve({ result: { success: true, data: { ...next } } })
        }
        if (data.action === 'transferLogSource') {
          const existing = find()
          if (!existing || existing.lastTriedDate !== data.date) return Promise.resolve({ result: { success: false, error: 'not today' } })
          existing.logSources = { ...(existing.logSources || {}), [data.date]: data.recordId }
          existing.lastLogRecordId = data.recordId
          return Promise.resolve({ result: { success: true } })
        }
        if (data.action === 'undoLog') {
          if (world.undoDown) return Promise.resolve({ result: { success: false, error: 'db error' } })
          const existing = find()
          if (!existing || existing.lastTriedDate !== data.date) return Promise.resolve({ result: { success: false, error: 'only today' } })
          const logSources = { ...(existing.logSources || {}) }
          delete logSources[data.date]
          const prev = dateUtil.addDays(data.date, -1)
          if (existing.trialCount <= 1) Object.assign(existing, { trialCount: 0, lastTriedDate: '', status: 'tracking', logSources: {}, lastLogRecordId: '' })
          else Object.assign(existing, { trialCount: existing.trialCount - 1, lastTriedDate: prev, status: 'tracking', logSources, lastLogRecordId: logSources[prev] || '' })
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
    world.trials.push({ foodName: '胡萝卜', trialCount: 2, status: 'tracking', lastTriedDate: today, logSources: { [today]: 'r1' } })
    const rec = record({ solidFoodDishName: '胡萝卜泥' })
    world.records.push(rec)
    await world.page.syncSolidFoodTrial({ before: rec, after: null, recordId: 'r1' })
    assert.strictEqual(world.trials[0].trialCount, 1)
    assert.strictEqual(world.trials[0].lastTriedDate, yesterday)
    assert.ok(world.toasts.some(t => t.includes('已回退 胡萝卜')))
  })

  await test('does not revert when another record that day still has the food, and hands provenance to it', async () => {
    const world = makeWorld()
    world.trials.push({ foodName: '胡萝卜', trialCount: 1, status: 'tracking', lastTriedDate: today, logSources: { [today]: 'r1' } })
    const rec = record({ _id: 'r1', solidFoodDishName: '胡萝卜泥' })
    world.records.push(rec, record({ _id: 'r2', solidFoodDishName: '胡萝卜土豆泥' }))
    await world.page.syncSolidFoodTrial({ before: rec, after: null, recordId: 'r1' })
    assert.strictEqual(world.trials[0].trialCount, 1)
    assert.strictEqual(world.trials[0].logSources[today], 'r2')
    assert.strictEqual(world.calls.filter(c => c === 'foodTrial:undoLog').length, 0)
    // 之后删掉 r2 就能正常回退
    world.records = world.records.filter(r => r._id !== 'r1')
    await world.page.syncSolidFoodTrial({ before: world.records[0], after: null, recordId: 'r2' })
    assert.strictEqual(world.trials[0].trialCount, 0)
  })

  await test('a failed undo aborts the sync instead of logging the replacement food', async () => {
    const world = makeWorld()
    world.undoDown = true
    world.trials.push({ foodName: '胡萝卜', trialCount: 1, status: 'tracking', lastTriedDate: today, logSources: { [today]: 'r1' } })
    const before = record({ solidFoodDishName: '胡萝卜泥' })
    world.records.push(before)
    await world.page.syncSolidFoodTrial({ before, after: record({ solidFoodDishName: '玉米糊', solidFoodFoods: ['玉米'] }), recordId: 'r1' })
    assert.strictEqual(world.trials.length, 1)
    assert.strictEqual(world.calls.filter(c => c === 'foodTrial:log').length, 0)
    assert.ok(world.toasts.some(t => t.includes('试吃回退失败')))
  })

  await test('editing only the grams of a logged food neither reverts nor re-logs', async () => {
    const world = makeWorld()
    world.trials.push({ foodName: '胡萝卜', trialCount: 1, status: 'tracking', lastTriedDate: today, logSources: { [today]: 'r1' } })
    const before = record({ solidFoodDishName: '胡萝卜泥', solidFoodGrams: 10 })
    world.records.push(before)
    await world.page.syncSolidFoodTrial({ before, after: record({ solidFoodDishName: '胡萝卜泥', solidFoodGrams: 30 }), recordId: 'r1' })
    assert.strictEqual(world.trials[0].trialCount, 1)
    assert.strictEqual(world.calls.filter(c => c === 'foodTrial:undoLog' || c === 'foodTrial:log').length, 0)
  })

  await test('changing the dish reverts the old food and logs the new one', async () => {
    const world = makeWorld()
    world.trials.push({ foodName: '胡萝卜', trialCount: 1, status: 'tracking', lastTriedDate: today, logSources: { [today]: 'r1' } })
    const before = record({ solidFoodDishName: '胡萝卜泥' })
    world.records.push(before)
    await world.page.syncSolidFoodTrial({ before, after: record({ solidFoodDishName: '玉米糊', solidFoodFoods: ['玉米'] }), recordId: 'r1' })
    const byName = {}
    world.trials.forEach(t => { byName[t.foodName] = t })
    assert.strictEqual(byName['胡萝卜'].trialCount, 0)
    assert.strictEqual(byName['玉米'].trialCount, 1)
  })

  await test('auto-log stamps the record id so the trial carries provenance', async () => {
    const world = makeWorld()
    await world.page.syncSolidFoodTrial({ before: null, after: record({ solidFoodDishName: '胡萝卜泥' }), recordId: 'r9' })
    assert.strictEqual(world.trials[0].logSources[today], 'r9')
  })

  await test('deleting a record never touches a trial that was logged manually on the unlock page', async () => {
    const world = makeWorld()
    world.trials.push({ foodName: '胡萝卜', trialCount: 1, status: 'tracking', lastTriedDate: today, logSources: {} })
    const rec = record({ solidFoodDishName: '胡萝卜泥' })
    world.records.push(rec)
    await world.page.syncSolidFoodTrial({ before: rec, after: null, recordId: 'r1' })
    assert.strictEqual(world.trials[0].trialCount, 1)
    assert.strictEqual(world.calls.filter(c => c === 'foodTrial:undoLog').length, 0)
  })

  await test('aborts the whole sync (no rollback, no replacement log) when same-day sibling records cannot be loaded', async () => {
    const world = makeWorld()
    world.recordsDown = true
    world.trials.push({ foodName: '胡萝卜', trialCount: 1, status: 'tracking', lastTriedDate: today, logSources: { [today]: 'r1' } })
    const rec = record({ solidFoodDishName: '胡萝卜泥' })
    await world.page.syncSolidFoodTrial({ before: rec, after: record({ solidFoodDishName: '玉米糊', solidFoodFoods: ['玉米'] }), recordId: 'r1' })
    assert.strictEqual(world.trials.length, 1)
    assert.strictEqual(world.trials[0].trialCount, 1)
    assert.strictEqual(world.calls.filter(c => c === 'foodTrial:undoLog' || c === 'foodTrial:log').length, 0)
    assert.ok(world.toasts.some(t => t.includes('未同步试吃')))
  })

  await test('deleting the later day keeps the earlier day\'s provenance so it can be reverted too', async () => {
    const world = makeWorld()
    world.trials.push({ foodName: '胡萝卜', trialCount: 2, status: 'tracking', lastTriedDate: today, logSources: { [yesterday]: 'r1', [today]: 'r2' } })
    const r1 = record({ _id: 'r1', date: yesterday, solidFoodDishName: '胡萝卜泥' })
    const r2 = record({ _id: 'r2', solidFoodDishName: '胡萝卜泥' })
    world.records.push(r1, r2)
    await world.page.syncSolidFoodTrial({ before: r2, after: null, recordId: 'r2' })
    assert.strictEqual(world.trials[0].trialCount, 1)
    assert.strictEqual(world.trials[0].lastTriedDate, yesterday)
    world.records = [r1]
    await world.page.syncSolidFoodTrial({ before: r1, after: null, recordId: 'r1' })
    assert.strictEqual(world.trials[0].trialCount, 0)
  })

  await test('a failed trial-list response aborts the sync entirely', async () => {
    const world = makeWorld()
    world.listDown = true
    world.trials.push({ foodName: '胡萝卜', trialCount: 1, status: 'tracking', lastTriedDate: today, logSources: { [today]: 'r1' } })
    const before = record({ solidFoodDishName: '胡萝卜泥' })
    await world.page.syncSolidFoodTrial({ before, after: record({ solidFoodDishName: '玉米糊', solidFoodFoods: ['玉米'] }), recordId: 'r1' })
    assert.strictEqual(world.trials.length, 1)
    assert.strictEqual(world.trials[0].trialCount, 1)
    assert.strictEqual(world.calls.filter(c => c === 'foodTrial:log' || c === 'foodTrial:undoLog').length, 0)
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
