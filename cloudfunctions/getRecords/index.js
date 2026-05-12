const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

exports.main = async (event, context) => {
  const { familyCode, date, _id } = event

  try {
    const conditions = { familyCode }
    if (_id) {
      conditions._id = _id
    } else if (date) {
      conditions.date = date
    }

    const res = await db.collection('feeding_records').where(conditions).orderBy('time', 'asc').get()
    return { success: true, data: res.data }
  } catch (err) {
    console.error(err)
    return { success: false, error: err.message, data: [] }
  }
}
