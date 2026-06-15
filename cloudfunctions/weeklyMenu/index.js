const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

exports.main = async (event) => {
  const { action, familyCode, weekStart, data } = event
  const { OPENID } = cloud.getWXContext()

  if (!familyCode || !weekStart) {
    return { success: false, error: 'familyCode/weekStart required' }
  }

  try {
    if (action === 'get') {
      const res = await db.collection('weekly_menus')
        .where({ familyCode, weekStart })
        .limit(1)
        .get()
      return { success: true, data: res.data && res.data[0] ? res.data[0] : null }
    }

    if (action === 'save') {
      if (!data || !Array.isArray(data.days)) {
        return { success: false, error: 'menu data required' }
      }
      const payload = {
        familyCode,
        weekStart,
        ageMonth: data.ageMonth,
        stage: data.stage,
        days: data.days,
        nutritionSummary: data.nutritionSummary || {},
        updateBy: OPENID || '',
        updateTime: db.serverDate()
      }
      const existing = await db.collection('weekly_menus')
        .where({ familyCode, weekStart })
        .limit(1)
        .get()
      const saved = existing.data && existing.data[0]
      if (saved) {
        await db.collection('weekly_menus').doc(saved._id).update({ data: payload })
        return { success: true, _id: saved._id }
      }
      const res = await db.collection('weekly_menus').add({
        data: {
          ...payload,
          createBy: OPENID || '',
          createTime: db.serverDate()
        }
      })
      return { success: true, _id: res._id }
    }

    return { success: false, error: 'unknown action' }
  } catch (err) {
    console.error(err)
    return { success: false, error: err.message }
  }
}
