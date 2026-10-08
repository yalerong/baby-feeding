const assert = require('assert')
const Module = require('module')
const foodUnlock = require('../utils/foodUnlock.js')
const { getUndoTrialState } = require('../cloudfunctions/foodTrial/trialState.js')

const tests = []

function test(name, fn) {
  tests.push({ name, fn })
}

function createFakeSdk(seed) {
  const hooks = (seed && seed.__hooks) || {}
  const dataSeed = { ...(seed || {}) }
  delete dataSeed.__hooks
  const collections = JSON.parse(JSON.stringify(dataSeed || { food_trials: [], families: [] }))
  const db = {
    serverDate() {
      return 'SERVER_DATE'
    },
    collection(name) {
      if (!collections[name]) collections[name] = []
      return makeCollection(collections[name], hooks[name] || {})
    }
  }
  return {
    collections,
    cloud: {
      DYNAMIC_CURRENT_ENV: 'test',
      init() {},
      database() {
        return db
      }
    }
  }
}

function makeCollection(items, hooks) {
  return {
    where(query) {
      return {
        limit() {
          return {
            async get() {
              return {
                data: items.filter(item => Object.keys(query).every(key => item[key] === query[key]))
              }
            }
          }
        },
        async update({ data }) {
          if (hooks.updateWhere) await hooks.updateWhere(query, data, items)
          let updated = 0
          items.forEach((item, index) => {
            if (!Object.keys(query).every(key => item[key] === query[key])) return
            items[index] = { ...item, ...data }
            updated += 1
          })
          return { stats: { updated } }
        }
      }
    },
    doc(id) {
      return {
        async get() {
          const doc = items.find(item => item._id === id)
          if (!doc) throw new Error('not found')
          return { data: doc }
        },
        async update({ data }) {
          const index = items.findIndex(item => item._id === id)
          if (index < 0) throw new Error('not found')
          items[index] = { ...items[index], ...data }
          return { stats: { updated: 1 } }
        },
        async set({ data }) {
          const index = items.findIndex(item => item._id === id)
          const doc = { _id: id, ...data }
          if (index >= 0) items[index] = doc
          else items.push(doc)
          return { _id: id }
        },
        async remove() {
          const index = items.findIndex(item => item._id === id)
          if (index >= 0) items.splice(index, 1)
          return { stats: { removed: 1 } }
        }
      }
    },
    async add({ data }) {
      if (hooks.add) await hooks.add(data, items)
      if (items.some(item => item._id === data._id)) throw new Error('duplicate key')
      items.push({ ...data })
      return { _id: data._id }
    }
  }
}

function loadFoodTrial(seed) {
  const fake = createFakeSdk(seed)
  const originalLoad = Module._load
  const indexPath = require.resolve('../cloudfunctions/foodTrial/index.js')
  delete require.cache[indexPath]
  Module._load = function (request, parent, isMain) {
    if (request === 'wx-server-sdk') return fake.cloud
    return originalLoad.call(this, request, parent, isMain)
  }
  const mod = require('../cloudfunctions/foodTrial/index.js')
  Module._load = originalLoad
  return { main: mod.main, collections: fake.collections }
}

test('manual unlock creates a family-scoped unlocked document without fake log dates', async () => {
  const { main, collections } = loadFoodTrial({
    food_trials: [{ _id: 'other', familyCode: 'OTHER', foodName: '苹果', trialCount: 1, status: 'tracking' }],
    families: []
  })

  const res = await main({ action: 'setStatus', familyCode: 'FAM', foodName: '苹果', status: 'unlocked', date: '2026-10-08' })
  assert.strictEqual(res.success, true)

  const doc = collections.food_trials.find(item => item.familyCode === 'FAM' && item.foodName === '苹果')
  assert.ok(doc)
  assert.strictEqual(doc.status, 'unlocked')
  assert.strictEqual(doc.trialCount, 3)
  assert.strictEqual(doc.manuallyUnlocked, true)
  assert.strictEqual(doc.unlockedDate, '2026-10-08')
  assert.strictEqual(doc.lastTriedDate, '')
  assert.deepStrictEqual(doc.logDates, [])
  assert.deepStrictEqual(doc.logSources, {})
  assert.strictEqual(doc.lastLogRecordId, '')
  assert.strictEqual(collections.food_trials.find(item => item._id === 'other').status, 'tracking')
})

