const { todayStr, nowTimeStr } = require('../../utils/date.js')

Page({
  data: {
    isEdit: false,
    _id: '',
    date: '',
    time: '',
    breastMilk: '',
    formula: '',
    stool: false,
    stoolDesc: '',
    total: 0,
    stoolTextures: ['稀', '稠'],
    stoolColors: ['黄', '非黄色'],
    stoolAmounts: ['少', '中', '多'],
    stoolTextureIndex: -1,
    stoolColorIndex: -1,
    stoolAmountIndex: -1
  },

  onLoad(options) {
    if (options.id) {
      const id = decodeURIComponent(options.id)
      wx.setNavigationBarTitle({ title: '编辑记录' })
      this.setData({ isEdit: true, _id: id })
      this.loadRecord(id)
    } else {
      wx.setNavigationBarTitle({ title: '添加记录' })
      this.setData({
        date: todayStr(),
        time: nowTimeStr()
      })
    }
  },

  loadRecord(_id) {
    const familyCode = wx.getStorageSync('familyCode')
    wx.showLoading({ title: '加载中...' })
    wx.cloud.callFunction({
      name: 'getRecords',
      data: { familyCode, _id }
    }).then(res => {
      wx.hideLoading()
      const list = res.result.data || []
      if (list.length > 0) {
        const r = list[0]
        const stoolDesc = r.stoolDesc || ''
        let stoolTextureIndex = -1
        let stoolColorIndex = -1
        let stoolAmountIndex = -1
        if (stoolDesc) {
          const parts = stoolDesc.split(/[,，\-、\s]+/).filter(Boolean)
          if (parts[0]) stoolTextureIndex = this.data.stoolTextures.indexOf(parts[0])
          if (parts[1]) stoolColorIndex = this.data.stoolColors.indexOf(parts[1])
          if (parts[2]) stoolAmountIndex = this.data.stoolAmounts.indexOf(parts[2])
        }
        this.setData({
          date: r.date,
          time: r.time,
          breastMilk: r.breastMilk > 0 ? String(r.breastMilk) : '',
          formula: r.formula > 0 ? String(r.formula) : '',
          stool: r.stool,
          stoolDesc,
          stoolTextureIndex,
          stoolColorIndex,
          stoolAmountIndex,
          total: r.total || 0
        })
      }
    }).catch(err => {
      wx.hideLoading()
      wx.showToast({ title: '加载失败', icon: 'none' })
    })
  },

  bindDateChange(e) {
    this.setData({ date: e.detail.value })
  },

  bindTimeChange(e) {
    this.setData({ time: e.detail.value })
  },

  bindBreastInput(e) {
    const val = parseFloat(e.detail.value) || 0
    this.setData({
      breastMilk: e.detail.value,
      total: val + (parseFloat(this.data.formula) || 0)
    })
  },

  bindFormulaInput(e) {
    const val = parseFloat(e.detail.value) || 0
    this.setData({
      formula: e.detail.value,
      total: (parseFloat(this.data.breastMilk) || 0) + val
    })
  },

  bindStoolChange(e) {
    this.setData({ stool: e.detail.value })
  },

  bindStoolTextureChange(e) {
    this.setData({ stoolTextureIndex: parseInt(e.detail.value) })
  },

  bindStoolColorChange(e) {
    this.setData({ stoolColorIndex: parseInt(e.detail.value) })
  },

  bindStoolAmountChange(e) {
    this.setData({ stoolAmountIndex: parseInt(e.detail.value) })
  },

  buildStoolDesc() {
    const texture = this.data.stoolTextures[this.data.stoolTextureIndex] || ''
    const color = this.data.stoolColors[this.data.stoolColorIndex] || ''
    const amount = this.data.stoolAmounts[this.data.stoolAmountIndex] || ''
    const parts = [texture, color, amount].filter(Boolean)
    return parts.join('，')
  },

  submit() {
    const familyCode = wx.getStorageSync('familyCode')
    if (!familyCode) {
      wx.showToast({ title: '缺少家庭码', icon: 'none' })
      return
    }

    const breast = parseFloat(this.data.breastMilk) || 0
    const formula = parseFloat(this.data.formula) || 0

    if (breast === 0 && formula === 0 && !this.data.stool) {
      wx.showToast({ title: '请至少填写母乳、奶粉或大便', icon: 'none' })
      return
    }

    wx.showLoading({ title: '保存中...', mask: true })

    const payload = {
      familyCode,
      date: this.data.date,
      time: this.data.time,
      breastMilk: breast,
      formula: formula,
      total: breast + formula,
      stool: this.data.stool,
      stoolDesc: this.data.stool ? this.buildStoolDesc() : ''
    }

    if (this.data.isEdit) {
      payload._id = this.data._id
      wx.cloud.callFunction({
        name: 'updateRecord',
        data: payload
      }).then(res => {
        wx.hideLoading()
        if (res.result && res.result.success) {
          wx.showToast({ title: '修改成功', icon: 'success' })
          setTimeout(() => wx.navigateBack(), 800)
        } else {
          wx.showToast({ title: '修改失败', icon: 'none' })
        }
      }).catch(err => {
        wx.hideLoading()
        wx.showToast({ title: '修改失败', icon: 'none' })
      })
    } else {
      wx.cloud.callFunction({
        name: 'addRecord',
        data: payload
      }).then(res => {
        wx.hideLoading()
        if (res.result && res.result.success) {
          wx.showToast({ title: '保存成功', icon: 'success' })
          setTimeout(() => wx.navigateBack(), 800)
        } else {
          wx.showToast({ title: '保存失败', icon: 'none' })
        }
      }).catch(err => {
        wx.hideLoading()
        wx.showToast({ title: '保存失败', icon: 'none' })
      })
    }
  },

  deleteRecord() {
    if (!this.data.isEdit || !this.data._id) return

    wx.showModal({
      title: '确认删除',
      content: '删除后无法恢复，确定吗？',
      confirmColor: '#ff4d4f',
      success: (res) => {
        if (res.confirm) {
          wx.showLoading({ title: '删除中...', mask: true })
          wx.cloud.callFunction({
            name: 'deleteRecord',
            data: { _id: this.data._id, familyCode: wx.getStorageSync('familyCode') }
          }).then(() => {
            wx.hideLoading()
            wx.showToast({ title: '已删除', icon: 'success' })
            setTimeout(() => wx.navigateBack(), 800)
          }).catch(err => {
            wx.hideLoading()
            wx.showToast({ title: '删除失败', icon: 'none' })
          })
        }
      }
    })
  },

  goBack() {
    wx.navigateBack()
  }
})
