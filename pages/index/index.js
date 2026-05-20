const dateUtil = require('../../utils/date.js')
const todayStr = dateUtil.todayStr
const nowTimeStr = dateUtil.nowTimeStr

function toTimestamp(dateStr, timeStr) {
  if (!dateStr || !timeStr) return null
  const dParts = dateStr.split('-')
  const tParts = timeStr.split(':')
  if (dParts.length < 3 || tParts.length < 2) return null
  const y = parseInt(dParts[0], 10)
  const mo = parseInt(dParts[1], 10)
  const d = parseInt(dParts[2], 10)
  const h = parseInt(tParts[0], 10)
  const mi = parseInt(tParts[1], 10)
  if (!y || !mo || !d || isNaN(h) || isNaN(mi)) return null
  return new Date(y, mo - 1, d, h, mi, 0).getTime()
}

function formatIntervalText(minutes) {
  if (minutes < 0) return ''
  if (minutes < 1) return '刚刚'
  if (minutes < 60) return minutes + ' 分钟'
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (m === 0) return h + ' 小时'
  return h + ' 小时 ' + m + ' 分钟'
}

Page({
  data: {
    familyCode: '',
    todayDate: '',
    currentDate: '',
    records: [],
    quickBreast: '',
    quickFormula: '',
    quickSaving: false,
    babyBirthDate: '',
    babyDays: 0,
    babyAgeText: '',
    babyMilestone: '',
    lastFeedingTs: 0,
    sinceLastFeedingText: '',
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

    this.refreshBaby(today)
    this.fetchRecords(currentDate)
    this.startSinceTimer()
  },

  onHide() {
    this.stopSinceTimer()
  },

  onUnload() {
    this.stopSinceTimer()
  },

  startSinceTimer() {
    this.stopSinceTimer()
    this._sinceTimer = setInterval(() => {
      this.refreshSinceLastFeeding()
    }, 60000)
  },

  stopSinceTimer() {
    if (this._sinceTimer) {
      clearInterval(this._sinceTimer)
      this._sinceTimer = null
    }
  },

  refreshSinceLastFeeding() {
    if (this.data.currentDate !== this.data.todayDate || !this.data.lastFeedingTs) {
      if (this.data.sinceLastFeedingText) {
        this.setData({ sinceLastFeedingText: '' })
      }
      return
    }
    const diff = Math.floor((Date.now() - this.data.lastFeedingTs) / 60000)
    this.setData({ sinceLastFeedingText: formatIntervalText(diff) })
  },

  refreshBaby(today) {
    const birth = wx.getStorageSync('babyBirthDate') || ''
    if (!birth) {
      this.setData({ babyBirthDate: '', babyDays: 0, babyAgeText: '', babyMilestone: '' })
      return
    }
    const days = dateUtil.daysBetween(birth, today)
    this.setData({
      babyBirthDate: birth,
      babyDays: days,
      babyAgeText: dateUtil.ageText(birth, today),
      babyMilestone: dateUtil.milestone(days)
    })
  },

  onBirthDateChange(e) {
    const date = e.detail.value
    wx.setStorageSync('babyBirthDate', date)
    this.refreshBaby(this.data.todayDate)
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
      const prevFeeding = res.result.prevFeeding || null
      this.calculateStats(records, prevFeeding)
    }).catch(err => {
      console.error(err)
      wx.showToast({ title: '获取记录失败', icon: 'none' })
    })
  },

  calculateStats(records, prevFeeding) {
    let breast = 0
    let formula = 0
    let stool = 0
    let count = 0
    const now = Date.now()
    let chainTs = prevFeeding ? toTimestamp(prevFeeding.date, prevFeeding.time) : null
    let mostRecentPastTs = (chainTs !== null && chainTs <= now) ? chainTs : 0

    const enriched = records.map(r => {
      const breastMilk = r.breastMilk || 0
      const formulaMilk = r.formula || 0
      breast += breastMilk
      formula += formulaMilk
      const isFeeding = breastMilk + formulaMilk > 0
      if (isFeeding) count += 1
      if (r.stool) stool += 1

      let intervalText = ''
      if (isFeeding) {
        const curTs = toTimestamp(r.date, r.time)
        if (chainTs !== null && curTs !== null) {
          intervalText = formatIntervalText(Math.floor((curTs - chainTs) / 60000))
        }
        if (curTs !== null) {
          chainTs = curTs
          if (curTs <= now) mostRecentPastTs = curTs
        }
      }
      return Object.assign({}, r, { intervalText })
    })
    const total = breast + formula
    const ratio = total === 0 ? '0%' : (breast / total * 100).toFixed(1) + '%'

    this.setData({
      records: enriched,
      lastFeedingTs: mostRecentPastTs,
      todayStats: {
        count,
        total,
        breast,
        formula,
        ratio,
        stool
      }
    }, () => this.refreshSinceLastFeeding())
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
