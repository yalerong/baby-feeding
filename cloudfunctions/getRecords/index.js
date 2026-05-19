const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

exports.main = async (event) => {
  const { familyCode, date, _id } = event

  if (!familyCode) {
    return { success: false, error: 'familyCode required', data: [] }
  }

  try {
    const conditions = { familyCode }
    if (_id) {
      conditions._id = _id
    } else if (date) {
      conditions.date = date
    }

    const res = await db.collection('feeding_records')
      .where(conditions)
      .orderBy('time', 'asc')
      .limit(200)
      .get()
    return { success: true, data: res.data }
  } catch (err) {
    console.error(err)
    return { success: false, error: err.message, data: [] }
  }
}
