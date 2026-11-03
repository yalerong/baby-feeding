const cloud = require('wx-server-sdk')
const crypto = require('crypto')
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
        // 保存时的已解锁食材快照，用来判断之后有没有新解锁、要不要提示刷新
        unlockedFoods: Array.isArray(data.unlockedFoods) ? data.unlockedFoods.slice(0, 200) : null,
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
      // 旧菜单沿用原 ID；新周使用固定 ID，避免两台手机首次保存时各建一份。
      const documentId = `menu_${crypto.createHash('sha256').update(JSON.stringify([familyCode, weekStart])).digest('hex')}`
      try {
        await db.collection('weekly_menus').add({
          data: {
            _id: documentId,
            ...payload,
            createBy: OPENID || '',
            createTime: db.serverDate()
          }
        })
      } catch (err) {
        const raced = await db.collection('weekly_menus').where({ _id: documentId, familyCode, weekStart }).limit(1).get()
        if (!raced.data || !raced.data[0]) throw err
        await db.collection('weekly_menus').doc(documentId).update({ data: payload })
      }
      return { success: true, _id: documentId }
    }

    return { success: false, error: 'unknown action' }
  } catch (err) {
    console.error(err)
    return { success: false, error: err.message }
  }
}
