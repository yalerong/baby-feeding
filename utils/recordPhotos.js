const pageSnapshot = require('./pageSnapshot.js')

const CACHE_MS = 5 * 60 * 1000
const urls = new Map()

function cachedUrl(fileID, familyCode) {
  const key = JSON.stringify([familyCode, fileID])
  const entry = urls.get(key)
  if (entry && entry.expiresAt > Date.now()) return entry.url
  urls.delete(key)
  return ''
}

function displayUrls(images, familyCode) {
  return (Array.isArray(images) ? images : []).map(fileID => cachedUrl(fileID, familyCode) || fileID)
}

async function resolveRecordPhotos(records, familyCode, refresh = false) {
  const list = Array.isArray(records) ? records : []
  const fileIDs = new Set()
  const recordIds = new Set()
  list.forEach(record => {
    let missing = false
    ;(Array.isArray(record.images) ? record.images : []).forEach(fileID => {
      if (typeof fileID !== 'string' || !fileID.startsWith('cloud://')) return
      fileIDs.add(fileID)
      if (refresh) urls.delete(JSON.stringify([familyCode, fileID]))
      if (!cachedUrl(fileID, familyCode)) missing = true
    })
    if (missing && typeof record._id === 'string' && record._id) recordIds.add(record._id)
  })

  if (familyCode && recordIds.size) {
    const ids = Array.from(recordIds).sort()
    const requests = []
    for (let offset = 0; offset < ids.length; offset += 100) {
      const batch = ids.slice(offset, offset + 100)
      const key = pageSnapshot.key({ familyCode, recordIds: batch })
      const requestedAt = Date.now()
      requests.push(pageSnapshot.fetch('recordPhotos', key, () => wx.cloud.callFunction({
        name: 'getRecords',
        data: { action: 'photoUrls', familyCode, recordIds: batch }
      })).then(res => {
        const result = res.result
        if (!result || !result.success || !result.imageUrls || typeof result.imageUrls !== 'object') {
          throw new Error('照片链接加载失败')
        }
        Object.keys(result.imageUrls).forEach(fileID => {
          const url = result.imageUrls[fileID]
          if (fileIDs.has(fileID) && typeof url === 'string' && url.startsWith('https://')) {
            urls.set(JSON.stringify([familyCode, fileID]), { url, expiresAt: requestedAt + CACHE_MS })
          }
        })
      }))
    }
    await Promise.all(requests)
  }

  const result = {}
  fileIDs.forEach(fileID => {
    const url = cachedUrl(fileID, familyCode)
    if (url) result[fileID] = url
  })
  return result
}

module.exports = { displayUrls, resolveRecordPhotos }
