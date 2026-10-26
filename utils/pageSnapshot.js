// 只缓存展示快照；每次进入页面仍读取云端。每页只保留一个磁盘快照。
const MAX_AGE = 5 * 60 * 1000
const entries = new Map()
const hydrated = new Set()
const pending = new Map()
const persistence = new Map()

function key(parts) {
  const ordered = {}
  Object.keys(parts).sort().forEach(name => { ordered[name] = parts[name] })
  return JSON.stringify(ordered)
}

function copy(value) {
  return JSON.parse(JSON.stringify(value))
}

function id(scope, queryKey) {
  return JSON.stringify([scope, queryKey])
}

function remember(entry) {
  const identity = id(entry.scope, entry.key)
  entries.delete(identity)
  entries.set(identity, entry)
  if (entries.size > 20) entries.delete(entries.keys().next().value)
}

function read(scope, queryKey) {
  if (!hydrated.has(scope)) {
    hydrated.add(scope)
    try {
      const saved = wx.getStorageSync('pageSnapshot:v1:' + scope)
      if (saved && saved.scope === scope && typeof saved.key === 'string' &&
          Number.isFinite(saved.savedAt) && saved.value !== undefined) remember(saved)
    } catch (err) { /* 本地存储不可用时继续走云端。 */ }
  }
  const identity = id(scope, queryKey)
  const entry = entries.get(identity)
  if (!entry) return null
  const age = Date.now() - entry.savedAt
  if (age < 0 || age > MAX_AGE) {
    entries.delete(identity)
    return null
  }
  remember(entry)
  return copy(entry.value)
}

// 同一磁盘键串行写/删，较旧的写入完成后再执行最新操作。
function persist(scope, value) {
  const state = persistence.get(scope) || { busy: false, revision: 0 }
  persistence.set(scope, state)
  state.value = value
  state.revision += 1
  function flush() {
    if (state.busy) return
    const revision = state.revision
    const next = state.value
    const method = next === null ? 'removeStorage' : 'setStorage'
    if (typeof wx[method] !== 'function') return
    state.busy = true
    let finished = false
    const finish = () => {
      if (finished) return
      finished = true
      state.busy = false
      if (revision !== state.revision) flush()
    }
    try {
      const options = { key: 'pageSnapshot:v1:' + scope, success: finish, fail: finish }
      if (next !== null) options.data = next
      wx[method](options)
    } catch (err) { finish() }
  }
  flush()
}

function write(scope, queryKey, value) {
  hydrated.add(scope)
  const entry = { scope, key: queryKey, savedAt: Date.now(), value: copy(value) }
  remember(entry)
  persist(scope, entry)
}

function fetch(scope, queryKey, loader) {
  const identity = id(scope, queryKey)
  if (pending.has(identity)) return pending.get(identity).promise
  const token = { scope }
  const clear = () => { if (pending.get(identity) === token) pending.delete(identity) }
  token.promise = Promise.resolve().then(loader).then(value => {
    clear()
    return value
  }, err => { clear(); throw err })
  pending.set(identity, token)
  return token.promise
}

function invalidate(scope) {
  hydrated.add(scope)
  entries.forEach((entry, identity) => { if (entry.scope === scope) entries.delete(identity) })
  pending.forEach((token, identity) => { if (token.scope === scope) pending.delete(identity) })
  persist(scope, null)
}

module.exports = { key, read, write, fetch, invalidate }
