const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

const MAX_ITEMS = 200

exports.main = async (event) => {
  const { action, familyCode, records } = event
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
      const existing = await db.collection('vaccine_records').where({ familyCode }).get()
      const list = existing.data || []
      await Promise.all(
        list.map(r => db.collection('vaccine_records').doc(r._id).remove())
      )
      return { success: true, count: list.length }
    }

    return { success: false, error: 'unknown action' }
  } catch (err) {
    console.error(err)
    return { success: false, error: err.message }
  }
}
