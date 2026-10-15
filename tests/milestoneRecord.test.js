const assert = require('assert')
const Module = require('module')
const milestones = require('../utils/developmentMilestones.js')
const dateUtil = require('../utils/date.js')

function makeWorld() {
  const docs = new Map()
  const world = { docs, writes: 0, calls: [], toasts: [], storage: { familyCode: 'FAM', babyBirthDate: dateUtil.addDays(dateUtil.todayStr(), -220) } }
  const db = {
    async createCollection() {},
    serverDate: () => 'SERVER_DATE',
    collection(name) {
      assert.strictEqual(name, 'milestone_records')
      return {
        where(query) {
          return { limit() { return { async get() {
            if (world.listDown) throw new Error('list failed')
            return { data: [...docs.values()].filter(doc => doc.familyCode === query.familyCode) }
          } } } }
        },
        doc(id) {
          return { async set({ data }) {
            if (world.writeDown) throw new Error('write failed')
            world.writes += 1
            docs.set(id, { _id: id, ...data })
          } }
        }
      }
    }
  }
  const sdk = { init() {}, database: () => db, getWXContext: () => ({ OPENID: 'parent' }) }
  const originalLoad = Module._load
  const cloudPath = require.resolve('../cloudfunctions/milestoneRecord/index.js')
  delete require.cache[cloudPath]
  try {
    Module._load = function (request, parent, isMain) {
      return request === 'wx-server-sdk' ? sdk : originalLoad.call(this, request, parent, isMain)
    }
    world.main = require(cloudPath).main
  } finally {
    Module._load = originalLoad
  }

  world.newPage = () => {
    let config
    global.Page = value => { config = value }
    global.wx = {
      getStorageSync: key => world.storage[key] || '',
      showToast: options => world.toasts.push(options.title),
      stopPullDownRefresh: () => { world.refreshStopped = true },
      setClipboardData: options => { world.clipboard = options.data },
      cloud: { async callFunction({ name, data }) {
        assert.strictEqual(name, 'milestoneRecord')
        world.calls.push(data)
        if (world.delayList && data.action === 'list') return world.delayList(data)
        if (world.delaySave && data.action === 'set') await world.delaySave()
        return { result: await world.main(data) }
      } }
    }
    const pagePath = require.resolve('../pages/milestones/milestones.js')
    delete require.cache[pagePath]
    require(pagePath)
    return { ...config, data: JSON.parse(JSON.stringify(config.data)), setData(patch) { Object.assign(this.data, patch) } }
  }
  return world
}

const tap = (key, value) => ({ currentTarget: { dataset: { [key]: value } } })
const input = value => ({ detail: { value } })
const findItem = (page, id) => page.data.groups.flatMap(group => group.items).find(item => item.id === id)
const baseRecord = { action: 'set', familyCode: 'FAM', milestoneId: '6-cognitive-2', status: 'yes', observedDate: '2020-10-14', note: '主动抓玩具' }

