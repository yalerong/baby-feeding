const assert = require('assert')
const fs = require('fs')
const path = require('path')

const FILE = 'cloud://family/feeding-photos/1793700000000-abc123.jpg'
const SECOND = 'cloud://family/feeding-photos/1793700000001-def456.jpg'
const DATE = '2026-11-03'
const flush = () => new Promise(resolve => setImmediate(resolve))
const signed = (file, version) => 'https://storage.example.test/' + encodeURIComponent(file) + '?version=' + version

function world(reply) {
  const storage = new Map([['familyCode', 'FAMILY-A']])
  const calls = [], previews = [], changes = [], uploads = []
  global.wx = {
    getStorageSync: key => storage.get(key) || '',
    setStorage({ key, data, success }) { storage.set(key, data); success() },
    showToast() {}, showLoading() {}, hideLoading() {},
    previewImage: options => previews.push(options),
    chooseMedia: () => Promise.resolve({ tempFiles: [{ tempFilePath: 'wxfile://camera-photo' }] }),
    cloud: {
      callFunction(request) {
        calls.push(request)
        return reply ? reply(request) : Promise.resolve({ result: { success: true, imageUrls: {
          [FILE]: signed(FILE, calls.length), [SECOND]: signed(SECOND, calls.length)
        } } })
      },
      uploadFile(options) { uploads.push(options); return Promise.resolve({ fileID: SECOND }) }
    }
  }
  for (const filename of ['../utils/pageSnapshot.js', '../utils/recordPhotos.js', '../pages/index/index.js', '../components/photo-uploader/photo-uploader.js']) {
    delete require.cache[require.resolve(filename)]
  }
  let homeDefinition, componentDefinition
  global.Page = definition => { homeDefinition = definition }
  global.Component = definition => { componentDefinition = definition }
  require('../pages/index/index.js')
  require('../components/photo-uploader/photo-uploader.js')
  const updates = []
  const home = {
    ...homeDefinition,
    _homeActive: true, _homeGeneration: 1,
    data: { ...JSON.parse(JSON.stringify(homeDefinition.data)), familyCode: 'FAMILY-A', currentDate: DATE, todayDate: DATE },
    setData(patch, callback) { updates.push(patch); Object.assign(this.data, patch); if (callback) callback() },
    refreshSinceLastFeeding() {}, refreshDailyReview() {}
  }
  function component() {
    const instance = {
      ...componentDefinition.methods,
      properties: { initialImages: [FILE], recordId: 'stool-1', maxCount: 3 },
      data: JSON.parse(JSON.stringify(componentDefinition.data)), updates: [],
      setData(patch) { this.updates.push(patch); Object.assign(this.data, patch) },
      triggerEvent(name, detail) { changes.push({ name, detail }) }
    }
    componentDefinition.lifetimes.attached.call(instance)
    return instance
  }
  return { home, component, componentDefinition, calls, previews, changes, uploads, storage, updates, snapshot: require('../utils/pageSnapshot.js') }
}

const record = { _id: 'stool-1', date: DATE, time: '09:00', stool: true, stoolDesc: '成型，黄，中', images: [FILE] }
const event = { currentTarget: { dataset: { id: 'stool-1', url: FILE, urls: [FILE] } } }
const tests = []
function test(name, fn) { tests.push({ name, fn }) }

test('home thumbnails and preview share signed links without persisting them into the record snapshot', async () => {
  const env = world()
  env.home.applyHomeRecords([record], null, DATE)
  await flush()
  assert.deepStrictEqual(env.home.data.records[0].images, [FILE])
  assert.deepStrictEqual(env.home.data.records[0].imageUrls, [signed(FILE, 1)])
  const saved = env.snapshot.read('home', env.home.homeRecordsKey(DATE))
  assert.deepStrictEqual(saved.records, [record], 'cached records must retain fileIDs, without expiring signed URLs')
  env.home.applyHomeRecords([{ ...record, stoolDesc: '稠，黄，中' }], null, DATE)
  await flush()
  assert.deepStrictEqual(env.home.data.records[0].imageUrls, [signed(FILE, 1)])
  await env.home.previewRecordImage(event)
  assert.strictEqual(env.calls.length, 1, 'raw realtime snapshots and preview must reuse active links')
  assert.strictEqual(env.previews[0].current, signed(FILE, 1))
  assert.deepStrictEqual(env.previews[0].urls, [signed(FILE, 1)])
})

test('late photo links cannot alter a hidden home, another family or another date', async () => {
  for (const changed of ['hidden', 'family', 'date']) {
    let finish
    const env = world(() => new Promise(resolve => { finish = resolve }))
    env.home.applyHomeRecords([record], null, DATE)
    await flush()
    if (changed === 'hidden') env.home._homeActive = false
    if (changed === 'family') env.home.data.familyCode = 'FAMILY-B'
    if (changed === 'date') env.home.data.currentDate = '2026-11-02'
    const count = env.updates.length
    finish({ result: { success: true, imageUrls: { [FILE]: signed(FILE, 1) } } })
    await flush()
    assert.strictEqual(env.updates.length, count, changed + ' home must reject a late photo response')
  }
})

test('expired lazy thumbnails refresh once on failure and allow another refresh after a successful load', async () => {
  const env = world()
  env.home.applyHomeRecords([record], null, DATE)
  await flush()
  await env.home.onRecordImageError(event)
  assert.strictEqual(env.calls.length, 2)
  assert.deepStrictEqual(env.home.data.records[0].imageUrls, [signed(FILE, 2)])
  await env.home.onRecordImageError(event)
  assert.strictEqual(env.calls.length, 2, 'a broken or deleted file must not cause an endless signing loop')
  env.home.onRecordImageLoad(event)
  await env.home.onRecordImageError(event)
  assert.strictEqual(env.calls.length, 3, 'a later expiry must still be recoverable after a successful load')
})

