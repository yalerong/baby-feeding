const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

exports.main = async (event) => {
  const { _id, familyCode } = event

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

    await db.collection('feeding_records').doc(_id).remove()
    return { success: true }
  } catch (err) {
    console.error(err)
    return { success: false, error: err.message }
  }
}
