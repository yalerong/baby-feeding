const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

exports.main = async (event, context) => {
  const { fromYear = '2025', toYear = '2026' } = event

  try {
    // 查出所有 date 以 fromYear 开头的记录
    const res = await db.collection('feeding_records')
      .where({
        date: db.RegExp({ regexp: '^' + fromYear, options: 'i' })
      })
      .limit(500)
      .get()

    const list = res.data || []
    if (list.length === 0) {
      return { success: true, message: `没有找到 ${fromYear} 年的记录`, updated: 0 }
    }

    const batchSize = 100
    let updated = 0
    for (let i = 0; i < list.length; i += batchSize) {
      const batch = list.slice(i, i + batchSize)
      const tasks = batch.map(item => {
        const newDate = item.date.replace(fromYear, toYear)
        return db.collection('feeding_records').doc(item._id).update({
          data: { date: newDate }
        })
      })
      await Promise.all(tasks)
      updated += batch.length
    }

    return { success: true, message: `已将 ${updated} 条记录从 ${fromYear} 年改为 ${toYear} 年`, updated }
  } catch (err) {
    console.error(err)
    return { success: false, error: err.message }
  }
}