test('editing another parent photo uses signed thumbnails and preview while upload and removal emit fileIDs', async () => {
  const env = world()
  const component = env.component()
  await flush()
  assert.strictEqual(component.data.imageUrls[FILE], signed(FILE, 1))
  await component.previewImage(event)
  assert.strictEqual(env.previews[0].current, signed(FILE, 1))
  assert.deepStrictEqual(env.previews[0].urls, [signed(FILE, 1)])
  await component.chooseAndUpload()
  assert.strictEqual(env.uploads[0].filePath, 'wxfile://camera-photo')
  assert.ok(/^feeding-photos\/\d+-[a-z0-9]{0,6}\.jpg$/.test(env.uploads[0].cloudPath))
  assert.deepStrictEqual(env.changes[0], { name: 'change', detail: { images: [FILE, SECOND] } })
  component.removeImage({ currentTarget: { dataset: { index: 0 } } })
  assert.deepStrictEqual(env.changes[1], { name: 'change', detail: { images: [SECOND] } })
})

test('edit thumbnails refresh after an image failure without an endless retry loop', async () => {
  const env = world()
  const component = env.component()
  await flush()
  await component.onImageError(event)
  assert.strictEqual(component.data.imageUrls[FILE], signed(FILE, 2))
  await component.onImageError(event)
  assert.strictEqual(env.calls.length, 2)
  component.onImageLoad(event)
  await component.onImageError(event)
  assert.strictEqual(env.calls.length, 3)
})

test('a component hidden during link lookup ignores the late result', async () => {
  let finish
  const env = world(() => new Promise(resolve => { finish = resolve }))
  const component = env.component()
  await flush()
  env.componentDefinition.pageLifetimes.hide.call(component)
  const count = component.updates.length
  finish({ result: { success: true, imageUrls: { [FILE]: signed(FILE, 1) } } })
  await flush()
  assert.strictEqual(component.updates.length, count)
  assert.deepStrictEqual(component.data.imageUrls, {})
})

test('waiting photo previews are cancelled after a date change or removing the selected photo', async () => {
  for (const target of ['home', 'component']) {
    let finish
    const env = world(() => new Promise(resolve => { finish = resolve }))
    let preview
    if (target === 'home') {
      env.home.applyHomeRecords([record], null, DATE)
      preview = env.home.previewRecordImage(event)
      await flush()
      env.home.data.currentDate = '2026-11-02'
    } else {
      const component = env.component()
      preview = component.previewImage(event)
      await flush()
      component.removeImage({ currentTarget: { dataset: { index: 0 } } })
    }
    finish({ result: { success: true, imageUrls: { [FILE]: signed(FILE, 1) } } })
    await preview
    assert.strictEqual(env.previews.length, 0, target + ' must cancel a preview that is no longer current')
  }
})

test('a later upload failure preserves photos that already uploaded successfully', async () => {
  const env = world()
  const component = env.component()
  await flush()
  wx.chooseMedia = () => Promise.resolve({ tempFiles: [{ tempFilePath: 'first' }, { tempFilePath: 'second' }] })
  wx.cloud.uploadFile = ({ filePath }) => filePath === 'first'
    ? Promise.resolve({ fileID: SECOND }) : Promise.reject(new Error('upload interrupted'))
  await component.chooseAndUpload()
  assert.deepStrictEqual(component.data.imageList, [FILE, SECOND])
  assert.deepStrictEqual(env.changes[0], { name: 'change', detail: { images: [FILE, SECOND] } })
  assert.strictEqual(component.data.uploading, false)
})

test('two quick photo taps open a single picker and do not duplicate uploads', async () => {
  const env = world()
  const component = env.component()
  await flush()
  let finish, picks = 0
  const picking = new Promise(resolve => { finish = resolve })
  wx.chooseMedia = () => { picks += 1; return picking }
  const first = component.chooseAndUpload()
  const second = component.chooseAndUpload()
  finish({ tempFiles: [{ tempFilePath: 'wxfile://camera-photo' }] })
  await Promise.all([first, second])
  assert.strictEqual(picks, 1)
  assert.strictEqual(env.uploads.length, 1)
  assert.deepStrictEqual(component.data.imageList, [FILE, SECOND])
})

test('the photo templates bind signed sources and controlled expiry recovery', () => {
  const home = fs.readFileSync(path.join(__dirname, '../pages/index/index.wxml'), 'utf8')
  const component = fs.readFileSync(path.join(__dirname, '../components/photo-uploader/photo-uploader.wxml'), 'utf8')
  const add = fs.readFileSync(path.join(__dirname, '../pages/add/add.wxml'), 'utf8')
  assert.ok(home.includes('src="{{item.imageUrls[index]}}"'))
  assert.ok(home.includes('binderror="onRecordImageError"') && home.includes('bindload="onRecordImageLoad"'))
  assert.ok(component.includes('src="{{imageUrls[item] || item}}"'))
  assert.ok(component.includes('binderror="onImageError"') && component.includes('bindload="onImageLoad"'))
  assert.ok(add.includes('recordId="{{_id}}"'))
})

;(async () => {
  let failures = 0
  for (const entry of tests) {
    try { await entry.fn(); console.log('ok - ' + entry.name) }
    catch (error) { failures += 1; console.error('not ok - ' + entry.name); console.error(error) }
  }
  process.exitCode = failures ? 1 : 0
})()
