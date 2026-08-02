const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const { normalizeFoodName, getTrialDocumentId } = require('./trialId.js')
const { getUndoTrialState } = require('./trialState.js')

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

exports.main = async event => {
  const { action, familyCode, date, status } = event
  const foodName = normalizeFoodName(event.foodName)
  if (!familyCode) return { success: false, error: 'familyCode required' }

  try {
    if (action === 'list') {
      const res = await db.collection('food_trials').where({ familyCode }).get()
      return { success: true, data: res.data || [] }
    }

    if (!foodName) return { success: false, error: 'foodName required' }
    const existingRes = await db.collection('food_trials').where({ familyCode, foodName }).limit(1).get()
    const existing = existingRes.data && existingRes.data[0]
    const documentId = existing ? existing._id : getTrialDocumentId(familyCode, foodName)

    if (action === 'log') {
      if (!date) return { success: false, error: 'date required' }
      const activeRes = await db.collection('food_trials').where({ familyCode, status: 'tracking' }).get()
      const previousDate = previousDay(date)
      const active = (activeRes.data || []).find(item => item.foodName !== foodName && item.trialCount > 0 && item.trialCount < 3 && (item.lastTriedDate === date || item.lastTriedDate === previousDate))
      if (active) return { success: false, error: `请先完成 ${active.foodName} 的连续试吃` }
      if (existing && existing.status === 'allergic') return { success: false, error: '该食材已标记疑似过敏' }
      if (existing && existing.lastTriedDate === date) return { success: false, error: '今天已记录过这项食物' }
      const consecutive = existing && existing.lastTriedDate && nextDay(existing.lastTriedDate) === date
      const trialCount = consecutive ? Number(existing.trialCount || 0) + 1 : 1
      const payload = {
        familyCode,
        foodName,
        trialCount,
        status: trialCount >= 3 ? 'unlocked' : 'tracking',
        lastTriedDate: date,
        updateTime: db.serverDate()
      }
      if (existing) {
        await db.collection('food_trials').doc(existing._id).update({ data: payload })
        return { success: true, data: { ...existing, ...payload } }
      }
      await db.collection('food_trials').doc(documentId).set({ data: { ...payload, createTime: db.serverDate() } })
      return { success: true, data: { _id: documentId, ...payload } }
    }

    if (action === 'undoLog') {
      if (!date) return { success: false, error: 'date required' }
      const nextState = getUndoTrialState(existing, date)
      if (!nextState) return { success: false, error: '只能撤销今天的试吃记录' }
      if (nextState.action === 'remove') {
        await db.collection('food_trials').doc(existing._id).remove()
      } else {
        await db.collection('food_trials').doc(existing._id).update({
          data: { ...nextState, updateTime: db.serverDate() }
        })
      }
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
