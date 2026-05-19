const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

const MAX_ITEMS = 200

exports.main = async (event) => {
  const { familyCode, records } = event
  const { OPENID } = cloud.getWXContext()

  if (!familyCode) {
    return { success: false, error: 'familyCode required' }
  }
  if (!Array.isArray(records) || records.length === 0) {
    return { success: false, error: 'records required' }
  }
  if (records.length > MAX_ITEMS) {
    return { success: false, error: `too many records (max ${MAX_ITEMS})` }
  }

  const now = db.serverDate()
  const docs = records.map(r => ({
    familyCode,
    date: r.date,
    time: r.time,
    breastMilk: Number(r.breastMilk) || 0,
    formula: Number(r.formula) || 0,
    total: Number(r.total) || (Number(r.breastMilk) || 0) + (Number(r.formula) || 0),
    stool: Boolean(r.stool),
    stoolDesc: r.stoolDesc || '',
    createBy: OPENID || '',
    createTime: now
  }))

  try {
    const results = await Promise.all(
      docs.map(d => db.collection('feeding_records').add({ data: d }))
    )
    return { success: true, count: results.length, ids: results.map(r => r._id) }
  } catch (err) {
    console.error(err)
    return { success: false, error: err.message }
  }
}
