const crypto = require('crypto')
const cloud = require('wx-server-sdk')
const config = require('./config')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

const SUBSCRIBER_ID = 'primary'

function httpResponse(event, statusCode, body) {
  if (!event.httpMethod) return body
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify(body)
  }
}

function requestBody(event) {
  if (!event.httpMethod) return event
  if (event.httpMethod !== 'POST' || !event.body) return null
  try {
    const body = event.isBase64Encoded
      ? Buffer.from(event.body, 'base64').toString('utf8')
      : event.body
    return JSON.parse(body)
  } catch (err) {
    return null
  }
}

function secretMatches(value) {
  const actual = Buffer.from(String(value || ''))
  const expected = Buffer.from(String(config.webhookSecret || ''))
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected)
}

function messageData(score) {
  const detectedAt = new Date().toLocaleString('zh-CN', { hour12: false, timeZone: 'Asia/Shanghai' })
  return Object.fromEntries(Object.entries(config.templateFields || {}).map(([key, value]) => [key, {
    value: String(value)
      .replace('{{detectedAt}}', detectedAt)
      .replace('{{score}}', score)
  }]))
}

exports.main = async (event) => {
  const body = requestBody(event)
  if (!body || !secretMatches(body.secret)) {
    return httpResponse(event, 401, { success: false, error: 'UNAUTHORIZED' })
  }

  const subscriberRef = db.collection('cry_alert_subscribers').doc(SUBSCRIBER_ID)
  const subscriberResult = await subscriberRef.get().catch(err => {
    if (err && err.errCode === -1) return { data: null }
    throw err
  })
  const subscriber = subscriberResult.data
  if (!subscriber || subscriber.remainingQuota < 1) {
    return httpResponse(event, 409, { success: false, error: 'NO_SUBSCRIPTION_QUOTA' })
  }

  const now = Date.now()
  const lastSentAt = subscriber.lastSentAt ? new Date(subscriber.lastSentAt).getTime() : 0
  if (lastSentAt && now - lastSentAt < (config.cooldownSeconds || 300) * 1000) {
    return httpResponse(event, 202, { success: true, skipped: 'COOLDOWN' })
  }

  const score = String(body.score || 'unknown').slice(0, 20)
  try {
    await cloud.openapi.subscribeMessage.send({
      touser: subscriber.openid,
      templateId: config.templateId,
      page: 'pages/index/index',
      data: messageData(score),
      miniprogramState: config.miniprogramState || 'developer',
      lang: 'zh_CN'
    })
    await subscriberRef.update({
      data: {
        remainingQuota: db.command.inc(-1),
        lastSentAt: db.serverDate()
      }
    })
    return httpResponse(event, 200, { success: true })
  } catch (err) {
    console.error('cry alert delivery failed', err)
    return httpResponse(event, 502, {
      success: false,
      error: 'SEND_FAILED',
      errcode: err.errCode,
      errmsg: err.errMsg
    })
  }
}
