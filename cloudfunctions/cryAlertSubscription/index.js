const cloud = require('wx-server-sdk')
const config = require('./config')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

const SUBSCRIBER_ID = 'primary'

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext()
  const { action, templateId } = event

  if (action !== 'grant' || !OPENID) {
    return { success: false, error: 'INVALID_REQUEST' }
  }
  if (!config.templateId || config.templateId === 'YOUR_CRY_ALERT_TEMPLATE_ID') {
    return { success: false, error: 'TEMPLATE_NOT_CONFIGURED' }
  }
  if (templateId !== config.templateId) {
    return { success: false, error: 'TEMPLATE_MISMATCH' }
  }

  const subscriberRef = db.collection('cry_alert_subscribers').doc(SUBSCRIBER_ID)
  const existing = await subscriberRef.get().catch(err => {
    if (err && err.errCode === -1) return { data: null }
    throw err
  })

  if (existing.data && existing.data.openid !== OPENID) {
    return { success: false, error: 'PRIMARY_SUBSCRIBER_ALREADY_BOUND' }
  }

  if (existing.data) {
    await subscriberRef.update({
      data: {
        remainingQuota: db.command.inc(1),
        grantedAt: db.serverDate()
      }
    })
  } else {
    await subscriberRef.set({
      data: {
        openid: OPENID,
        templateId: config.templateId,
        remainingQuota: 1,
        grantedAt: db.serverDate(),
        lastSentAt: null
      }
    })
  }

  return { success: true }
}