test('manual unlock preserves existing trial provenance', async () => {
  const existing = {
    _id: 'banana',
    familyCode: 'FAM',
    foodName: '香蕉',
    trialCount: 2,
    status: 'tracking',
    lastTriedDate: '2026-10-07',
    logDates: ['2026-10-06', '2026-10-07'],
    logSources: { '2026-10-06': 'r1', '2026-10-07': 'r2' },
    lastLogRecordId: 'r2',
    isCustom: true
  }
  const { main, collections } = loadFoodTrial({ food_trials: [existing], families: [] })

  const res = await main({ action: 'setStatus', familyCode: 'FAM', foodName: '香蕉', status: 'unlocked', date: '2026-10-08' })
  assert.strictEqual(res.success, true)

  const doc = collections.food_trials[0]
  assert.strictEqual(doc.status, 'unlocked')
  assert.strictEqual(doc.trialCount, 3)
  assert.strictEqual(doc.manuallyUnlocked, true)
  assert.strictEqual(doc.unlockedDate, '2026-10-08')
  assert.strictEqual(doc.lastTriedDate, existing.lastTriedDate)
  assert.deepStrictEqual(doc.logDates, existing.logDates)
  assert.deepStrictEqual(doc.logSources, existing.logSources)
  assert.strictEqual(doc.lastLogRecordId, existing.lastLogRecordId)
  assert.strictEqual(doc.isCustom, true)
})

test('manual unlock supports zero-day banana without inventing log dates', async () => {
  const existing = {
    _id: 'banana',
    familyCode: 'FAM',
    foodName: '香蕉',
    trialCount: 0,
    status: 'tracking',
    lastTriedDate: '',
    logDates: [],
    logSources: {},
    lastLogRecordId: ''
  }
  const { main, collections } = loadFoodTrial({ food_trials: [existing], families: [] })

  const res = await main({ action: 'setStatus', familyCode: 'FAM', foodName: '香蕉', status: 'unlocked', date: '2026-10-08' })
  assert.strictEqual(res.success, true)

  const doc = collections.food_trials[0]
  assert.strictEqual(doc.status, 'unlocked')
  assert.strictEqual(doc.trialCount, 3)
  assert.deepStrictEqual(doc.logDates, [])
  assert.deepStrictEqual(doc.logSources, {})
  assert.strictEqual(doc.lastTriedDate, '')
  assert.strictEqual(doc.lastLogRecordId, '')
})

test('manual unlocked apple does not block strict auto trial target selection', async () => {
  const { main, collections } = loadFoodTrial({
    food_trials: [{ _id: 'rice', familyCode: 'FAM', foodName: '米粉', trialCount: 3, status: 'unlocked' }],
    families: []
  })
  const res = await main({ action: 'setStatus', familyCode: 'FAM', foodName: '苹果', status: 'unlocked', date: '2026-10-08' })
  assert.strictEqual(res.success, true)

  const result = foodUnlock.getAutoTrialTargets(['米粉', '红薯'], collections.food_trials, '2026-10-08', 'strict')
  assert.deepStrictEqual(result, { targets: ['红薯'], ambiguous: false })
})

test('manual unlock rejects suspected allergic foods until restored', async () => {
  const { main, collections } = loadFoodTrial({
    food_trials: [{ _id: 'egg', familyCode: 'FAM', foodName: '鸡蛋', trialCount: 1, status: 'allergic' }],
    families: []
  })

  const res = await main({ action: 'setStatus', familyCode: 'FAM', foodName: '鸡蛋', status: 'unlocked', date: '2026-10-08' })
  assert.strictEqual(res.success, false)
  assert.match(res.error, /疑似过敏/)
  assert.strictEqual(collections.food_trials[0].status, 'allergic')
})

