Page({
  data: {
    familyCode: '',
    todayDate: '',
    currentDate: '',
    records: [],
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
    const today = new Date()
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
    
    const currentDate = this.data.currentDate || todayStr

    this.setData({
      familyCode,
      todayDate: todayStr,
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
    wx.navigateTo({ url: '/pages/add/add?id=' + id })
  },


})
