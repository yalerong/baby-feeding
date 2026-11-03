const assert = require('assert')
const fs = require('fs')
const path = require('path')
const vm = require('vm')

const flush = () => new Promise(resolve => setImmediate(resolve))
function deferred() {
  let resolve, reject
  const promise = new Promise((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}

function world(name, reply, options = {}) {
  const calls = [], notices = [], navigation = [], modals = [], timers = new Map()
  const storage = { familyCode: 'FAMILY', babyBirthDate: '2026-02-24' }
  let definition, timerId = 0
  const filename = path.join(__dirname, '../pages', name, name + '.js')
  const wx = {
    getStorageSync: key => storage[key] || '',
    showLoading() {}, hideLoading() {}, setNavigationBarTitle() {},
    showToast: options => notices.push(options),
    showModal(value) { modals.push(value); if (options.confirmModals !== false) value.success({ confirm: true }) },
    navigateBack: () => navigation.push('back'),
    cloud: { callFunction(request) {
      calls.push(request)
      return reply ? reply(request) : new Promise(() => {})
    } }
  }
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), {
    Page: value => { definition = value }, wx, console: { error() {} },
    setTimeout(fn) { const id = ++timerId; timers.set(id, fn); return id },
    clearTimeout: id => timers.delete(id),
    require(id) { return id.endsWith('/pageSnapshot.js') ? { invalidate() {} } : require(path.resolve(path.dirname(filename), id)) }
  }, { filename })
  const page = { ...definition, data: JSON.parse(JSON.stringify(definition.data)),
    setData(patch) { Object.assign(this.data, patch) } }
  const fill = () => Object.assign(page.data, name === 'growthEdit'
    ? { date: '2026-11-03', weight: '8.5', height: '', note: '' }
    : { vaccineName: '自定义疫苗', category: '自定义', dose: 1, plannedDate: '2026-11-03', note: '' })
  return { page, calls, notices, navigation, storage, fill, modals,
    runTimers() { for (const fn of Array.from(timers.values())) fn(); timers.clear() } }
}

const tests = []
function test(name, fn) { tests.push({ name, fn }) }

for (const name of ['growthEdit', 'vaccineEdit']) {
  test(name + ' submits one request for repeated save taps and allows retry after failure', async () => {
    const pending = deferred()
    const env = world(name, () => pending.promise)
    env.page.onLoad({}); env.fill()
    env.page.submit(); env.page.submit()
    assert.strictEqual(env.calls.length, 1)
    pending.reject(new Error('offline')); await flush()
    env.page.submit()
    assert.strictEqual(env.calls.length, 2)
  })

  test(name + ' cannot overwrite an existing record before its initial read succeeds', async () => {
    const pending = deferred()
    const env = world(name, () => pending.promise)
    env.page.onLoad({ id: 'existing' }); env.fill()
    env.page.submit()
    assert.strictEqual(env.calls.length, 1, 'only the get request is allowed while fields are unknown')
    pending.reject(new Error('offline')); await flush()
    env.page.submit()
    assert.strictEqual(env.calls.length, 1, 'a failed read must not permit clearing unknown stored fields')
  })

  for (const leaveBeforeResponse of [false, true]) {
    test(name + ' does not navigate another page after ' + (leaveBeforeResponse ? 'a late write' : 'a scheduled return'), async () => {
      const pending = deferred()
      const env = world(name, () => pending.promise)
      env.page.onLoad({}); env.fill(); env.page.submit()
      if (leaveBeforeResponse && env.page.onUnload) env.page.onUnload()
      pending.resolve({ result: { success: true } }); await flush()
      if (!leaveBeforeResponse && env.page.onUnload) env.page.onUnload()
      env.runTimers()
      assert.strictEqual(env.navigation.length, 0)
    })
  }

  test(name + ' prevents save and delete operations from overlapping', async () => {
    const env = world(name, request => request.data.action === 'get'
      ? Promise.resolve({ result: { success: true, data: name === 'growthEdit'
        ? { date: '2026-11-03', weight: 8.5, height: 70 }
        : { vaccineName: '自定义疫苗', category: '自定义', dose: 1, plannedDate: '2026-11-03' } } })
      : new Promise(() => {}))
    env.page.onLoad({ id: 'existing' }); await flush()
    env.page.submit(); env.page.deleteRecord()
    assert.strictEqual(env.calls.filter(call => call.data.action !== 'get').length, 1)
  })
}

