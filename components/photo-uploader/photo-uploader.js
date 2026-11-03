const recordPhotos = require('../../utils/recordPhotos.js')

Component({
  properties: {
    initialImages: {
      type: Array,
      value: []
    },
    recordId: {
      type: String,
      value: ''
    },
    maxCount: {
      type: Number,
      value: 3
    }
  },

  data: {
    uploading: false,
    imageList: [],
    imageUrls: {}
  },

  lifetimes: {
    attached() {
      this._photoActive = true
      this._photoRetryKeys = new Set()
      this.setData({
        imageList: this.properties.initialImages.slice(0, this.properties.maxCount)
      })
      this.loadRecordPhotos()
    },
    detached() {
      this._photoActive = false
      this._photoReadSeq = (this._photoReadSeq || 0) + 1
    }
  },

  pageLifetimes: {
    show() {
      this._photoActive = true
      this._photoRetryKeys = new Set()
      this.loadRecordPhotos()
    },
    hide() {
      this._photoActive = false
      this._photoReadSeq = (this._photoReadSeq || 0) + 1
    }
  },

  observers: {
    'initialImages, recordId'(next) {
      this.setData({
        imageList: (next || []).slice(0, this.properties.maxCount)
      })
      this.loadRecordPhotos()
    }
  },

  methods: {
    loadRecordPhotos(refresh = false) {
      const familyCode = wx.getStorageSync('familyCode') || ''
      const seq = this._photoReadSeq = (this._photoReadSeq || 0) + 1
      return recordPhotos.resolveRecordPhotos([{ _id: this.properties.recordId, images: this.data.imageList }], familyCode, refresh)
        .then(imageUrls => {
          if (this._photoActive === false || this._photoReadSeq !== seq ||
              (wx.getStorageSync('familyCode') || '') !== familyCode) return
          this.setData({ imageUrls })
        }).catch(err => console.error(err))
    },

    onImageError(e) {
      if (this._photoActive === false) return
      const { url } = e.currentTarget.dataset
      if (!this.data.imageList.includes(url)) return
      const key = JSON.stringify([wx.getStorageSync('familyCode') || '', this.properties.recordId, url])
      this._photoRetryKeys = this._photoRetryKeys || new Set()
      if (this._photoRetryKeys.has(key)) return
      this._photoRetryKeys.add(key)
      return this.loadRecordPhotos(true)
    },

    onImageLoad(e) {
      const { url } = e.currentTarget.dataset
      const key = JSON.stringify([wx.getStorageSync('familyCode') || '', this.properties.recordId, url])
      if (this._photoRetryKeys) this._photoRetryKeys.delete(key)
    },

    async chooseAndUpload() {
      if (this._choosing || this.data.uploading) return
      const remain = this.properties.maxCount - this.data.imageList.length
      if (remain <= 0) {
        wx.showToast({ title: "最多上传3张", icon: "none" })
        return
      }

      this._choosing = true
      try {
        const pickRes = await wx.chooseMedia({
          count: remain,
          mediaType: ["image"],
          sizeType: ["compressed"],
          sourceType: ["album", "camera"]
        })

        const files = pickRes.tempFiles || []
        if (!files.length) return

        this.setData({ uploading: true })
        wx.showLoading({ title: "上传中...", mask: true })

        const uploaded = []
        let failed = false
        for (const file of files) {
          try {
            const cloudPath = `feeding-photos/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`
            const uploadRes = await wx.cloud.uploadFile({
              cloudPath,
              filePath: file.tempFilePath
            })
            uploaded.push(uploadRes.fileID)
          } catch (err) {
            failed = true
          }
        }

        if (uploaded.length) {
          const nextList = this.data.imageList.concat(uploaded).slice(0, this.properties.maxCount)
          this.setData({ imageList: nextList })
          this.triggerEvent("change", { images: nextList })
        }
        if (failed) wx.showToast({ title: uploaded.length ? "部分照片上传失败，请重试" : "上传失败，请重试", icon: "none" })
      } catch (err) {
        if (err && err.errMsg && err.errMsg.includes("cancel")) return
        wx.showToast({ title: "上传失败，请重试", icon: "none" })
      } finally {
        this._choosing = false
        wx.hideLoading()
        this.setData({ uploading: false })
      }
    },

    async previewImage(e) {
      const url = e.currentTarget.dataset.url
      const familyCode = wx.getStorageSync('familyCode') || ''
      const recordId = this.properties.recordId
      await this.loadRecordPhotos()
      if (this._photoActive === false || (wx.getStorageSync('familyCode') || '') !== familyCode ||
          this.properties.recordId !== recordId || !this.data.imageList.includes(url)) return
      const images = this.data.imageList
      const display = recordPhotos.displayUrls(images, familyCode)
      wx.previewImage({
        current: display[images.indexOf(url)] || url,
        urls: display,
        fail: () => wx.showToast({ title: '照片加载失败，请稍后重试', icon: 'none' })
      })
    },

    removeImage(e) {
      const index = Number(e.currentTarget.dataset.index)
      const nextList = this.data.imageList.filter((_, i) => i !== index)
      this.setData({ imageList: nextList })
      this.triggerEvent("change", { images: nextList })
    }
  }
})
