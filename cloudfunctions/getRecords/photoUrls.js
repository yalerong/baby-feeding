async function getRecordPhotoUrls(cloud, records) {
  const fileIDs = new Set()
  records.forEach(record => {
    ;(Array.isArray(record.images) ? record.images : []).forEach(fileID => {
      // 只签本应用实际上传的照片目录，避免记录里混入其他私有文件的 ID。
      if (typeof fileID === 'string' && /^cloud:\/\/[^/?#]+\/feeding-photos\/\d+-[a-z0-9]{0,6}\.jpg$/.test(fileID)) fileIDs.add(fileID)
    })
  })

  const ids = Array.from(fileIDs)
  const imageUrls = {}
  for (let offset = 0; offset < ids.length; offset += 50) {
    const batch = ids.slice(offset, offset + 50)
    const result = await cloud.getTempFileURL({ fileList: batch.map(fileID => ({ fileID, maxAge: 600 })) })
    ;(result.fileList || []).forEach(file => {
      if (file.status === 0 && batch.includes(file.fileID) &&
          typeof file.tempFileURL === 'string' && file.tempFileURL.startsWith('https://')) {
        imageUrls[file.fileID] = file.tempFileURL
      }
    })
  }
  return imageUrls
}

module.exports = { getRecordPhotoUrls }