async function run() {
  const world = makeWorld()
  const first = await world.main(baseRecord)
  const updated = await world.main({ ...baseRecord, status: 'unsure', note: '  再观察一下  ', _id: 'untrusted', updateBy: 'untrusted' })
  assert.strictEqual(first.success, true)
  assert.strictEqual(first.data._id, updated.data._id)
  assert.strictEqual(world.docs.size, 1)
  assert.strictEqual(updated.data.note, '再观察一下')
  assert.strictEqual(updated.data.updateBy, 'parent')
  await world.main({ ...baseRecord, familyCode: 'OTHER' })
  const own = await world.main({ action: 'list', familyCode: 'FAM' })
  const other = await world.main({ action: 'list', familyCode: 'OTHER' })
  assert.strictEqual(own.data.length, 1)
  assert.strictEqual(other.data.length, 1)
  assert.notStrictEqual(own.data[0]._id, other.data[0]._id)
  assert.strictEqual(own.data[0].status, 'unsure')
  assert.strictEqual(other.data[0].status, 'yes')
  console.log('ok - milestone updates are idempotent, ignore supplied ids/authorship and isolate families')

  const countBefore = world.writes
  for (const invalid of [
    { familyCode: '' }, { familyCode: '  ' }, { familyCode: {} },
    { milestoneId: '9-motor-5' }, { milestoneId: '6-social-4' }, { milestoneId: '12-social-1' },
    { status: 'passed' }, { status: '' },
    { observedDate: '2026-02-30' }, { observedDate: '2999-01-01' }, { observedDate: '2026-1-01' },
    { note: 'a'.repeat(301) }, { note: {} }, { action: 'remove' }
  ]) {
    assert.strictEqual((await world.main({ ...baseRecord, ...invalid })).success, false, JSON.stringify(invalid))
  }
  assert.strictEqual(world.writes, countBefore)
  for (const groups of Object.values(milestones.CHECKLISTS)) {
    for (const item of groups.flatMap(group => group.items)) {
      assert.strictEqual((await world.main({ ...baseRecord, milestoneId: item.id })).success, true, item.id)
    }
  }
  assert.strictEqual((await world.main({ action: 'list', familyCode: 'FAM' })).data.length, 25)
  console.log('ok - server accepts all 25 catalog ids and rejects invalid statuses, dates, notes and out-of-catalog ids')

  const fresh = makeWorld()
  let page = fresh.newPage()
  await page.onShow()
  assert.strictEqual(page.data.selectedMonth, 6)
  assert.strictEqual(page.data.recordedCount, 0)
  page.selectMonth(tap('month', 9))
  assert.match(page.data.stageHint, /下一阶段预览/)
  assert.deepStrictEqual(page.data.activities, [])
  assert.strictEqual(page.data.total, 13)
  page.selectMonth(tap('month', 6))
  page.openObservation(tap('id', '6-cognitive-2'))
  await page.saveObservation()
  assert.strictEqual(fresh.writes, 0)
  assert.strictEqual(fresh.toasts.pop(), '请选择观察结果')
  page.selectStatus(tap('status', 'yes'))
  page.onNoteInput(input('会主动伸手抓摇铃'))
  page.onDateChange(input('2020-10-14'))
  await page.saveObservation()
  assert.strictEqual(page.data.editor, null)
  assert.strictEqual(page.data.recordedCount, 1)
  assert.strictEqual(findItem(page, '6-cognitive-2').note, '会主动伸手抓摇铃')
  // 另一位家长重新进入页面，从云端读到相同结果。
  page = fresh.newPage()
  await page.onShow()
  assert.strictEqual(findItem(page, '6-cognitive-2').status, 'yes')
  assert.strictEqual(findItem(page, '6-cognitive-2').observedDate, '2020-10-14')
  page.openObservation(tap('id', '6-cognitive-2'))
  page.selectStatus(tap('status', 'notYet'))
  page.onNoteInput(input('修正这次观察'))
  await page.saveObservation()
  assert.strictEqual(fresh.docs.size, 1)
  assert.strictEqual(findItem(page, '6-cognitive-2').statusLabel, '还没观察到')
  console.log('ok - page previews the next stage, requires a choice and restores family observations after reopening')

  page.openObservation(tap('id', '6-cognitive-2'))
  page.selectStatus(tap('status', 'unsure'))
  page.onNoteInput(input('未保存的草稿'))
  const callsBeforeDraftRefresh = fresh.calls.length
  await page.onPullDownRefresh()
  await page.onShow()
  assert.strictEqual(fresh.calls.length, callsBeforeDraftRefresh)
  assert.strictEqual(page.data.editor.note, '未保存的草稿')
  fresh.writeDown = true
  const originalError = console.error
  try {
    console.error = () => {}
    await page.saveObservation()
  } finally { console.error = originalError }
  assert.strictEqual(page.data.editor.note, '未保存的草稿')
  assert.strictEqual(page.data.saving, false)
  assert.strictEqual(findItem(page, '6-cognitive-2').status, 'notYet')
  assert.strictEqual(fresh.toasts.pop(), '保存失败，请重试')
  fresh.writeDown = false
  let finishSave
  fresh.delaySave = () => new Promise(resolve => { finishSave = resolve })
  const saveCallCount = fresh.calls.length
  const pendingSave = page.saveObservation()
  await page.saveObservation()
  await page.onPullDownRefresh()
  page.closeEditor()
  assert.ok(page.data.editor)
  assert.strictEqual(fresh.calls.length, saveCallCount + 1)
  finishSave()
  await pendingSave
  assert.strictEqual(findItem(page, '6-cognitive-2').status, 'unsure')
  console.log('ok - failed saves preserve the draft and previous record; repeated taps create only one pending save')

  fresh.listDown = true
  page = fresh.newPage()
  try {
    console.error = () => {}
    await page.onShow()
  } finally { console.error = originalError }
  assert.strictEqual(page.data.loadError, true)
  page.openObservation(tap('id', '6-cognitive-2'))
  assert.strictEqual(page.data.editor, null)
  fresh.listDown = false
  await page.loadRecords()
  assert.strictEqual(page.data.loadError, false)
  assert.strictEqual(page.data.recordedCount, 1)
  page.copySource()
  assert.strictEqual(fresh.clipboard, 'https://www.cdc.gov/act-early/digital-online-checklist/6-months.html')
  page.copySummary()
  assert.match(fresh.clipboard, /还没设置|宝宝月龄/)
  assert.match(fresh.clipboard, /不确定/)
  page.copyActivitySource()
  assert.strictEqual(fresh.clipboard, 'https://www.cdc.gov/act-early/milestones/6-months.html')
  await page.onPullDownRefresh()
  assert.strictEqual(fresh.refreshStopped, true)
  assert.strictEqual(page.data.recordedCount, 1)
  console.log('ok - load errors block editing until retry succeeds and source links match the selected stage')

  const race = makeWorld()
  const racePage = race.newPage()
  await racePage.onShow()
  const reads = []
  race.delayList = () => new Promise(resolve => reads.push(resolve))
  const oldRead = racePage.loadRecords()
  const newRead = racePage.loadRecords()
  reads[1]({ result: { success: true, data: [baseRecord] } })
  await newRead
  reads[0]({ result: { success: true, data: [] } })
  await oldRead
  assert.strictEqual(racePage.data.recordedCount, 1)
  assert.strictEqual(findItem(racePage, '6-cognitive-2').status, 'yes')
  console.log('ok - out-of-order refresh responses retain the newest read')

  // 恢复 fresh 的 wx 桩，再检查卸载后的回调。
  fresh.newPage()

  let finishList
  fresh.delayList = () => new Promise(resolve => { finishList = resolve })
  const pendingLoad = page.loadRecords()
  page.onUnload()
  finishList({ result: { success: true, data: [] } })
  await pendingLoad
  assert.strictEqual(page.data.recordedCount, 1)
  console.log('ok - late list responses cannot overwrite a page after it is unloaded')
}

run().catch(err => { console.error(err); process.exitCode = 1 })
