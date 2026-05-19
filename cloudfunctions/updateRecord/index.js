const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

exports.main = async (event) => {
  const { _id, familyCode, date, time, breastMilk, formula, total, stool, stoolDesc } = event
  const { OPENID } = cloud.getWXContext()

  if (!_id || !familyCode) {
    return { success: false, error: '_id/familyCode required' }
  }

  try {
    const existing = await db.collection('feeding_records').doc(_id).get().catch(() => null)
    if (!existing || !existing.data) {
      return { success: false, error: 'record not found' }
    }
    if (existing.data.familyCode !== familyCode) {
      return { success: false, error: 'familyCode mismatch' }
    }

    const res = await db.collection('feeding_records').doc(_id).update({
      data: {
        date,
        time,
        breastMilk: Number(breastMilk) || 0,
        formula: Number(formula) || 0,
        total: Number(total) || 0,
        stool: Boolean(stool),
        stoolDesc: stoolDesc || '',
        updateBy: OPENID || '',
        updateTime: db.serverDate()
      }
    })
    return { success: true, stats: res.stats }
  } catch (err) {
    console.error(err)
    return { success: false, error: err.message }
  }
}
