Component({
  properties: {
    initialImages: {
      type: Array,
      value: []
    },
    maxCount: {
      type: Number,
      value: 3
    }
  },

  data: {
    uploading: false,
    imageList: []
  },

  lifetimes: {
    attached() {
      this.setData({
        imageList: this.properties.initialImages.slice(0, this.properties.maxCount)
      })
    }
  },

  observers: {
    initialImages(next) {
      this.setData({
        imageList: (next || []).slice(0, this.properties.maxCount)
      })
    }
  },

  methods: {
    async chooseAndUpload() {
      if (this.data.uploading) return
      const remain = this.properties.maxCount - this.data.imageList.length
      if (remain <= 0) {
        wx.showToast({ title: "最多上传3张", icon: "none" })
        return
      }

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
        for (const file of files) {
          const cloudPath = `feeding-photos/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`
          const uploadRes = await wx.cloud.uploadFile({
            cloudPath,
            filePath: file.tempFilePath
          })
          uploaded.push(uploadRes.fileID)
        }

        const nextList = this.data.imageList.concat(uploaded).slice(0, this.properties.maxCount)
        this.setData({ imageList: nextList })
        this.triggerEvent("change", { images: nextList })
      } catch (err) {
        if (err && err.errMsg && err.errMsg.includes("cancel")) return
        wx.showToast({ title: "上传失败，请重试", icon: "none" })
      } finally {
        wx.hideLoading()
        this.setData({ uploading: false })
      }
    },

    previewImage(e) {
      const url = e.currentTarget.dataset.url
      wx.previewImage({
        current: url,
        urls: this.data.imageList
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
