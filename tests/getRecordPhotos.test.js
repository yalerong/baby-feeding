const assert = require('assert')
const fs = require('fs')
const path = require('path')
const vm = require('vm')

const FILE = 'cloud://family/feeding-photos/1730000000000-ab12.jpg'
const URL = 'https://storage.example.test/stool.jpg?signed=other-parent'
const plain = value => JSON.parse(JSON.stringify(value))

function world(rows = [], sign, readError) {
  const queries = []
  const signing = []
  const command = { in: values => ({ op: 'in', values }) }
  for (const op of ['lt', 'gte', 'gt']) command[op] = value => ({ op, value, and(other) { return { op: 'and', values: [this, other] } } })
  const db = {
    command,
    collection(name) {
      const query = { collection: name, conditions: {}, offset: 0, size: 100 }
      return {
        where(conditions) { query.conditions = conditions; return this },
        orderBy() { return this },
        field() { return this },
        skip(offset) { query.offset = offset; return this },
        limit(size) { query.size = size; return this },
        get() {
          queries.push(plain(query))
          if (readError) return Promise.reject(readError)
          const matches = rows.filter(row => row.familyCode === query.conditions.familyCode && (
            !query.conditions._id || query.conditions._id.op === 'in' && query.conditions._id.values.includes(row._id)
          ))
          return Promise.resolve({ data: matches.slice(query.offset, query.offset + query.size) })
        }
      }
    }
  }
  const cloud = {
    init() {}, DYNAMIC_CURRENT_ENV: 'TEST-ONLY', database: () => db,
    getTempFileURL(request) {
      signing.push(plain(request))
      return sign ? sign(request) : Promise.resolve({ fileList: request.fileList.map(file => ({
        fileID: file.fileID, status: 0, tempFileURL: 'https://storage.example.test/' + encodeURIComponent(file.fileID)
      })) })
    }
  }
  const loaded = new Map()
  function load(filename) {
    if (loaded.has(filename)) return loaded.get(filename).exports
    const module = { exports: {} }
    loaded.set(filename, module)
    const context = vm.createContext({
      module, exports: module.exports, console: { error() {} },
      require(id) {
        if (id === 'wx-server-sdk') return cloud
        return id.startsWith('.') ? load(require.resolve(path.resolve(path.dirname(filename), id))) : require(id)
      }
    })
    vm.runInContext(fs.readFileSync(filename, 'utf8'), context, { filename })
    return module.exports
  }
  const filename = path.join(__dirname, '../cloudfunctions/getRecords/index.js')
  return { main: load(filename).main, queries, signing }
}

const tests = []
function test(name, fn) { tests.push({ name, fn }) }

test('photo links are signed from matching family records instead of arbitrary client fileIDs', async () => {
  const other = 'cloud://other-family/feeding-photos/1730000000001-cd34.jpg'
  const api = world([
    { _id: 'ours', familyCode: 'FAMILY-A', images: [FILE] },
    { _id: 'other-family', familyCode: 'FAMILY-B', images: [other] },
    { _id: 'unrequested', familyCode: 'FAMILY-A', images: ['cloud://family/feeding-photos/1730000000002-ef56.jpg'] }
  ])
  const result = plain(await api.main({ action: 'photoUrls', familyCode: 'FAMILY-A', recordIds: ['ours', 'other-family'], fileIDs: [other] }))
  assert.strictEqual(result.success, true)
  assert.ok(result.imageUrls && result.imageUrls[FILE], 'another parent must receive a signed viewing URL')
  assert.strictEqual(result.imageUrls[other], undefined)
  assert.strictEqual(Object.keys(result.imageUrls).length, 1)
  assert.ok(api.queries.every(query => query.collection === 'feeding_records' && query.conditions.familyCode === 'FAMILY-A'))
  assert.deepStrictEqual(api.queries[0].conditions._id, { op: 'in', values: ['ours', 'other-family'] })
  assert.deepStrictEqual(api.signing[0].fileList, [{ fileID: FILE, maxAge: 600 }])
})

test('missing family or invalid record ids fail before database and storage access', async () => {
  for (const event of [
    { recordIds: ['ours'] }, { familyCode: 'FAMILY-A' }, { familyCode: 'FAMILY-A', recordIds: [] },
    { familyCode: 'FAMILY-A', recordIds: [''] }, { familyCode: 'FAMILY-A', recordIds: [12] },
    { familyCode: 'FAMILY-A', recordIds: Array.from({ length: 101 }, (_, index) => 'record-' + index) }
  ]) {
    const api = world()
    const result = plain(await api.main({ action: 'photoUrls', ...event }))
    assert.strictEqual(result.success, false)
    assert.strictEqual(api.queries.length, 0)
    assert.strictEqual(api.signing.length, 0)
  }
})

