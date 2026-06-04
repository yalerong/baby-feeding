const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

exports.main = async (event) => {
  const { action, familyCode, date, name, taken } = event
  const { OPENID } = cloud.getWXContext()

  if (!familyCode || !date || !name) {
    return { success: false, error: 'familyCode/date/name required' }
  }

  try {
    if (action === 'get') {
      const res = await db.collection('supplement_records')
        .where({ familyCode, date, name })
        .count()
        .catch(() => ({ total: 0 }))
      return { success: true, taken: res.total > 0 }
    }

    if (action === 'set') {
      await db.createCollection('supplement_records').catch(() => {})
      const existing = await db.collection('supplement_records')
        .where({ familyCode, date, name })
        .get()
      const list = existing.data || []
      if (taken) {
        if (list.length === 0) {
          await db.collection('supplement_records').add({
            data: {
              familyCode,
              date,
              name,
              createBy: OPENID || '',
              createTime: db.serverDate()
            }
          })
        }
        return { success: true, taken: true }
      }
      await Promise.all(
        list.map(r => db.collection('supplement_records').doc(r._id).remove())
      )
      return { success: true, taken: false }
    }

    return { success: false, error: 'unknown action' }
  } catch (err) {
    console.error(err)
    return { success: false, error: err.message }
  }
}
