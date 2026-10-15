const cloud = require('wx-server-sdk')
const crypto = require('crypto')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

// 与 CDC 6/9 个月清单对应；只接收已收录的项目，数字 id 保持稳定。
const ITEM_COUNTS = {
  6: { social: 3, language: 3, cognitive: 3, motor: 3 },
  9: { social: 5, language: 2, cognitive: 2, motor: 4 }
}

function validMilestoneId(value) {
  if (typeof value !== 'string') return false
  const match = value.match(/^(6|9)-(social|language|cognitive|motor)-([1-5])$/)
  return !!match && Number(match[3]) <= ITEM_COUNTS[match[1]][match[2]]
}

function validDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const parsed = new Date(value + 'T00:00:00.000Z')
  const today = new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10)
  return !isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value && value <= today
}

exports.main = async (event) => {
  const { action, familyCode, milestoneId, status, observedDate, note = '' } = event || {}
  if (typeof familyCode !== 'string' || !familyCode.trim()) {
    return { success: false, error: 'familyCode required' }
  }
  if (action !== 'list' && action !== 'set') return { success: false, error: 'unknown action' }
  if (action === 'set') {
    if (!validMilestoneId(milestoneId)) return { success: false, error: 'invalid milestoneId' }
    if (!['yes', 'notYet', 'unsure'].includes(status)) return { success: false, error: 'invalid status' }
    if (!validDate(observedDate)) return { success: false, error: 'invalid observedDate' }
    if (typeof note !== 'string' || note.length > 300) return { success: false, error: 'invalid note' }
  }

  try {
    // 首次使用创建集合；若已存在则继续，实际读写错误仍由下面的操作返回。
    await db.createCollection('milestone_records').catch(() => {})
    if (action === 'list') {
      const res = await db.collection('milestone_records').where({ familyCode }).limit(100).get()
      return { success: true, data: res.data || [] }
    }

    const { OPENID } = cloud.getWXContext()
    const id = crypto.createHash('sha256').update(JSON.stringify([familyCode, milestoneId])).digest('hex')
    const record = {
      familyCode, milestoneId, status, observedDate, note: note.trim(),
      updateBy: OPENID || '', updateTime: db.serverDate()
    }
    await db.collection('milestone_records').doc(id).set({ data: record })
    return { success: true, data: { _id: id, ...record } }
  } catch (err) {
    console.error(err)
    return { success: false, error: err.message }
  }
}
