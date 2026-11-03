const dateUtil = require('../../utils/date.js')
const pageSnapshot = require('../../utils/pageSnapshot.js')
const todayStr = dateUtil.todayStr

Page({
  data: {
    isEdit: false,
    _id: '',
    date: '',
    weight: '',
    height: '',
    note: '',
    today: '',
    loading: false,
    saving: false
  },

  onLoad(options = {}) {
    this._editActive = true
    this._editUnloaded = false
    this._editFamilyCode = wx.getStorageSync('familyCode') || 'FAMILY'
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

  onShow() {
    this._editActive = true
    if (this._completedMutation) this.finishMutation(this._completedMutation.familyCode, this._completedMutation.title)
  },

  onHide() {
    this._editActive = false
    if (this._navigateTimer) clearTimeout(this._navigateTimer)
    this._navigateTimer = null
    if (this.data.saving || this.data.loading) wx.hideLoading()
  },

  onUnload() {
    this._editUnloaded = true
    this.onHide()
  },

  isCurrentEdit(familyCode) {
    return !this._editUnloaded && this._editActive !== false &&
      (wx.getStorageSync('familyCode') || 'FAMILY') === familyCode &&
      (!this._editFamilyCode || this._editFamilyCode === familyCode)
  },

  finishMutation(familyCode, title) {
    this._completedMutation = { familyCode, title }
    if (!this.isCurrentEdit(familyCode)) return
    wx.hideLoading()
    wx.showToast({ title, icon: 'success' })
    this._navigateTimer = setTimeout(() => {
      this._navigateTimer = null
      if (this.isCurrentEdit(familyCode)) wx.navigateBack()
    }, 800)
  },

  loadRecord(_id) {
    this._recordLoaded = false
    const version = this._loadVersion = (this._loadVersion || 0) + 1
    this.setData({ loading: true })
    wx.showLoading({ title: '加载中...', mask: true })
    const familyCode = wx.getStorageSync('familyCode') || 'FAMILY'
    const current = () => !this._editUnloaded && this._loadVersion === version && this.data._id === _id &&
      (wx.getStorageSync('familyCode') || 'FAMILY') === familyCode
    return wx.cloud.callFunction({
      name: 'growthRecord',
      data: { action: 'get', familyCode, _id }
    })
      .then(res => {
        if (!current()) return
        if (this.isCurrentEdit(familyCode)) wx.hideLoading()
        if (!res.result || !res.result.success) {
          throw new Error(res.result && res.result.error)
        }
        const r = res.result.data
        this.setData({
          loading: false,
          date: r.date,
          weight: r.weight > 0 ? String(r.weight) : '',
          height: r.height > 0 ? String(r.height) : '',
          note: r.note || ''
        })
        this._recordLoaded = true
      })
      .catch(err => {
        if (!current()) return
        this.setData({ loading: false })
        if (!this.isCurrentEdit(familyCode)) return
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
    if (this.data.loading || this.data.saving || this._editUnloaded) return
    const familyCode = wx.getStorageSync('familyCode') || 'FAMILY'
    if (!this.isCurrentEdit(familyCode)) return
    if (this.data.isEdit && this._recordLoaded === false) {
      wx.showToast({ title: '请先加载完整记录', icon: 'none' })
      return
    }
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

    this.setData({ saving: true })
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
        .then(res => {
          if (!res.result || !res.result.success) throw new Error((res.result && res.result.error) || 'update failed')
          pageSnapshot.invalidate('growth')
          this.finishMutation(familyCode, '修改成功')
        })
        .catch(err => {
          if (!this._editUnloaded) this.setData({ saving: false })
          if (!this.isCurrentEdit(familyCode)) return
          wx.hideLoading()
          console.error('修改记录失败：', err)
          wx.showToast({ title: '修改失败', icon: 'none' })
        })
    } else {
      wx.cloud.callFunction({
        name: 'growthRecord',
        data: { action: 'add', familyCode, data: payload }
      })
        .then(res => {
          if (!res.result || !res.result.success) throw new Error((res.result && res.result.error) || 'add failed')
          pageSnapshot.invalidate('growth')
          this.finishMutation(familyCode, '保存成功')
        })
        .catch(err => {
          if (!this._editUnloaded) this.setData({ saving: false })
          if (!this.isCurrentEdit(familyCode)) return
          wx.hideLoading()
          console.error('保存记录失败：', err)
          wx.showToast({ title: '保存失败', icon: 'none' })
        })
    }
  },

  deleteRecord() {
    if (!this.data.isEdit || !this.data._id || this.data.saving || this._recordLoaded === false) return
    const familyCode = wx.getStorageSync('familyCode') || 'FAMILY'
    if (!this.isCurrentEdit(familyCode)) return
    wx.showModal({
      title: '确认删除',
      content: '删除后无法恢复，确定吗？',
      confirmColor: '#ff4d4f',
      success: (res) => {
        if (res.confirm) {
          if (this.data.saving || !this.isCurrentEdit(familyCode)) return
          this.setData({ saving: true })
          wx.showLoading({ title: '删除中...', mask: true })
          wx.cloud.callFunction({
            name: 'growthRecord',
            data: { action: 'remove', familyCode, _id: this.data._id }
          })
            .then(res => {
              if (!res.result || !res.result.success) throw new Error((res.result && res.result.error) || 'remove failed')
              pageSnapshot.invalidate('growth')
              this.finishMutation(familyCode, '已删除')
            })
            .catch(() => {
              if (!this._editUnloaded) this.setData({ saving: false })
              if (!this.isCurrentEdit(familyCode)) return
              wx.hideLoading()
              wx.showToast({ title: '删除失败', icon: 'none' })
            })
        }
      }
    })
  }
})
