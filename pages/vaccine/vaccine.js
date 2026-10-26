const VACCINE_SCHEDULES = require('../../utils/vaccineSchedules.js')

const dateUtil = require('../../utils/date.js')
const vaccineSync = require('../../utils/vaccineSync.js')
const pageSnapshot = require('../../utils/pageSnapshot.js')

Page({
  data: {
    birthDate: '',
    currentMonth: 0,
    stats: { completed: 0, pending: 0, overdue: 0 },
    records: [],
    displayRecords: [],
    filterIndex: 0,
    filters: ['全部', '一类', '二类', '待接种', '已接种'],
    today: ''
  },

  onShow() {
    this.stopVaccineSync()
    const today = dateUtil.todayStr()
    const familyCode = wx.getStorageSync('familyCode') || 'FAMILY'
    const birthDate = wx.getStorageSync('babyBirthDate') || ''
    const key = pageSnapshot.key({ familyCode, birthDate })
    const changedContext = this._vaccineContextKey !== key
    this._vaccineVisible = true
    this._vaccineContextKey = key
    this._vaccineContext = { familyCode, birthDate, key, readSeq: 0, watchVersion: 0 }
    this.setData({ today, birthDate, currentMonth: birthDate ? this.calculateMonths(birthDate, today) : 0 })
    if (changedContext) this._vaccineSignature = ''
    if (birthDate) {
      const cached = pageSnapshot.read('vaccine', key)
      if (cached !== null) this.renderRecords(cached)
      else if (changedContext && this.data.records.length) this.renderRecords([])
      this.checkAndInitPlan(birthDate)
    } else {
      this.renderRecords([])
    }
  },

  onHide() {
    this._vaccineVisible = false
    this.hideVaccineLoading(this._vaccineContext)
    this.stopVaccineSync()
    this._vaccineContext = null
  },

  onUnload() {
    this.onHide()
  },

  calculateMonths(birthDate, currentDate) {
    return dateUtil.monthsBetween(birthDate, currentDate)
  },

  isVaccineContextCurrent(context) {
    return !!context && this._vaccineVisible && this._vaccineContext === context &&
      (wx.getStorageSync('familyCode') || 'FAMILY') === context.familyCode &&
      (wx.getStorageSync('babyBirthDate') || '') === context.birthDate
  },

  checkAndInitPlan() {
    return this.fetchVaccineRecords(true)
  },

  hideVaccineLoading(context) {
    if (context && context.loading) {
      context.loading = false
      wx.hideLoading()
    }
  },

  initPlan(birthDate, familyCode, context = this._vaccineContext) {
    if (!this.isVaccineContextCurrent(context)) return
    wx.showLoading({ title: '初始化计划...', mask: true })
    context.loading = true

    const records = []
    VACCINE_SCHEDULES.forEach(v => {
      v.doses.forEach(d => {
        records.push({
          vaccineName: v.name,
          category: v.category,
          dose: d.dose,
          plannedDate: dateUtil.addMonths(birthDate, d.minAgeMonth),
          actualDate: '',
          status: 'planned',
          isCustomPlanned: false,
          note: ''
        })
      })
    })

    wx.cloud.callFunction({
      name: 'batchVaccine',
      data: { action: 'init', familyCode, records }
    }).then(res => {
      if (res.result && res.result.success) {
        pageSnapshot.invalidate('vaccine')
        if (!this.isVaccineContextCurrent(context)) return
        this.hideVaccineLoading(context)
        this.loadRecords()
      } else {
        if (!this.isVaccineContextCurrent(context)) return
        this.hideVaccineLoading(context)
        wx.showToast({ title: '初始化失败', icon: 'none' })
      }
    }).catch(err => {
      if (!this.isVaccineContextCurrent(context)) return
      this.hideVaccineLoading(context)
      console.error(err)
      wx.showToast({ title: '初始化失败', icon: 'none' })
    })
  },

  loadRecords() {
    return this.fetchVaccineRecords(false)
  },

  fetchVaccineRecords(allowInit) {
    const context = this._vaccineContext
    if (!this.isVaccineContextCurrent(context)) return
    const seq = ++context.readSeq
    const version = context.watchVersion
    const key = pageSnapshot.key({ familyCode: context.familyCode, birthDate: context.birthDate, operation: 'list' })
    return pageSnapshot.fetch('vaccine', key, () => wx.cloud.callFunction({
      name: 'batchVaccine',
      data: { action: 'list', familyCode: context.familyCode }
    }).then(res => {
      if (!res.result || !res.result.success) throw new Error((res.result && res.result.error) || 'list failed')
      return res.result.data || []
    })).then(data => {
      if (!this.isVaccineContextCurrent(context) || context.readSeq !== seq || context.watchVersion !== version) return
      if (allowInit && data.length === 0) return this.initPlan(context.birthDate, context.familyCode, context)
      pageSnapshot.write('vaccine', context.key, data)
      this.renderRecords(data)
      this.startVaccineSync(context.familyCode, context.birthDate, context)
    }).catch(err => {
      if (!this.isVaccineContextCurrent(context) || context.readSeq !== seq || context.watchVersion !== version) return
      console.error(err)
      wx.showToast({ title: '加载失败', icon: 'none' })
    })
  },

  renderRecords(data) {
    const source = data.slice().sort((a, b) => a.plannedDate.localeCompare(b.plannedDate) || String(a._id).localeCompare(String(b._id)))
    const signature = JSON.stringify([this.data.today, source])
    if (this._vaccineSignature === signature) return false
    this._vaccineSignature = signature
    const records = source.map(r => ({
      ...r,
      isOverdue: r.status === 'planned' && r.plannedDate < this.data.today
    }))
    this.setData({ records, displayRecords: this.filterRecords(records), stats: this.calculateStats(records) })
    return true
  },

  calculateStats(records) {
    let completed = 0, pending = 0, overdue = 0
    records.forEach(r => {
      if (r.status === 'completed') completed++
      else {
        pending++
        if (r.plannedDate < this.data.today) overdue++
      }
    })
    return { completed, pending, overdue }
  },

  startVaccineSync(familyCode, birthDate, context = this._vaccineContext) {
    if (!this.isVaccineContextCurrent(context) || !vaccineSync.shouldSyncVaccine({ familyCode, birthDate })) {
      this.stopVaccineSync()
      return
    }

    const key = context.key
    if (this._vaccineSyncKey === key) return

    this.stopVaccineSync()
    this._vaccineSyncKey = key
    this.startVaccineWatcher(familyCode, key, context)
  },

  startVaccineWatcher(familyCode, key, context) {
    try {
      if (!wx.cloud || !wx.cloud.database) return
      const db = wx.cloud.database()
      const watcher = db.collection('vaccine_records')
        .where({ familyCode })
        .orderBy('plannedDate', 'asc')
        .watch({
          onChange: snapshot => {
            if (!this.isVaccineContextCurrent(context) || this._vaccineSyncKey !== key) return
            context.watchVersion += 1
            const data = vaccineSync.recordsFromWatchSnapshot(snapshot)
            if (this.renderRecords(data)) pageSnapshot.write('vaccine', context.key, data)
          },
          onError: err => {
            if (!this.isVaccineContextCurrent(context) || this._vaccineSyncKey !== key) return
            console.error(err)
          }
        })
      if (!this.isVaccineContextCurrent(context) || this._vaccineSyncKey !== key) watcher.close()
      else this._vaccineWatcher = watcher
    } catch (err) {
      console.error(err)
    }
  },

  stopVaccineSync() {
    this._vaccineSyncKey = ''
    if (this._vaccineWatcher) {
      this._vaccineWatcher.close()
      this._vaccineWatcher = null
    }
  },

  filterRecords(records, filterIndex = this.data.filterIndex) {
    const filter = this.data.filters[filterIndex]
    let list = records
    if (filter === '一类') list = list.filter(r => r.category === '一类')
    else if (filter === '二类') list = list.filter(r => r.category === '二类')
    else if (filter === '待接种') list = list.filter(r => r.status === 'planned')
    else if (filter === '已接种') list = list.filter(r => r.status === 'completed')
    return list
  },

  applyFilter() {
    this.setData({ displayRecords: this.filterRecords(this.data.records) })
  },

  filterChange(e) {
    const filterIndex = parseInt(e.detail.value)
    this.setData({ filterIndex, displayRecords: this.filterRecords(this.data.records, filterIndex) })
  },

  onBirthDateChange(e) {
    this.clearAndReinit(e.detail.value)
  },

  clearAndReinit(birthDate) {
    wx.showModal({
      title: '提示',
      content: '修改出生日期将重新生成疫苗计划，是否继续？',
      success: (res) => {
        if (!res.confirm) return
        const context = this._vaccineContext
        if (!this.isVaccineContextCurrent(context)) return
        wx.showLoading({ title: '更新中...', mask: true })
        context.loading = true
        const familyCode = wx.getStorageSync('familyCode') || 'FAMILY'
        wx.cloud.callFunction({
          name: 'batchVaccine',
          data: { action: 'clear', familyCode }
        }).then(res => {
          if (!res.result || !res.result.success) throw new Error((res.result && res.result.error) || 'clear failed')
          pageSnapshot.invalidate('vaccine')
          if ((wx.getStorageSync('familyCode') || 'FAMILY') !== context.familyCode ||
              (wx.getStorageSync('babyBirthDate') || '') !== context.birthDate) return
          const active = this.isVaccineContextCurrent(context)
          wx.setStorageSync('babyBirthDate', birthDate)
          if (!active) return
          this.hideVaccineLoading(context)
          this.onShow()
        }).catch(err => {
          if (!this.isVaccineContextCurrent(context)) return
          this.hideVaccineLoading(context)
          console.error(err)
          wx.showToast({ title: '更新失败', icon: 'none' })
        })
      }
    })
  },

  goEdit(e) {
    const id = e.currentTarget.dataset.id
    wx.navigateTo({ url: '/pages/vaccineEdit/vaccineEdit?id=' + id })
  },

  showActions(e) {
    const item = e.currentTarget.dataset.item
    wx.showActionSheet({
      itemList: ['编辑', '删除'],
      itemColor: '#333',
      success: (res) => {
        if (res.tapIndex === 0) {
          wx.navigateTo({ url: '/pages/vaccineEdit/vaccineEdit?id=' + item._id })
        } else if (res.tapIndex === 1) {
          wx.showModal({
            title: '确认删除',
            content: `确定删除「${item.vaccineName} 第${item.dose}剂」吗？`,
            confirmColor: '#ff4d4f',
            success: (modalRes) => {
              if (modalRes.confirm) {
                wx.showLoading({ title: '删除中...', mask: true })
                const familyCode = wx.getStorageSync('familyCode') || 'FAMILY'
                wx.cloud.callFunction({
                  name: 'batchVaccine',
                  data: { action: 'remove', familyCode, _id: item._id }
                }).then(res => {
                  wx.hideLoading()
                  if (res.result && res.result.success) {
                    pageSnapshot.invalidate('vaccine')
                    wx.showToast({ title: '已删除', icon: 'success' })
                    this.loadRecords()
                  } else {
                    wx.showToast({ title: '删除失败', icon: 'none' })
                  }
                }).catch(() => {
                  wx.hideLoading()
                  wx.showToast({ title: '删除失败', icon: 'none' })
                })
              }
            }
          })
        }
      }
    })
  },

  goAddCustom() {
    wx.navigateTo({ url: '/pages/vaccineEdit/vaccineEdit' })
  }
})
