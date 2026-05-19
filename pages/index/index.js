const { todayStr, nowTimeStr } = require('../../utils/date.js')

Page({
  data: {
    familyCode: '',
    todayDate: '',
    currentDate: '',
    records: [],
    quickBreast: '',
    quickFormula: '',
    quickSaving: false,
    todayStats: {
      count: 0,
      total: 0,
      breast: 0,
      formula: 0,
      ratio: '0%',
      stool: 0
    }
  },

  onShow() {
    const familyCode = wx.getStorageSync('familyCode') || 'FAMILY'
    const today = todayStr()
    const currentDate = this.data.currentDate || today

    this.setData({
      familyCode,
      todayDate: today,
      currentDate
    })

    this.fetchRecords(currentDate)
  },

  bindDateChange(e) {
    const date = e.detail.value
    this.setData({ currentDate: date })
    this.fetchRecords(date)
  },

  fetchRecords(date) {
    wx.cloud.callFunction({
      name: 'getRecords',
      data: {
        familyCode: this.data.familyCode,
        date: date
      }
    }).then(res => {
      const records = res.result.data || []
      this.calculateStats(records)
    }).catch(err => {
      console.error(err)
      wx.showToast({ title: '获取记录失败', icon: 'none' })
    })
  },

  calculateStats(records) {
    let breast = 0
    let formula = 0
    let stool = 0
    let count = 0
    records.forEach(r => {
      const breastMilk = r.breastMilk || 0
      const formulaMilk = r.formula || 0
      breast += breastMilk
      formula += formulaMilk
      if (breastMilk + formulaMilk > 0) count += 1
      if (r.stool) stool += 1
    })
    const total = breast + formula
    const ratio = total === 0 ? '0%' : (breast / total * 100).toFixed(1) + '%'

    this.setData({
      records,
      todayStats: {
        count,
        total,
        breast,
        formula,
        ratio,
        stool
      }
    })
  },

  goAdd() {
    wx.navigateTo({ url: '/pages/add/add' })
  },

  goBatch() {
    wx.navigateTo({ url: '/pages/batch/batch' })
  },

  goEdit(e) {
    const id = e.currentTarget.dataset.id
    wx.navigateTo({ url: '/pages/add/add?id=' + encodeURIComponent(id) })
  },

  goToday() {
    if (this.data.currentDate === this.data.todayDate) return
    this.setData({ currentDate: this.data.todayDate })
    this.fetchRecords(this.data.todayDate)
  },

  onQuickBreast(e) {
    this.setData({ quickBreast: e.detail.value })
  },

  onQuickFormula(e) {
    this.setData({ quickFormula: e.detail.value })
  },

  quickSave() {
    if (this.data.quickSaving) return
    const breast = parseFloat(this.data.quickBreast) || 0
    const formula = parseFloat(this.data.quickFormula) || 0
    if (breast === 0 && formula === 0) {
      wx.showToast({ title: '请填写母乳或奶粉', icon: 'none' })
      return
    }

    const familyCode = this.data.familyCode
    if (!familyCode) {
      wx.showToast({ title: '缺少家庭码', icon: 'none' })
      return
    }

    this.setData({ quickSaving: true })
    wx.showLoading({ title: '保存中...', mask: true })
    wx.cloud.callFunction({
      name: 'addRecord',
      data: {
        familyCode,
        date: this.data.todayDate,
        time: nowTimeStr(),
        breastMilk: breast,
        formula: formula,
        total: breast + formula,
        stool: false,
        stoolDesc: ''
      }
    }).then(res => {
      wx.hideLoading()
      if (res.result && res.result.success) {
        wx.showToast({ title: '已保存', icon: 'success' })
        this.setData({ quickBreast: '', quickFormula: '', quickSaving: false })
        if (this.data.currentDate === this.data.todayDate) {
          this.fetchRecords(this.data.todayDate)
        }
      } else {
        this.setData({ quickSaving: false })
        wx.showToast({ title: '保存失败', icon: 'none' })
      }
    }).catch(() => {
      wx.hideLoading()
      this.setData({ quickSaving: false })
      wx.showToast({ title: '保存失败', icon: 'none' })
    })
  }
})
