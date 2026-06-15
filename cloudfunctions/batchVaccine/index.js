const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const maintenance = require('./maintenance.js')

const MAX_ITEMS = 200

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
      const results = await Promise.all(
        docs.map(d => db.collection('vaccine_records').add({ data: d }))
      )
      return { success: true, count: results.length }
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