test('no-photo records need no storage call and stored image values remain unchanged', async () => {
  const rows = [
    { _id: 'milk', familyCode: 'FAMILY-A' },
    { _id: 'empty', familyCode: 'FAMILY-A', images: [] },
    { _id: 'invalid', familyCode: 'FAMILY-A', images: [null, '', 'https://untrusted.example.test/photo'] }
  ]
  const before = plain(rows)
  const api = world(rows)
  const result = plain(await api.main({ action: 'photoUrls', familyCode: 'FAMILY-A', recordIds: rows.map(row => row._id) }))
  assert.strictEqual(result.success, true)
  assert.deepStrictEqual(result.imageUrls, {})
  assert.strictEqual(api.signing.length, 0)
  assert.deepStrictEqual(rows, before)
})

test('signing deduplicates files and respects the fifty-file API limit', async () => {
  const images = Array.from({ length: 117 }, (_, index) => 'cloud://family/feeding-photos/' + (1730000000000 + index) + '-p' + index + '.jpg')
  const rows = images.map((image, index) => ({ _id: 'record-' + Math.floor(index / 3), familyCode: 'FAMILY-A', images: [image, image] }))
  const records = Array.from({ length: 39 }, (_, index) => ({
    _id: 'record-' + index, familyCode: 'FAMILY-A', images: rows.slice(index * 3, index * 3 + 3).flatMap(row => row.images)
  }))
  const api = world(records)
  const result = plain(await api.main({ action: 'photoUrls', familyCode: 'FAMILY-A', recordIds: records.map(row => row._id) }))
  assert.strictEqual(result.success, true)
  assert.strictEqual(api.signing.length, 3)
  assert.ok(api.signing.every(request => request.fileList.length <= 50))
  assert.deepStrictEqual(new Set(api.signing.flatMap(request => request.fileList.map(file => file.fileID))), new Set(images))
  assert.strictEqual(api.signing.flatMap(request => request.fileList).length, 117)
  assert.strictEqual(Object.keys(result.imageUrls).length, 117)
})

test('failed items, unrelated file results and non-HTTPS links are excluded', async () => {
  const failed = 'cloud://family/feeding-photos/1730000000001-dead.jpg'
  const unsafe = 'cloud://family/feeding-photos/1730000000002-abcd.jpg'
  const api = world([{ _id: 'ours', familyCode: 'FAMILY-A', images: [FILE, failed, unsafe] }], () => Promise.resolve({ fileList: [
    { fileID: FILE, status: 0, tempFileURL: URL },
    { fileID: failed, status: -1, tempFileURL: 'https://storage.example.test/deleted' },
    { fileID: unsafe, status: 0, tempFileURL: 'http://unsafe.example.test/photo' },
    { fileID: 'cloud://other-family/feeding-photos/1730000000003-ef12.jpg', status: 0, tempFileURL: 'https://storage.example.test/private' }
  ] }))
  const result = plain(await api.main({ action: 'photoUrls', familyCode: 'FAMILY-A', recordIds: ['ours'] }))
  assert.strictEqual(result.success, true)
  assert.deepStrictEqual(result.imageUrls, { [FILE]: URL })
})

test('references to other private folders, nested paths and decorated filenames are never signed', async () => {
  const forbidden = [
    'cloud://family/avatars/1730000000000-ab12.jpg',
    'cloud://family/feeding-photos/private/1730000000000-ab12.jpg',
    'cloud://family/feeding-photos/../1730000000000-ab12.jpg',
    'cloud://family/private/../feeding-photos/1730000000000-ab12.jpg',
    'cloud://family/feeding-photos/1730000000000-ab12.jpg?token=private',
    'cloud://family/feeding-photos/1730000000000-ab12.jpg#private',
    'cloud://family?token=private/feeding-photos/1730000000000-ab12.jpg'
  ]
  const api = world([{ _id: 'ours', familyCode: 'FAMILY-A', images: [FILE, ...forbidden] }])
  const result = plain(await api.main({ action: 'photoUrls', familyCode: 'FAMILY-A', recordIds: ['ours'] }))
  assert.strictEqual(result.success, true)
  assert.ok(result.imageUrls[FILE])
  assert.deepStrictEqual(api.signing.flatMap(request => request.fileList.map(file => file.fileID)), [FILE])
  assert.deepStrictEqual(Object.keys(result.imageUrls), [FILE])
})

test('storage errors retain the cloud function failure response', async () => {
  const api = world([{ _id: 'ours', familyCode: 'FAMILY-A', images: [FILE] }], () => Promise.reject(new Error('storage unavailable')))
  const result = plain(await api.main({ action: 'photoUrls', familyCode: 'FAMILY-A', recordIds: ['ours'] }))
  assert.strictEqual(result.success, false)
  assert.strictEqual(result.error, 'storage unavailable')
})

test('record lookup errors fail without signing any client-supplied files', async () => {
  const api = world([], null, new Error('records unavailable'))
  const result = plain(await api.main({ action: 'photoUrls', familyCode: 'FAMILY-A', recordIds: ['ours'], fileIDs: [FILE] }))
  assert.strictEqual(result.success, false)
  assert.strictEqual(result.error, 'records unavailable')
  assert.strictEqual(api.signing.length, 0)
})

;(async () => {
  let failures = 0
  for (const entry of tests) {
    try { await entry.fn(); console.log('ok - ' + entry.name) }
    catch (error) { failures += 1; console.error('not ok - ' + entry.name); console.error(error) }
  }
  process.exitCode = failures ? 1 : 0
})()
