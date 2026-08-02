const cloud = require('wx-server-sdk')
const { getReviewDocumentId } = require('./reviewId.js')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

exports.main = async event => {
  const { action, familyCode, date } = event
  if (!familyCode || !date) return { success: false, error: 'familyCode/date required' }

  const documentId = getReviewDocumentId(familyCode, date)
  try {
    if (action === 'get') {
      const result = await db.collection('daily_reviews').doc(documentId).get().catch(() => null)
      return { success: true, confirmed: !!(result && result.data && result.data.confirmed) }
    }
    if (action === 'confirm') {
      const { OPENID } = cloud.getWXContext()
      await db.collection('daily_reviews').doc(documentId).set({
        data: {
          familyCode,
          date,
          confirmed: true,
          confirmedBy: OPENID || '',
          confirmedTime: db.serverDate()
        }
      })
      return { success: true, confirmed: true }
    }
    return { success: false, error: 'unknown action' }
  } catch (err) {
    console.error(err)
    return { success: false, error: err.message }
  }
}