test('manual unlock requires a real YYYY-MM-DD date', async () => {
  const { main, collections } = loadFoodTrial({ food_trials: [], families: [] })

  const impossible = await main({ action: 'setStatus', familyCode: 'FAM', foodName: '苹果', status: 'unlocked', date: '2026-02-30' })
  const malformed = await main({ action: 'setStatus', familyCode: 'FAM', foodName: '苹果', status: 'unlocked', date: '20261008' })
  assert.strictEqual(impossible.success, false)
  assert.strictEqual(malformed.success, false)
  assert.strictEqual(collections.food_trials.length, 0)
})

test('manual unlock is idempotent for already unlocked foods', async () => {
  const existing = {
    _id: 'apple',
    familyCode: 'FAM',
    foodName: '苹果',
    trialCount: 3,
    status: 'unlocked',
    lastTriedDate: '2026-10-03',
    logDates: ['2026-10-01', '2026-10-02', '2026-10-03'],
    logSources: { '2026-10-01': 'r1', '2026-10-02': 'r2', '2026-10-03': 'r3' },
    lastLogRecordId: 'r3',
    manuallyUnlocked: false,
    unlockedDate: '2026-10-01'
  }
  const { main, collections } = loadFoodTrial({ food_trials: [existing], families: [] })

  const res = await main({ action: 'setStatus', familyCode: 'FAM', foodName: '苹果', status: 'unlocked', date: '2026-10-08' })
  assert.strictEqual(res.success, true)
  assert.deepStrictEqual(collections.food_trials[0].logDates, existing.logDates)
  assert.deepStrictEqual(collections.food_trials[0].logSources, existing.logSources)
  assert.strictEqual(collections.food_trials[0].lastLogRecordId, existing.lastLogRecordId)
  assert.strictEqual(collections.food_trials[0].manuallyUnlocked, false)
  assert.strictEqual(collections.food_trials[0].unlockedDate, '2026-10-01')
})

test('manual unlock re-checks a raced document before updating it', async () => {
  let raced = false
  const { main, collections } = loadFoodTrial({
    food_trials: [],
    families: [],
    __hooks: {
      food_trials: {
        add(data, items) {
          if (raced) return
          raced = true
          items.push({ _id: data._id, familyCode: 'FAM', foodName: '苹果', trialCount: 0, status: 'allergic' })
        }
      }
    }
  })

  const res = await main({ action: 'setStatus', familyCode: 'FAM', foodName: '苹果', status: 'unlocked', date: '2026-10-08' })
  assert.strictEqual(res.success, false)
  assert.match(res.error, /疑似过敏/)
  assert.strictEqual(collections.food_trials[0].status, 'allergic')
  assert.strictEqual(collections.food_trials[0].manuallyUnlocked, undefined)
})

test('manual unlock does not overwrite a tracking food that becomes allergic before update', async () => {
  let raced = false
  const { main, collections } = loadFoodTrial({
    food_trials: [{ _id: 'apple', familyCode: 'FAM', foodName: '苹果', trialCount: 1, status: 'tracking' }],
    families: [],
    __hooks: {
      food_trials: {
        updateWhere(query, data, items) {
          if (raced || query._id !== 'apple' || data.status !== 'unlocked') return
          raced = true
          items[0] = { ...items[0], status: 'allergic' }
        }
      }
    }
  })

  const res = await main({ action: 'setStatus', familyCode: 'FAM', foodName: '苹果', status: 'unlocked', date: '2026-10-08' })
  assert.strictEqual(res.success, false)
  assert.match(res.error, /状态已变化/)
  assert.strictEqual(collections.food_trials[0].status, 'allergic')
  assert.strictEqual(collections.food_trials[0].manuallyUnlocked, undefined)
})

test('manual unlock cannot be undone as a same-day trial', () => {
  assert.strictEqual(getUndoTrialState({ trialCount: 3, status: 'unlocked', manuallyUnlocked: true, lastTriedDate: '2026-10-08' }, '2026-10-08'), null)
})

;(async () => {
  for (const item of tests) {
    try {
      await item.fn()
      console.log(`ok - ${item.name}`)
    } catch (err) {
      console.error(`not ok - ${item.name}`)
      console.error(err)
      process.exit(1)
    }
  }
})()
