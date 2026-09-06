const dateUtil = require('../../utils/date.js')
const feedingAudit = require('../../utils/feedingAudit.js')
const todayStr = dateUtil.todayStr

Page({
  data: {
    date: '',
    rows: [],
    validCount: 0,
    validTotal: 0
  },

  onLoad() {
    const rows = this.createEmptyRows(4)
    this.setData({ date: todayStr(), rows })
    this.loadExistingFeedings(todayStr())
  },

  // 拉当天和前一天已有的喂奶记录，提交时用于重复检查
  loadExistingFeedings(date) {
    const familyCode = wx.getStorageSync('familyCode')
    this._existingFeedings = []
    if (!familyCode || !date) return
    wx.cloud.callFunction({
      name: 'getRecords',
      data: { familyCode, startDate: dateUtil.addDays(date, -1), endDateExclusive: dateUtil.addDays(date, 1) }
    }).then(res => {
      if (this.data.date !== date) return
      this._existingFeedings = feedingAudit.feedingRecords((res.result && res.result.data) || [])
    }).catch(err => console.error(err))
  },

  createEmptyRows(n) {
    const rows = []
    for (let i = 0; i < n; i++) {
      rows.push({ time: '', breastMilk: '', formula: '', stool: false, stoolDesc: '' })
    }
    return rows
  },

  bindDateChange(e) {
    this.setData({ date: e.detail.value })
    this.loadExistingFeedings(e.detail.value)
  },

  addRow() {
    const rows = this.data.rows
    rows.push({ time: '', breastMilk: '', formula: '', stool: false, stoolDesc: '' })
    this.setData({ rows })
    this.calcPreview()
  },

  deleteRow(e) {
    const index = e.currentTarget.dataset.index
    const rows = this.data.rows
    if (rows.length > 1) {
      rows.splice(index, 1)
      this.setData({ rows })
      this.calcPreview()
    }
  },

  bindTimeChange(e) {
    const index = e.currentTarget.dataset.index
    const rows = this.data.rows
    rows[index].time = e.detail.value
    this.setData({ rows })
  },

  bindBreastInput(e) {
    const index = e.currentTarget.dataset.index
    const rows = this.data.rows
    rows[index].breastMilk = e.detail.value
    this.setData({ rows })
    this.calcPreview()
  },

  bindFormulaInput(e) {
    const index = e.currentTarget.dataset.index
    const rows = this.data.rows
    rows[index].formula = e.detail.value
    this.setData({ rows })
    this.calcPreview()
  },

  bindStoolChange(e) {
    const index = e.currentTarget.dataset.index
    const rows = this.data.rows
    rows[index].stool = e.detail.value
    this.setData({ rows })
  },

  bindStoolDescInput(e) {
    const index = e.currentTarget.dataset.index
    const rows = this.data.rows
    rows[index].stoolDesc = e.detail.value
    this.setData({ rows })
  },

  calcPreview() {
    let count = 0
    let total = 0
    this.data.rows.forEach(r => {
      const breast = parseFloat(r.breastMilk) || 0
      const formula = parseFloat(r.formula) || 0
      if (r.time && (breast > 0 || formula > 0 || r.stool)) {
        count++
        total += breast + formula
      }
    })
    this.setData({ validCount: count, validTotal: total })
  },

  submitBatch() {
    if (this._submitting) return
    const familyCode = wx.getStorageSync('familyCode')
    if (!familyCode) {
      wx.showToast({ title: '缺少家庭码', icon: 'none' })
      return
    }

    const validRows = []
    this.data.rows.forEach(r => {
      const breast = parseFloat(r.breastMilk) || 0
      const formula = parseFloat(r.formula) || 0
      if (r.time && (breast > 0 || formula > 0 || r.stool)) {
        validRows.push({
          date: this.data.date,
          time: r.time,
          breastMilk: breast,
          formula: formula,
          total: breast + formula,
          stool: r.stool,
          stoolDesc: r.stoolDesc.trim()
        })
      }
    })

    if (validRows.length === 0) {
      wx.showToast({ title: '请至少填写一条有效记录', icon: 'none' })
      return
    }

    const warnings = feedingAudit.batchDuplicateWarnings(this._existingFeedings || [], validRows)
    if (warnings.length) {
      const lines = warnings.slice(0, 3).map(w => `${w.time} 距 ${w.otherTime} 仅 ${w.minutes} 分钟`)
      if (warnings.length > 3) lines.push(`…共 ${warnings.length} 条`)
      wx.showModal({
        title: '可能重复记录',
        content: `${lines.join('\n')}\n请确认不是同一次喂养的重复录入。`,
        confirmText: '继续保存',
        cancelText: '返回检查',
        success: result => {
          if (result.confirm) this.saveRows(familyCode, validRows)
        }
      })
      return
    }
    this.saveRows(familyCode, validRows)
  },

  saveRows(familyCode, validRows) {
    this._submitting = true
    wx.showLoading({ title: `保存 ${validRows.length} 条...`, mask: true })

    wx.cloud.callFunction({
      name: 'batchFeeding',
      data: { familyCode, records: validRows }
    }).then(res => {
      wx.hideLoading()
      if (res.result && res.result.success) {
        wx.showToast({ title: '保存成功', icon: 'success' })
        setTimeout(() => wx.switchTab({ url: '/pages/index/index' }), 800)
      } else {
        this._submitting = false
        wx.showToast({ title: '保存失败', icon: 'none' })
      }
    }).catch(err => {
      this._submitting = false
      wx.hideLoading()
      console.error(err)
      wx.showToast({ title: '部分保存失败', icon: 'none' })
    })
  },

  goBack() {
    wx.navigateBack()
  }
})
