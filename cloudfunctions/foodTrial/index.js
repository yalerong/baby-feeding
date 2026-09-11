const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const { normalizeFoodName, getTrialDocumentId } = require('./trialId.js')
const { getUndoTrialState, withLogSource } = require('./trialState.js')

function nextDay(date) {
  const value = new Date(`${date}T00:00:00Z`)
  value.setUTCDate(value.getUTCDate() + 1)
  return value.toISOString().slice(0, 10)
}

function previousDay(date) {
  const value = new Date(`${date}T00:00:00Z`)
  value.setUTCDate(value.getUTCDate() - 1)
  return value.toISOString().slice(0, 10)
}

// 用固定 _id 做原子创建：并发时第二个请求会因主键冲突失败，然后读回已有文档，不会互相覆盖
async function createOrGet(documentId, data) {
  try {
    await db.collection('food_trials').add({ data: { _id: documentId, ...data } })
    return { created: true, data: { _id: documentId, ...data } }
  } catch (err) {
    const res = await db.collection('food_trials').doc(documentId).get().catch(() => null)
    if (res && res.data) return { created: false, data: res.data }
    throw err
  }
}

// 打卡前对已有文档的全部守卫；并发冲突后读回的文档也要过同一遍
function validateLogTarget(existing, date) {
  if (!existing) return ''
  if (existing.status === 'allergic') return '该食材已标记疑似过敏'
  if (existing.status === 'unlocked') return '该食材已解锁，无需再记录'
  if (existing.lastTriedDate === date) return '今天已记录过这项食物'
  if (existing.lastTriedDate && existing.lastTriedDate > date) return `${existing.lastTriedDate} 已记录过，不能补录更早的日期`
  return ''
}

// 同一天另一条记录仍吃到该食材时，把这一天的打卡来源移交给它，避免来源指向已删除的记录
async function transferLogSource(existing, date, recordId) {
  if (!existing || !(existing.logSources || {})[date] && existing.lastTriedDate !== date) return { success: false, error: '这一天没有打卡记录' }
  const sources = withLogSource(existing.logSources, date, recordId)
  await db.collection('food_trials').doc(existing._id).update({
    data: { logSources: sources, lastLogRecordId: sources[existing.lastTriedDate] || '', updateTime: db.serverDate() }
  })
  return { success: true }
}

// 连续则在原 streak 上加一天并沿用各天来源；断了就重开 streak，旧来源作废
function buildLogPayload(existing, familyCode, foodName, date, recordId) {
  const consecutive = existing && existing.lastTriedDate && nextDay(existing.lastTriedDate) === date
  const trialCount = consecutive ? Number(existing.trialCount || 0) + 1 : 1
  const logSources = withLogSource(consecutive ? existing.logSources : {}, date, recordId)
  return {
    familyCode,
    foodName,
    trialCount,
    status: trialCount >= 3 ? 'unlocked' : 'tracking',
    lastTriedDate: date,
    logSources,
    lastLogRecordId: String(recordId || ''),
    updateTime: db.serverDate()
  }
}

exports.main = async event => {
  const { action, familyCode, date, status, recordId } = event
  const foodName = normalizeFoodName(event.foodName)
  if (!familyCode) return { success: false, error: 'familyCode required' }

  try {
    if (action === 'list') {
      const res = await db.collection('food_trials').where({ familyCode }).limit(1000).get()
      return { success: true, data: res.data || [] }
    }

    if (!foodName) return { success: false, error: 'foodName required' }
    const existingRes = await db.collection('food_trials').where({ familyCode, foodName }).limit(1).get()
    const existing = existingRes.data && existingRes.data[0]
    const documentId = existing ? existing._id : getTrialDocumentId(familyCode, foodName)

    // 家长自定义食材：只建档不打卡，trialCount 0 不会占用"当前连续试吃"
    if (action === 'add') {
      if (existing) return { success: true, data: existing, existed: true }
      const payload = { familyCode, foodName, trialCount: 0, status: 'tracking', lastTriedDate: '', logSources: {}, lastLogRecordId: '', isCustom: true, updateTime: db.serverDate(), createTime: db.serverDate() }
      const result = await createOrGet(documentId, payload)
      return { success: true, data: result.data, existed: !result.created }
    }

    if (action === 'log') {
      if (!date) return { success: false, error: 'date required' }
      const guard = validateLogTarget(existing, date)
      if (guard) return { success: false, error: guard }
      const activeRes = await db.collection('food_trials').where({ familyCode, status: 'tracking' }).limit(1000).get()
      const previousDate = previousDay(date)
      const active = (activeRes.data || []).find(item => item.foodName !== foodName && item.trialCount > 0 && item.trialCount < 3 && (item.lastTriedDate === date || item.lastTriedDate === previousDate))
      if (active) return { success: false, error: `请先完成 ${active.foodName} 的连续试吃` }
      if (existing) {
        const payload = buildLogPayload(existing, familyCode, foodName, date, recordId)
        await db.collection('food_trials').doc(existing._id).update({ data: payload })
        return { success: true, data: { ...existing, ...payload } }
      }
      const payload = buildLogPayload(null, familyCode, foodName, date, recordId)
      const result = await createOrGet(documentId, { ...payload, createTime: db.serverDate() })
      if (result.created) return { success: true, data: result.data }
      // 并发下别人刚建了档（比如同时点了"添加"）：在它之上按正常规则更新
      const raced = result.data
      const racedGuard = validateLogTarget(raced, date)
      if (racedGuard) return { success: false, error: racedGuard }
      const nextPayload = buildLogPayload(raced, familyCode, foodName, date, recordId)
      await db.collection('food_trials').doc(raced._id).update({ data: nextPayload })
      return { success: true, data: { ...raced, ...nextPayload } }
    }

    if (action === 'transferLogSource') {
      if (!date) return { success: false, error: 'date required' }
      return transferLogSource(existing, date, recordId)
    }

    if (action === 'undoLog') {
      if (!date) return { success: false, error: 'date required' }
      const nextState = getUndoTrialState(existing, date)
      if (!nextState) return { success: false, error: '只能撤销今天的试吃记录' }
      const { action: _ignored, ...data } = nextState
      await db.collection('food_trials').doc(existing._id).update({
        data: { ...data, updateTime: db.serverDate() }
      })
      return { success: true }
    }

    if (action === 'remove') {
      if (!existing) return { success: true }
      await db.collection('food_trials').doc(existing._id).remove()
      return { success: true }
    }

    if (action === 'setStatus') {
      if (!['allergic', 'tracking'].includes(status)) return { success: false, error: 'invalid status' }
      if (!existing && status === 'allergic') {
        await db.collection('food_trials').doc(documentId).set({
          data: { familyCode, foodName, trialCount: 0, status: 'allergic', updateTime: db.serverDate(), createTime: db.serverDate() }
        })
        return { success: true }
      }
      if (!existing) return { success: false, error: 'food trial required' }
      const nextStatus = status === 'tracking' && Number(existing.trialCount) >= 3 ? 'unlocked' : status
      await db.collection('food_trials').doc(existing._id).update({ data: { status: nextStatus, updateTime: db.serverDate() } })
      return { success: true }
    }

    return { success: false, error: 'unknown action' }
  } catch (err) {
    console.error(err)
    return { success: false, error: err.message }
  }
}
