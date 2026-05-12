const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

exports.main = async (event, context) => {
  try {
    // 查出所有 familyCode 不是 FAMILY 的记录
    const res = await db.collection('feeding_records').where({
      familyCode: _.neq('FAMILY')
    }).limit(500).get()

    const list = res.data || []
    if (list.length === 0) {
      return { success: true, message: '无需修复，所有记录已是 FAMILY', updated: 0 }
    }

    // 批量更新（云函数一次最多 100 个并发，分批次）
    const batchSize = 100
    let updated = 0
    for (let i = 0; i < list.length; i += batchSize) {
      const batch = list.slice(i, i + batchSize)
      const tasks = batch.map(item => {
        return db.collection('feeding_records').doc(item._id).update({
          data: { familyCode: 'FAMILY' }
        })
      })
      await Promise.all(tasks)
      updated += batch.length
    }

    return { success: true, message: `已修复 ${updated} 条记录`, updated }
  } catch (err) {
    console.error(err)
    return { success: false, error: err.message }
  }
}