test('custom vaccine changes include its name and dose in the update request', async () => {
  const env = world('vaccineEdit', request => request.data.action === 'get'
    ? Promise.resolve({ result: { success: true, data: {
      vaccineName: '原名称', category: '自定义', dose: 1, plannedDate: '2026-11-03'
    } } }) : new Promise(() => {}))
  env.page.onLoad({ id: 'custom' }); await flush()
  env.page.bindNameInput({ detail: { value: '修改后的名称' } })
  env.page.bindDoseInput({ detail: { value: '2' } })
  env.page.submit()
  assert.strictEqual(env.calls[1].data.data.vaccineName, '修改后的名称')
  assert.strictEqual(env.calls[1].data.data.dose, 2)
})

test('restoring the system vaccine date explicitly clears the custom-planning flag', async () => {
  const env = world('vaccineEdit', request => request.data.action === 'get'
    ? Promise.resolve({ result: { success: true, data: {
      vaccineName: '乙肝疫苗', category: '一类', dose: 1, plannedDate: '2026-03-01', isCustomPlanned: true
    } } }) : new Promise(() => {}))
  env.page.onLoad({ id: 'preset' }); await flush()
  await env.page.resetPlanned(); env.page.submit()
  assert.strictEqual(env.calls[1].data.data.isCustomPlanned, false)
})

test('restoring a later vaccine date respects the preceding actual dose and ignores custom namesakes', async () => {
  const env = world('vaccineEdit', request => Promise.resolve({ result: { success: true, data: request.data.action === 'get'
    ? { vaccineName: '乙肝疫苗', category: '一类', dose: 2, plannedDate: '2026-05-01', isCustomPlanned: true }
    : [
      { vaccineName: '乙肝疫苗', category: '一类', dose: 1, actualDate: '2026-04-01' },
      { vaccineName: '乙肝疫苗', category: '自定义', dose: 1, actualDate: '2026-06-01' }
    ] } }))
  env.page.onLoad({ id: 'preset' }); await flush()
  await env.page.resetPlanned()
  assert.strictEqual(env.page.data.plannedDate, '2026-04-29')
})

test('a failed preceding-dose lookup preserves the current planned date', async () => {
  const env = world('vaccineEdit', request => Promise.resolve({ result: request.data.action === 'get'
    ? { success: true, data: { vaccineName: '乙肝疫苗', category: '一类', dose: 2, plannedDate: '2026-05-01', isCustomPlanned: true } }
    : { success: false, error: 'offline' } }))
  env.page.onLoad({ id: 'preset' }); await flush()
  await env.page.resetPlanned()
  assert.strictEqual(env.page.data.plannedDate, '2026-05-01')
  assert.ok(!env.page._plannedReset)
})

test('completing a custom vaccine named like a preset never recalculates the preset series', async () => {
  const env = world('vaccineEdit', request => Promise.resolve({ result: { success: true, data: request.data.action === 'get'
    ? { vaccineName: '乙肝疫苗', category: '自定义', dose: 1, plannedDate: '2026-05-01', actualDate: '2026-05-01' }
    : [] } }))
  env.page.onLoad({ id: 'custom' }); await flush()
  env.page.submit(); await flush()
  assert.ok(!env.calls.some(call => call.data.action === 'list'))
})

