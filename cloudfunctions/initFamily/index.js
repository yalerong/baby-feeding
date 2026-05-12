const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

exports.main = async (event, context) => {
  const { familyCode } = event
  const wxContext = cloud.getWXContext()

  try {
    // 检查是否已存在
    const exist = await db.collection('families').where({ familyCode }).get()
    if (exist.data.length > 0) {
      return { success: true, exists: true, data: exist.data[0] }
    }

    // 新建家庭记录
    const res = await db.collection('families').add({
      data: {
        familyCode,
        members: [wxContext.OPENID],
        createTime: db.serverDate()
      }
    })
    return { success: true, exists: false, _id: res._id }
  } catch (err) {
    console.error(err)
    return { success: false, error: err.message }
  }
}
