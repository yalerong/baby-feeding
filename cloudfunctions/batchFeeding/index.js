const cloud = require('wx-server-sdk')
const crypto = require('crypto')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const { normalizeMilk } = require('./milkValidation.js')

const MAX_ITEMS = 100

exports.main = async (event) => {
  const { familyCode, records, requestId } = event
  const { OPENID } = cloud.getWXContext()

  if (!familyCode) {
    return { success: false, error: 'familyCode required' }
  }
  if (!Array.isArray(records) || records.length === 0) {
    return { success: false, error: 'records required' }
  }
  if (records.length > MAX_ITEMS) {
    return { success: false, error: `too many records (max ${MAX_ITEMS})` }
  }
  if (requestId !== undefined && (typeof requestId !== 'string' || !/^[a-zA-Z0-9_-]{8,80}$/.test(requestId))) {
    return { success: false, error: 'valid requestId required' }
  }

  const now = db.serverDate()
  const docs = []
  for (const r of records) {
    if (!r || typeof r !== 'object') return { success: false, error: 'valid records required' }
    const milk = normalizeMilk(r)
    if (!milk) return { success: false, error: 'finite non-negative milk quantities required' }
    docs.push({
      ...(requestId ? { _id: 'feeding_' + crypto.createHash('sha256').update(JSON.stringify([familyCode, requestId, docs.length])).digest('hex') } : {}),
      familyCode,
      date: r.date,
      time: r.time,
      ...milk,
      stool: Boolean(r.stool),
      stoolDesc: r.stoolDesc || '',
      createBy: OPENID || '',
      createTime: now
    })
  }

  try {
    let ids = []
    await db.runTransaction(async transaction => {
      const created = []
      for (const data of docs) {
        const result = await transaction.collection('feeding_records').add({ data })
        created.push(result._id)
      }
      ids = created
    })
    return { success: true, count: ids.length, ids }
  } catch (err) {
    if (requestId) {
      try {
        const saved = await Promise.all(docs.map(doc => db.collection('feeding_records').doc(doc._id).get()))
        const fields = ['familyCode', 'date', 'time', 'breastMilk', 'formula', 'total', 'stool', 'stoolDesc']
        if (saved.every((result, index) => result.data && fields.every(field => result.data[field] === docs[index][field]))) {
          return { success: true, count: docs.length, ids: docs.map(doc => doc._id) }
        }
      } catch (readError) { /* 无法确认整批已提交时，保留原失败结果，重试仍使用相同 ID。 */ }
    }
    console.error(err)
    return { success: false, error: err.message }
  }
}