for (const manualSecond of [false, true]) {
  test('following vaccine dates advance through ' + (manualSecond ? 'a manual planned anchor' : 'each unscheduled dose'), async () => {
    const records = [
      { _id: 'first', vaccineName: '百白破疫苗', category: '一类', dose: 1, actualDate: '2026-11-01' },
      { _id: 'second', vaccineName: '百白破疫苗', category: '一类', dose: 2, plannedDate: manualSecond ? '2026-12-10' : '2026-06-24', isCustomPlanned: manualSecond },
      { _id: 'third', vaccineName: '百白破疫苗', category: '一类', dose: 3, plannedDate: '2026-07-24' }
    ]
    const env = world('vaccineEdit', request => Promise.resolve({ result: { success: true, data: request.data.action === 'list' ? records : null } }))
    await env.page.recalculateFollowing('FAMILY', '百白破疫苗', '2026-02-24')
    const updates = env.calls.filter(call => call.data.action === 'update')
    if (manualSecond) assert.ok(!updates.some(call => call.data._id === 'second'))
    else assert.strictEqual(updates.find(call => call.data._id === 'second').data.data.plannedDate, '2026-11-29')
    assert.strictEqual(updates.find(call => call.data._id === 'third').data.data.plannedDate, manualSecond ? '2027-01-07' : '2026-12-27')
  })

  test('restoring a third dose uses ' + (manualSecond ? 'the manual second-dose date' : 'the calculated second-dose date'), async () => {
    const current = { _id: 'third', vaccineName: '百白破疫苗', category: '一类', dose: 3, plannedDate: '2026-11-29', isCustomPlanned: true }
    const env = world('vaccineEdit', request => Promise.resolve({ result: { success: true, data: request.data.action === 'get' ? current : [
      { _id: 'first', vaccineName: current.vaccineName, category: '一类', dose: 1, actualDate: '2026-11-01' },
      { _id: 'second', vaccineName: current.vaccineName, category: '一类', dose: 2, plannedDate: manualSecond ? '2026-12-10' : '2026-06-24', isCustomPlanned: manualSecond },
      current
    ] } }))
    env.page.onLoad({ id: 'third' }); await flush()
    await env.page.resetPlanned()
    assert.strictEqual(env.page.data.plannedDate, manualSecond ? '2027-01-07' : '2026-12-27')
  })
}

for (const failedStep of ['list', 'update', 'network']) {
  test('a failed following-plan ' + failedStep + ' can retry without rewriting the saved main record', async () => {
    let failing = true
    const first = { _id: 'first', vaccineName: '百白破疫苗', category: '一类', dose: 1, plannedDate: '2026-05-24', actualDate: '2026-11-01' }
    const env = world('vaccineEdit', request => {
      if (request.data.action === 'get') return Promise.resolve({ result: { success: true, data: first } })
      if (request.data.action === 'list') return Promise.resolve({ result: failing && failedStep === 'list'
        ? { success: false, error: 'list failed' } : { success: true, data: [first, {
          _id: 'second', vaccineName: first.vaccineName, category: '一类', dose: 2, plannedDate: '2026-06-24'
        }] } })
      if (request.data._id === 'second' && failing) {
        if (failedStep === 'network') return Promise.reject(new Error('offline'))
        if (failedStep === 'update') return Promise.resolve({ result: { success: false, error: 'update failed' } })
      }
      return Promise.resolve({ result: { success: true } })
    }, { confirmModals: false })
    env.page.onLoad({ id: 'first' }); await flush()
    env.page.submit(); await flush()
    assert.strictEqual(env.modals.length, 1)
    assert.strictEqual(env.modals[0].title, '记录已保存')
    assert.strictEqual(env.page.data.saving, true, 'the completed main write must remain protected against another submit')
    assert.ok(!env.notices.some(notice => notice.title === '保存失败'))
    env.page.submit()
    failing = false
    env.modals[0].success({ confirm: true }); await flush()
    assert.strictEqual(env.calls.filter(call => call.data.action === 'update' && call.data._id === 'first').length, 1)
    assert.strictEqual(env.notices[env.notices.length - 1].title, '保存成功')
  })
}

test('a late following-plan failure prompts only after returning and cannot retry after unload', async () => {
  const pending = deferred()
  const env = world('vaccineEdit', request => request.data.action === 'get'
    ? Promise.resolve({ result: { success: true, data: { vaccineName: '百白破疫苗', category: '一类', dose: 1, plannedDate: '2026-05-24', actualDate: '2026-11-01' } } })
    : request.data.action === 'list' ? pending.promise : Promise.resolve({ result: { success: true } }), { confirmModals: false })
  env.page.onLoad({ id: 'first' }); await flush()
  env.page.submit(); await flush(); env.page.onHide()
  pending.resolve({ result: { success: false, error: 'offline' } }); await flush()
  assert.strictEqual(env.modals.length, 0)
  env.page.onShow()
  assert.strictEqual(env.modals.length, 1)
  env.page.onUnload()
  env.modals[0].success({ confirm: true }); await flush()
  assert.strictEqual(env.calls.filter(call => call.data.action === 'list').length, 1)
  env.runTimers()
  assert.strictEqual(env.navigation.length, 0)
})

;(async () => {
  let failures = 0
  for (const entry of tests) {
    try { await entry.fn(); console.log('ok - ' + entry.name) }
    catch (error) { failures += 1; console.error('not ok - ' + entry.name); console.error(error) }
  }
  process.exitCode = failures ? 1 : 0
})()
