const dateUtil = require('../../utils/date.js')
const todayStr = dateUtil.todayStr

Page({
  data: {
    isEdit: false,
    _id: '',
    date: '',
    weight: '',
    height: '',
    note: '',
    today: ''
  },

  onLoad(options) {
    const dateStr = todayStr()
    this.setData({ today: dateStr })

    if (options.id) {
      const id = decodeURIComponent(options.id)
      wx.setNavigationBarTitle({ title: '编辑记录' })
      this.setData({ isEdit: true, _id: id })
      this.loadRecord(id)
    } else {
      wx.setNavigationBarTitle({ title: '记录身高体重' })
      this.setData({ date: dateStr })
    }
  },

  loadRecord(_id) {
    wx.showLoading({ title: '加载中...' })
    const familyCode = wx.getStorageSync('familyCode') || 'FAMILY'
    wx.cloud.callFunction({
      name: 'growthRecord',
      data: { action: 'get', familyCode, _id }
    })
      .then(res => {
        wx.hideLoading()
        if (!res.result || !res.result.success) {
          throw new Error(res.result && res.result.error)
        }
        const r = res.result.data
        this.setData({
          date: r.date,
          weight: r.weight > 0 ? String(r.weight) : '',
          height: r.height > 0 ? String(r.height) : '',
          note: r.note || ''
        })
      })
      .catch(err => {
        wx.hideLoading()
        console.error('加载记录失败：', err)
        wx.showToast({ title: '加载失败', icon: 'none' })
      })
  },

  bindDateChange(e) {
    this.setData({ date: e.detail.value })
  },

  bindWeightInput(e) {
    this.setData({ weight: e.detail.value })
  },

  bindHeightInput(e) {
    this.setData({ height: e.detail.value })
  },

  bindNoteInput(e) {
    this.setData({ note: e.detail.value })
  },

  submit() {
    const familyCode = wx.getStorageSync('familyCode') || 'FAMILY'
    const weight = parseFloat(this.data.weight)
    const height = parseFloat(this.data.height)

    if (!this.data.date) {
      wx.showToast({ title: '请选择日期', icon: 'none' })
      return
    }
    const hasWeight = !isNaN(weight) && weight > 0
    const hasHeight = !isNaN(height) && height > 0
    if (!hasWeight && !hasHeight) {
      wx.showToast({ title: '请至少填写体重或身高', icon: 'none' })
      return
    }

    wx.showLoading({ title: '保存中...', mask: true })
    const payload = {
      date: this.data.date,
      note: this.data.note.trim()
    }
    if (this.data.isEdit) {
      // 编辑时显式传 null 表示清空该字段
      payload.weight = hasWeight ? weight : null
      payload.height = hasHeight ? height : null
    } else {
      if (hasWeight) payload.weight = weight
      if (hasHeight) payload.height = height
    }

    if (this.data.isEdit) {
      wx.cloud.callFunction({
        name: 'growthRecord',
        data: { action: 'update', familyCode, _id: this.data._id, data: payload }
      })
        .then(() => {
          wx.hideLoading()
          wx.showToast({ title: '修改成功', icon: 'success' })
          setTimeout(() => wx.navigateBack(), 800)
        })
        .catch(err => {
          wx.hideLoading()
          console.error('修改记录失败：', err)
          wx.showToast({ title: '修改失败', icon: 'none' })
        })
    } else {
      wx.cloud.callFunction({
        name: 'growthRecord',
        data: { action: 'add', familyCode, data: payload }
      })
        .then(() => {
          wx.hideLoading()
          wx.showToast({ title: '保存成功', icon: 'success' })
          setTimeout(() => wx.navigateBack(), 800)
        })
        .catch(err => {
          wx.hideLoading()
          console.error('保存记录失败：', err)
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
          const familyCode = wx.getStorageSync('familyCode') || 'FAMILY'
          wx.cloud.callFunction({
            name: 'growthRecord',
            data: { action: 'remove', familyCode, _id: this.data._id }
          })
            .then(() => {
              wx.hideLoading()
              wx.showToast({ title: '已删除', icon: 'success' })
              setTimeout(() => wx.navigateBack(), 800)
            })
            .catch(() => {
              wx.hideLoading()
              wx.showToast({ title: '删除失败', icon: 'none' })
            })
        }
      }
    })
  }
})
