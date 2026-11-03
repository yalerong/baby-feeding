const assert = require('assert')

const FILE = 'cloud://family/feeding-photos/stool.jpg'
const URL = 'https://storage.example.test/stool.jpg?signed=other-parent'
const record = (id = 'record-1', image = FILE) => ({ _id: id, images: [image] })
const flush = () => new Promise(resolve => setImmediate(resolve))

function world(reply) {
  const calls = []
  global.wx = {
    cloud: { callFunction(request) {
      calls.push(request)
      return reply ? reply(request) : Promise.resolve({ result: { success: true, imageUrls: { [FILE]: URL } } })
    } }
  }
  delete require.cache[require.resolve('../utils/pageSnapshot.js')]
  const filename = require.resolve('../utils/recordPhotos.js')
  delete require.cache[filename]
  return { calls, photos: require(filename) }
}

const tests = []
function test(name, fn) { tests.push({ name, fn }) }

test('another parent displays a signed photo URL while preserving its stored fileID', async () => {
  const { photos, calls } = world()
  const records = [record()]
  assert.deepStrictEqual(photos.displayUrls(records[0].images, 'FAMILY'), [FILE])
  const result = await photos.resolveRecordPhotos(records, 'FAMILY')
  assert.strictEqual(result[FILE], URL)
  assert.deepStrictEqual(photos.displayUrls(records[0].images, 'FAMILY'), [URL])
  assert.deepStrictEqual(records, [record()], 'shared viewing must not replace the stored fileID')
  assert.strictEqual(calls.length, 1)
  assert.strictEqual(calls[0].name, 'getRecords')
  assert.deepStrictEqual(calls[0].data, { action: 'photoUrls', familyCode: 'FAMILY', recordIds: ['record-1'] })
})

test('milk-only, unsaved and missing-family records do not request photo links', async () => {
  const { photos, calls } = world()
  await photos.resolveRecordPhotos([{ _id: 'milk', formula: 90 }, { _id: 'empty', images: [] }], 'FAMILY')
  await photos.resolveRecordPhotos([{ images: [FILE] }, { _id: 'local', images: ['wxfile://local-photo'] }], 'FAMILY')
  await photos.resolveRecordPhotos([record()], '')
  assert.strictEqual(calls.length, 0)
})

test('realtime snapshots reuse links and simultaneous reads share a request', async () => {
  let finish
  const { photos, calls } = world(() => new Promise(resolve => { finish = resolve }))
  const first = photos.resolveRecordPhotos([record()], 'FAMILY')
  const second = photos.resolveRecordPhotos([record()], 'FAMILY')
  await flush()
  assert.strictEqual(calls.length, 1)
  finish({ result: { success: true, imageUrls: { [FILE]: URL } } })
  await Promise.all([first, second])
  await photos.resolveRecordPhotos([record()], 'FAMILY')
  assert.strictEqual(calls.length, 1, 'raw watcher snapshots must not trigger repeated signing')
})

test('links are isolated by family and renewed after five minutes', async () => {
  const originalNow = Date.now
  let now = 1000000
  Date.now = () => now
  try {
    const { photos, calls } = world()
    await photos.resolveRecordPhotos([record()], 'FAMILY-A')
    assert.deepStrictEqual(photos.displayUrls([FILE], 'FAMILY-B'), [FILE])
    await photos.resolveRecordPhotos([record()], 'FAMILY-B')
    assert.strictEqual(calls.length, 2)
    now += 5 * 60 * 1000 + 1
    assert.deepStrictEqual(photos.displayUrls([FILE], 'FAMILY-A'), [FILE])
    await photos.resolveRecordPhotos([record()], 'FAMILY-A')
    assert.strictEqual(calls.length, 3)
  } finally {
    Date.now = originalNow
  }
})

test('a failed image can force a fresh URL before the five-minute cache expires', async () => {
  let version = 0
  const { photos, calls } = world(() => Promise.resolve({ result: {
    success: true, imageUrls: { [FILE]: URL + '&version=' + (++version) }
  } }))
  const records = [record()]
  await photos.resolveRecordPhotos(records, 'FAMILY')
  assert.deepStrictEqual(photos.displayUrls([FILE], 'FAMILY'), [URL + '&version=1'])
  const result = await photos.resolveRecordPhotos(records, 'FAMILY', true)
  assert.strictEqual(calls.length, 2, 'image load errors must be able to bypass a cached broken URL')
  assert.strictEqual(result[FILE], URL + '&version=2')
  assert.deepStrictEqual(photos.displayUrls([FILE], 'FAMILY'), [URL + '&version=2'])
  assert.deepStrictEqual(records, [record()])
})

test('large photo lists split record lookups without losing any ids', async () => {
  const { photos, calls } = world(request => Promise.resolve({ result: { success: true, imageUrls: Object.fromEntries(
    request.data.recordIds.map(id => ['cloud://family/' + id + '.jpg', 'https://storage.example.test/' + id])
  ) } }))
  const records = Array.from({ length: 217 }, (_, index) => record('record-' + index, 'cloud://family/record-' + index + '.jpg'))
  await photos.resolveRecordPhotos(records, 'FAMILY')
  assert.strictEqual(calls.length, 3)
  assert.ok(calls.every(call => call.data.recordIds.length <= 100))
  assert.deepStrictEqual(new Set(calls.flatMap(call => call.data.recordIds)), new Set(records.map(item => item._id)))
  assert.deepStrictEqual(photos.displayUrls(records[216].images, 'FAMILY'), ['https://storage.example.test/record-216'])
})

test('failed link requests remain retryable and do not poison the cache', async () => {
  for (const networkFailure of [false, true]) {
    let failed = true
    const { photos, calls } = world(() => {
      if (failed) return networkFailure ? Promise.reject(new Error('offline')) : Promise.resolve({ result: { success: false, error: 'unavailable' } })
      return Promise.resolve({ result: { success: true, imageUrls: { [FILE]: URL } } })
    })
    await photos.resolveRecordPhotos([record()], 'FAMILY').catch(() => {})
    assert.deepStrictEqual(photos.displayUrls([FILE], 'FAMILY'), [FILE])
    failed = false
    await photos.resolveRecordPhotos([record()], 'FAMILY')
    assert.strictEqual(calls.length, 2)
    assert.deepStrictEqual(photos.displayUrls([FILE], 'FAMILY'), [URL])
  }
})

test('unrequested photos and non-HTTPS responses never enter the cache', async () => {
  const unrelated = 'cloud://another-family/private.jpg'
  const { photos } = world(() => Promise.resolve({ result: { success: true, imageUrls: {
    [FILE]: 'http://unsafe.example.test/stool.jpg',
    [unrelated]: 'https://storage.example.test/private.jpg'
  } } }))
  const result = await photos.resolveRecordPhotos([record()], 'FAMILY')
  assert.strictEqual(result[FILE], undefined)
  assert.strictEqual(result[unrelated], undefined)
  assert.deepStrictEqual(photos.displayUrls([FILE, unrelated], 'FAMILY'), [FILE, unrelated])
})

;(async () => {
  let failures = 0
  for (const entry of tests) {
    try { await entry.fn(); console.log('ok - ' + entry.name) }
    catch (error) { failures += 1; console.error('not ok - ' + entry.name); console.error(error) }
  }
  process.exitCode = failures ? 1 : 0
})()
