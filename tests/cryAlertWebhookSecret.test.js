const assert = require('assert')
const Module = require('module')
const path = require('path')

const entry = path.resolve(__dirname, '../cloudfunctions/cryAlertWebhook/index.js')
const configPath = path.resolve(__dirname, '../cloudfunctions/cryAlertWebhook/config')

function loadWebhook(webhookSecret) {
  const sent = []
  const cloud = {
    DYNAMIC_CURRENT_ENV: 'test',
    init() {},
    database: () => ({
      command: { inc: n => ({ inc: n }) },
      serverDate: () => new Date(),
      collection: () => ({
        doc: () => ({
          get: async () => ({ data: { openid: 'o1', remainingQuota: 5 } }),
          update: async () => ({})
        })
      })
    }),
    openapi: { subscribeMessage: { send: async msg => { sent.push(msg) } } }
  }
  const originalLoad = Module._load
  Module._load = function (request, parent, isMain) {
    if (request === 'wx-server-sdk') return cloud
    if (request === './config') return { webhookSecret, templateId: 't', templateFields: {} }
    return originalLoad.call(this, request, parent, isMain)
  }
  try {
    delete require.cache[entry]
    delete require.cache[configPath]
    return { main: require(entry).main, sent }
  } finally {
    Module._load = originalLoad
  }
}

async function run() {
  for (const secret of ['', undefined]) {
    const webhook = loadWebhook(secret)
    const result = await webhook.main({ secret: '' })
    assert.strictEqual(result.success, false)
    assert.strictEqual(result.error, 'UNAUTHORIZED')
    assert.strictEqual(webhook.sent.length, 0)
  }
  console.log('ok - rejects every request when the webhook secret is not configured')

  const webhook = loadWebhook('s3cret')
  assert.strictEqual((await webhook.main({ secret: 'wrong' })).error, 'UNAUTHORIZED')
  assert.strictEqual((await webhook.main({ secret: 's3cret' })).success, true)
  assert.strictEqual(webhook.sent.length, 1)
  console.log('ok - accepts only the configured webhook secret')
}

run().catch(err => { console.error(err); process.exit(1) })
