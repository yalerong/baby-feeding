const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command
const { fetchAllRecords } = require('./fetchAll.js')
const { getRecordPhotoUrls } = require('./photoUrls.js')

exports.main = async (event) => {
  const { familyCode, date, _id, startDate, endDateExclusive } = event

  if (!familyCode) {
    return { success: false, error: 'familyCode required', data: [] }
  }

  try {
    if (event.action === 'photoUrls') {
      const { recordIds } = event
      if (!Array.isArray(recordIds) || !recordIds.length || recordIds.length > 100 ||
          recordIds.some(id => typeof id !== 'string' || !id.trim())) {
        return { success: false, error: '1-100 recordIds required', data: [] }
      }
      // 只为同一家庭已保存记录里的照片签名，不接受客户端传入的任意 fileID。
      const records = await fetchAllRecords(db.collection('feeding_records'), {
        familyCode,
        _id: _.in(Array.from(new Set(recordIds)))
      })
      const imageUrls = await getRecordPhotoUrls(cloud, records)
      return { success: true, imageUrls }
    }

    const conditions = { familyCode }
    if (_id) {
      conditions._id = _id
    } else if (date) {
      conditions.date = date
    } else if (startDate && endDateExclusive) {
      conditions.date = _.gte(startDate).and(_.lt(endDateExclusive))
    }

    const recordsPromise = fetchAllRecords(db.collection('feeding_records'), conditions)
    const previousPromise = date && !_id
      ? db.collection('feeding_records')
        .where({
          familyCode,
          date: _.lt(date),
          total: _.gt(0)
        })
        .orderBy('date', 'desc')
        .orderBy('time', 'desc')
        .limit(1)
        .get()
      : null
    const [records, prevRes] = await Promise.all([recordsPromise, previousPromise])
    const prevFeeding = (prevRes && prevRes.data && prevRes.data[0]) || null

    return { success: true, data: records, prevFeeding }
  } catch (err) {
    console.error(err)
    return { success: false, error: err.message, data: [] }
  }
}
