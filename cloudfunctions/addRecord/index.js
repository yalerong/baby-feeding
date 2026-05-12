const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

exports.main = async (event, context) => {
  const { familyCode, date, time, breastMilk, formula, total, stool, stoolDesc } = event

  try {
    const res = await db.collection('feeding_records').add({
      data: {
        familyCode,
        date,
        time,
        breastMilk: Number(breastMilk) || 0,
        formula: Number(formula) || 0,
        total: Number(total) || 0,
        stool: Boolean(stool),
        stoolDesc: stoolDesc || '',
        createTime: db.serverDate()
      }
    })
    return { success: true, _id: res._id }
  } catch (err) {
    console.error(err)
    return { success: false, error: err.message }
  }
}
