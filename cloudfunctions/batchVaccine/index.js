const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const maintenance = require('./maintenance.js')
const crypto = require('crypto')

const MAX_ITEMS = 200

function vaccineKey(record) {
  return JSON.stringify([record.vaccineName, record.category || '', Number(record.dose) || 1])
}

async function getOwnedRecord(_id, familyCode) {
  const existing = await db.collection('vaccine_records').doc(_id).get().catch(() => null)
  if (!existing || !existing.data) {
    return { error: 'record not found' }
  }
  if (existing.data.familyCode !== familyCode) {
    return { error: 'familyCode mismatch' }
  }
  return { record: existing.data }
}

exports.main = async (event) => {
  const { action, familyCode, records, _id, record, data } = event
  const { OPENID } = cloud.getWXContext()

  if (!familyCode) {
    return { success: false, error: 'familyCode required' }
  }

  try {
    if (action === 'init') {
      if (!Array.isArray(records) || records.length === 0) {
        return { success: false, error: 'records required' }
      }
      if (records.length > MAX_ITEMS) {
        return { success: false, error: `too many records (max ${MAX_ITEMS})` }
      }
      const now = db.serverDate()
      const docs = records.map(r => ({
        familyCode,
        vaccineName: r.vaccineName,
        category: r.category,
        dose: Number(r.dose) || 1,
        plannedDate: r.plannedDate,
        actualDate: r.actualDate || '',
        status: r.status || 'planned',
        isCustomPlanned: Boolean(r.isCustomPlanned),
        note: r.note || '',
        createBy: OPENID || '',
        createTime: now
      }))
      // 保留旧版随机 ID 记录及家长填写的接种信息；新初始化使用固定 ID 抵御双手机并发。
      const existingKeys = new Set()
      for (let offset = 0; ; offset += MAX_ITEMS) {
        const page = await db.collection('vaccine_records').where({ familyCode })
          .orderBy('_id', 'asc').skip(offset).limit(MAX_ITEMS).get()
        ;(page.data || []).forEach(item => existingKeys.add(vaccineKey(item)))
        if (!page.data || page.data.length < MAX_ITEMS) break
      }
      const results = await Promise.all(docs.map(async item => {
        const key = vaccineKey(item)
        if (existingKeys.has(key)) return false
        const documentId = 'vaccine-' + crypto.createHash('sha256').update(JSON.stringify([familyCode, key])).digest('hex')
        try {
          await db.collection('vaccine_records').add({ data: { _id: documentId, ...item } })
          return true
        } catch (err) {
          const raced = await db.collection('vaccine_records').doc(documentId).get().catch(() => null)
          if (raced && raced.data && raced.data.familyCode === familyCode && vaccineKey(raced.data) === key) return false
          throw err
        }
      }))
      return { success: true, count: results.filter(Boolean).length }
    }

    if (action === 'clear') {
      const count = await maintenance.removeAllForFamily(db.collection('vaccine_records'), familyCode, MAX_ITEMS)
      return { success: true, count }
    }

    if (action === 'list') {
      const res = await db.collection('vaccine_records')
        .where({ familyCode })
        .orderBy('plannedDate', 'asc')
        .limit(MAX_ITEMS)
        .get()
      return { success: true, data: res.data }
    }

    if (action === 'get') {
      if (!_id) return { success: false, error: '_id required' }
      const owned = await getOwnedRecord(_id, familyCode)
      if (owned.error) return { success: false, error: owned.error }
      return { success: true, data: owned.record }
    }

    if (action === 'add') {
      if (!record || !record.vaccineName || !record.plannedDate) {
        return { success: false, error: 'record required' }
      }
      const res = await db.collection('vaccine_records').add({
        data: {
          familyCode,
          vaccineName: record.vaccineName,
          category: record.category || '自定义',
          dose: Number(record.dose) || 1,
          plannedDate: record.plannedDate,
          actualDate: record.actualDate || '',
          status: record.status || 'planned',
          isCustomPlanned: Boolean(record.isCustomPlanned),
          note: record.note || '',
          createBy: OPENID || '',
          createTime: db.serverDate(),
          updateTime: db.serverDate()
        }
      })
      return { success: true, _id: res._id }
    }

    if (action === 'update') {
      if (!_id || !data) return { success: false, error: '_id/data required' }
      const owned = await getOwnedRecord(_id, familyCode)
      if (owned.error) return { success: false, error: owned.error }

      const payload = {
        updateBy: OPENID || '',
        updateTime: db.serverDate()
      }
      const allowed = ['plannedDate', 'actualDate', 'status', 'note', 'isCustomPlanned']
      allowed.forEach(k => {
        if (data[k] !== undefined) payload[k] = data[k]
      })
      if (owned.record.category === '自定义') {
        if (data.vaccineName !== undefined) {
          if (typeof data.vaccineName !== 'string' || !data.vaccineName.trim()) return { success: false, error: 'vaccineName required' }
          payload.vaccineName = data.vaccineName.trim()
        }
        if (data.dose !== undefined) {
          const dose = Number(data.dose)
          if (!Number.isInteger(dose) || dose < 1) return { success: false, error: 'positive integer dose required' }
          payload.dose = dose
        }
      }
      await db.collection('vaccine_records').doc(_id).update({ data: payload })
      return { success: true }
    }

    if (action === 'remove') {
      if (!_id) return { success: false, error: '_id required' }
      const owned = await getOwnedRecord(_id, familyCode)
      if (owned.error) return { success: false, error: owned.error }
      await db.collection('vaccine_records').doc(_id).remove()
      return { success: true }
    }

    return { success: false, error: 'unknown action' }
  } catch (err) {
    console.error(err)
    return { success: false, error: err.message }
  }
}
