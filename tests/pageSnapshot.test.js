const assert = require('assert')
const fs = require('fs')
const modulePath = require.resolve('../utils/date.js').replace(/date\.js$/, 'pageSnapshot.js')
assert.ok(fs.existsSync(modulePath), 'the shared snapshot helper must exist')

function world() {
  const storage = new Map()
  const operations = []
  let reads = 0
  global.wx = {
    getStorageSync(key) { reads += 1; return storage.get(key) },
    setStorage(options) { operations.push(() => { storage.set(options.key, options.data); options.success() }) },
    removeStorage(options) { operations.push(() => { storage.delete(options.key); options.success() }) }
  }
  delete require.cache[modulePath]
  const cache = require(modulePath)
  return { cache, storage, operations, reads: () => reads }
}

async function main() {
  let env = world()
  let cache = env.cache
  const key = cache.key({ familyCode: 'A', date: '2026-10-26' })
  assert.strictEqual(key, cache.key({ date: '2026-10-26', familyCode: 'A' }))
  assert.strictEqual(cache.read('home', key), null)
  const input = [{ _id: 'one', value: 1 }]
  cache.write('home', key, input)
  input[0].value = 9
  const output = cache.read('home', key)
  output[0].value = 8
  assert.strictEqual(cache.read('home', key)[0].value, 1)
  assert.strictEqual(cache.read('home', cache.key({ familyCode: 'B', date: '2026-10-26' })), null)
  assert.strictEqual(env.reads(), 1)
  const now = Date.now
  Date.now = () => now() + 300001
  assert.strictEqual(cache.read('home', key), null)
  Date.now = now
  console.log('ok - snapshots isolate keys, expire, hydrate once and copy values')

  env = world()
  cache = env.cache
  cache.write('home', key, ['old'])
  cache.invalidate('home')
  assert.strictEqual(cache.read('home', key), null)
  cache.write('home', key, ['new'])
  assert.strictEqual(env.operations.length, 1, 'disk mutations for a scope must be serialized')
  while (env.operations.length) env.operations.shift()()
  assert.strictEqual(env.storage.size, 1)
  assert.deepStrictEqual([...env.storage.values()][0].value, ['new'])
  for (let i = 0; i < 21; i += 1) cache.write('stats', String(i), [i])
  assert.strictEqual(cache.read('stats', '0'), null, 'oldest memory entry must be evicted')
  assert.deepStrictEqual(cache.read('stats', '20'), [20])
  while (env.operations.length) env.operations.shift()()
  assert.strictEqual(env.storage.size, 2, 'disk holds one entry per scope')
  console.log('ok - invalidation and serialized persistence cannot resurrect an old snapshot')

  env = world()
  cache = env.cache
  let calls = 0
  let resolveOld
  let resolveNew
  const first = cache.fetch('home', key, () => { calls += 1; return new Promise(resolve => { resolveOld = resolve }) })
  const same = cache.fetch('home', key, () => { calls += 1 })
  assert.strictEqual(first, same)
  await Promise.resolve()
  assert.strictEqual(calls, 1)
  cache.invalidate('home')
  const next = cache.fetch('home', key, () => { calls += 1; return new Promise(resolve => { resolveNew = resolve }) })
  await Promise.resolve()
  resolveOld('old')
  await first
  assert.strictEqual(cache.fetch('home', key, () => 'wrong'), next, 'old completion cannot remove newer pending read')
  resolveNew('new')
  assert.strictEqual(await next, 'new')
  assert.strictEqual(cache.read('home', key), null, 'fetch must not auto-cache an unchecked response')
  await assert.rejects(cache.fetch('home', key, () => Promise.reject(new Error('offline'))))
  assert.strictEqual(await cache.fetch('home', key, () => 'retry'), 'retry')
  console.log('ok - concurrent reads coalesce, invalidation separates generations and errors remain retryable')

  global.wx = { getStorageSync() { throw new Error('unavailable') } }
  delete require.cache[modulePath]
  cache = require(modulePath)
  assert.strictEqual(cache.read('home', key), null)
  cache.write('home', key, [])
  assert.deepStrictEqual(cache.read('home', key), [])
  cache.invalidate('home')
  assert.strictEqual(await cache.fetch('home', key, () => 1), 1)
  console.log('ok - unavailable storage never blocks memory snapshots or network reads')
}
main().catch(err => { console.error(err); process.exitCode = 1 })
