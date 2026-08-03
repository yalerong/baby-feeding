const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

async function getOwnedRecord(_id, familyCode) {
  const existing = await db.collection('growth_records').doc(_id).get().catch(() => null)
  if (!existing || !existing.data) {
    return { error: 'record not found' }
  }
  if (existing.data.familyCode !== familyCode) {
    return { error: 'familyCode mismatch' }
  }
  return { record: existing.data }
}

exports.main = async (event) => {
  const { action, familyCode, _id, data } = event
  const { OPENID } = cloud.getWXContext()

  if (!familyCode) {
    return { success: false, error: 'familyCode required' }
  }

  try {
    if (action === 'get') {
      if (!_id) return { success: false, error: '_id required' }
      const owned = await getOwnedRecord(_id, familyCode)
      if (owned.error) return { success: false, error: owned.error }
      return { success: true, data: owned.record }
    }

    if (action === 'add') {
      if (!data || !data.date) return { success: false, error: 'data.date required' }
      const payload = {
        familyCode,
        date: data.date,
        note: data.note || '',
        createBy: OPENID || '',
        createTime: db.serverDate()
      }
      if (data.weight !== undefined) payload.weight = data.weight
      if (data.height !== undefined) payload.height = data.height
      const res = await db.collection('growth_records').add({ data: payload })
      return { success: true, _id: res._id }
    }

    if (action === 'update') {
      if (!_id || !data) return { success: false, error: '_id/data required' }
      const owned = await getOwnedRecord(_id, familyCode)
      if (owned.error) return { success: false, error: owned.error }
      const payload = {
        familyCode,
        date: data.date,
        note: data.note || '',
        updateBy: OPENID || '',
        updateTime: db.serverDate()
      }
      if (data.weight !== undefined) payload.weight = data.weight === null ? db.command.remove() : data.weight
      if (data.height !== undefined) payload.height = data.height === null ? db.command.remove() : data.height
      await db.collection('growth_records').doc(_id).update({ data: payload })
      return { success: true }
    }

    if (action === 'remove') {
      if (!_id) return { success: false, error: '_id required' }
      const owned = await getOwnedRecord(_id, familyCode)
      if (owned.error) return { success: false, error: owned.error }
      await db.collection('growth_records').doc(_id).remove()
      return { success: true }
    }

    return { success: false, error: 'unknown action' }
  } catch (err) {
    console.error(err)
    return { success: false, error: err.message }
  }
}
