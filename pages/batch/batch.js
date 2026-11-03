const dateUtil = require('../../utils/date.js')
const feedingAudit = require('../../utils/feedingAudit.js')
const feedingReminderCache = require('../../utils/feedingReminderCache.js')
const todayStr = dateUtil.todayStr
const MAX_ROWS = 100

Page({
  data: {
    date: '',
    rows: [],
    maxRows: MAX_ROWS,
    saving: false,
    validCount: 0,
    validTotal: 0
  },

  onLoad() {
    this._batchActive = true
    this._batchUnloaded = false
    const rows = this.createEmptyRows(4)
    this.setData({ date: todayStr(), rows })
    this.loadExistingFeedings(todayStr())
  },

  onShow() {
    if (this._batchUnloaded) return
    this._batchActive = true
    if (this._batchSaveSucceeded) this.finishSavedBatch()
    else if (this._batchSaveFailed) this.showBatchSaveFailure()
  },

  onHide() {
    this._batchActive = false
    clearTimeout(this._batchNavigateTimer)
    this._batchNavigateTimer = null
    if (this._batchLoading) {
      this._batchLoading = false
      wx.hideLoading()
    }
  },

  onUnload() {
    this.onHide()
    this._batchUnloaded = true
  },

  isBatchSaveVisible() {
    return this._batchActive !== false && !this._batchUnloaded &&
      wx.getStorageSync('familyCode') === this._batchSaveFamily
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
      if (this._batchUnloaded || this.data.date !== date || wx.getStorageSync('familyCode') !== familyCode) return
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
    if (rows.length >= MAX_ROWS) {
      wx.showToast({ title: `每次最多保存${MAX_ROWS}条`, icon: 'none' })
      return
    }
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
    this.calcPreview()
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
    this.calcPreview()
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
    if (this.data.rows.length > MAX_ROWS) {
      wx.showToast({ title: `每次最多保存${MAX_ROWS}条`, icon: 'none' })
      return
    }
    const familyCode = wx.getStorageSync('familyCode')
    if (!familyCode) {
      wx.showToast({ title: '缺少家庭码', icon: 'none' })
      return
    }

    const validRows = []
    for (const r of this.data.rows) {
      const breast = Number(r.breastMilk)
      const formula = Number(r.formula)
      if (!Number.isFinite(breast) || breast < 0 || !Number.isFinite(formula) || formula < 0 || !Number.isFinite(breast + formula)) {
        wx.showToast({ title: '奶量需为大于等于0的数字', icon: 'none' })
        return
      }
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
    }

    if (validRows.length === 0) {
      wx.showToast({ title: '请至少填写一条有效记录', icon: 'none' })
      return
    }

    this._submitting = true
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
          else this._submitting = false
        },
        fail: () => { this._submitting = false }
      })
      return
    }
    this.saveRows(familyCode, validRows)
  },

  saveRows(familyCode, validRows) {
    this._submitting = true
    this._batchSaveFamily = familyCode
    this._batchSaveFailed = false
    const requestKey = JSON.stringify([familyCode, validRows])
    if (this._batchRequestKey !== requestKey) {
      this._batchRequestKey = requestKey
      this._batchRequestSeq = (this._batchRequestSeq || 0) + 1
      this._batchRequestId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}-${this._batchRequestSeq.toString(36)}`
    }
    this.setData({ saving: true })
    this._batchLoading = true
    wx.showLoading({ title: `保存 ${validRows.length} 条...`, mask: true })

    wx.cloud.callFunction({
      name: 'batchFeeding',
      data: { familyCode, records: validRows, requestId: this._batchRequestId }
    }).then(res => {
      if (res.result && res.result.success) {
        this._batchSaveSucceeded = true
        try { feedingReminderCache.clearForToday(familyCode, todayStr()) } catch (err) { console.error(err) }
        this.finishSavedBatch()
      } else {
        this._submitting = false
        this._batchSaveFailed = true
        this.showBatchSaveFailure()
      }
    }).catch(err => {
      if (this._batchSaveSucceeded) return
      this._submitting = false
      this._batchSaveFailed = true
      console.error(err)
      this.showBatchSaveFailure()
    })
  },

  finishSavedBatch() {
    if (!this.isBatchSaveVisible()) return
    if (this._batchLoading) {
      this._batchLoading = false
      wx.hideLoading()
    }
    wx.showToast({ title: '保存成功', icon: 'success' })
    clearTimeout(this._batchNavigateTimer)
    this._batchNavigateTimer = setTimeout(() => {
      this._batchNavigateTimer = null
      if (this.isBatchSaveVisible()) wx.switchTab({ url: '/pages/index/index' })
    }, 800)
  },

  showBatchSaveFailure() {
    if (!this.isBatchSaveVisible()) return
    this._batchSaveFailed = false
    this.setData({ saving: false })
    if (this._batchLoading) {
      this._batchLoading = false
      wx.hideLoading()
    }
    wx.showToast({ title: '保存失败', icon: 'none' })
  },

  goBack() {
    wx.navigateBack()
  }
})
