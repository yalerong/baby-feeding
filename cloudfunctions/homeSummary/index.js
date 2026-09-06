const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command
const { fetchAllRecords } = require('./fetchAll.js')
const { getReviewDocumentId } = require('./reviewId.js')

// 首页启动聚合接口：一次返回当天记录、昨日回顾、补剂状态、近 10 天建议原始记录，
// 避免启动时打多个云函数各付一次冷启动。各分块查询口径与
// getRecords / dailyReview / supplement 保持一致。

async function fetchDayRecords(familyCode, date) {
  const records = await fetchAllRecords(db.collection('feeding_records'), { familyCode, date })
  const prevRes = await db.collection('feeding_records')
    .where({ familyCode, date: _.lt(date), total: _.gt(0) })
    .orderBy('date', 'desc')
    .orderBy('time', 'desc')
    .limit(1)
    .get()
  return { records, prevFeeding: (prevRes.data && prevRes.data[0]) || null }
}

async function fetchReview(familyCode, reviewDate) {
  if (!reviewDate) return null
  const doc = await db.collection('daily_reviews').doc(getReviewDocumentId(familyCode, reviewDate)).get().catch(() => null)
  const confirmed = !!(doc && doc.data && doc.data.confirmed)
  if (confirmed) return { date: reviewDate, confirmed: true, records: [] }
  const records = await fetchAllRecords(db.collection('feeding_records'), { familyCode, date: reviewDate })
  return { date: reviewDate, confirmed: false, records }
}

async function fetchSupplementTaken(familyCode, date, name) {
  if (!name) return null
  const res = await db.collection('supplement_records')
    .where({ familyCode, date, name })
    .count()
    .catch(() => ({ total: 0 }))
  return res.total > 0
}

function fetchRecommendationRecords(familyCode, recommendation) {
  if (!recommendation || !recommendation.startDate || !recommendation.endDateExclusive) return null
  return fetchAllRecords(db.collection('feeding_records'), {
    familyCode,
    date: _.gte(recommendation.startDate).and(_.lt(recommendation.endDateExclusive))
  })
}

exports.main = async event => {
  const { familyCode, date, reviewDate, supplementName, recommendation } = event
  if (!familyCode || !date) return { success: false, error: 'familyCode/date required' }

  try {
    const [day, review, supplementTaken, recommendationRecords] = await Promise.all([
      fetchDayRecords(familyCode, date),
      fetchReview(familyCode, reviewDate),
      fetchSupplementTaken(familyCode, date, supplementName),
      fetchRecommendationRecords(familyCode, recommendation)
    ])
    return {
      success: true,
      records: day.records,
      prevFeeding: day.prevFeeding,
      review,
      supplementTaken,
      recommendationRecords
    }
  } catch (err) {
    console.error(err)
    return { success: false, error: err.message }
  }
}
