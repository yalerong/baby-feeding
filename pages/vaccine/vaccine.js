const VACCINE_SCHEDULES = [
  { name: '乙肝疫苗', category: '一类', doses: [{ dose: 1, minAgeMonth: 0, intervalDays: 0 }, { dose: 2, minAgeMonth: 1, intervalDays: 28 }, { dose: 3, minAgeMonth: 6, intervalDays: 60 }] },
  { name: '卡介苗', category: '一类', doses: [{ dose: 1, minAgeMonth: 0, intervalDays: 0 }] },
  { name: '脊灰灭活疫苗(IPV)', category: '一类', doses: [{ dose: 1, minAgeMonth: 2, intervalDays: 0 }, { dose: 2, minAgeMonth: 3, intervalDays: 28 }] },
  { name: '百白破疫苗', category: '一类', doses: [{ dose: 1, minAgeMonth: 3, intervalDays: 0 }, { dose: 2, minAgeMonth: 4, intervalDays: 28 }, { dose: 3, minAgeMonth: 5, intervalDays: 28 }, { dose: 4, minAgeMonth: 18, intervalDays: 180 }] },
  { name: '麻腮风疫苗', category: '一类', doses: [{ dose: 1, minAgeMonth: 8, intervalDays: 0 }, { dose: 2, minAgeMonth: 18, intervalDays: 180 }] },
  { name: '乙脑减毒活疫苗', category: '一类', doses: [{ dose: 1, minAgeMonth: 8, intervalDays: 0 }, { dose: 2, minAgeMonth: 24, intervalDays: 365 }] },
  { name: '甲肝灭活疫苗', category: '一类', doses: [{ dose: 1, minAgeMonth: 18, intervalDays: 0 }, { dose: 2, minAgeMonth: 24, intervalDays: 180 }] },
  { name: '五联疫苗', category: '二类', doses: [{ dose: 1, minAgeMonth: 2, intervalDays: 0 }, { dose: 2, minAgeMonth: 3, intervalDays: 28 }, { dose: 3, minAgeMonth: 4, intervalDays: 28 }, { dose: 4, minAgeMonth: 18, intervalDays: 180 }] },
  { name: '13价肺炎疫苗', category: '二类', doses: [{ dose: 1, minAgeMonth: 2, intervalDays: 0 }, { dose: 2, minAgeMonth: 4, intervalDays: 56 }, { dose: 3, minAgeMonth: 6, intervalDays: 56 }, { dose: 4, minAgeMonth: 12, intervalDays: 180 }] },
  { name: '轮状病毒疫苗', category: '二类', doses: [{ dose: 1, minAgeMonth: 2, intervalDays: 0 }, { dose: 2, minAgeMonth: 4, intervalDays: 28 }, { dose: 3, minAgeMonth: 6, intervalDays: 28 }] },
  { name: '水痘疫苗', category: '二类', doses: [{ dose: 1, minAgeMonth: 12, intervalDays: 0 }, { dose: 2, minAgeMonth: 48, intervalDays: 90 }] },
  { name: '流感疫苗', category: '二类', doses: [{ dose: 1, minAgeMonth: 6, intervalDays: 0 }, { dose: 2, minAgeMonth: 7, intervalDays: 28 }] },
  { name: '手足口疫苗(EV71)', category: '二类', doses: [{ dose: 1, minAgeMonth: 6, intervalDays: 0 }, { dose: 2, minAgeMonth: 7, intervalDays: 28 }] },
  { name: '流脑AC结合疫苗', category: '二类', doses: [{ dose: 1, minAgeMonth: 6, intervalDays: 0 }, { dose: 2, minAgeMonth: 9, intervalDays: 90 }] },
  { name: 'Hib疫苗', category: '二类', doses: [{ dose: 1, minAgeMonth: 2, intervalDays: 0 }, { dose: 2, minAgeMonth: 3, intervalDays: 28 }, { dose: 3, minAgeMonth: 4, intervalDays: 28 }, { dose: 4, minAgeMonth: 18, intervalDays: 180 }] }
]

const dateUtil = require('../../utils/date.js')
const vaccineSync = require('../../utils/vaccineSync.js')

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
    const todayStr = dateUtil.todayStr()
    this.setData({ today: todayStr })

    const birthDate = wx.getStorageSync('babyBirthDate')
    if (birthDate) {
      const months = this.calculateMonths(birthDate, todayStr)
      this.setData({ birthDate, currentMonth: months })
      this.checkAndInitPlan(birthDate)
    } else {
      this.stopVaccineSync()
      this.setData({ birthDate: '', records: [], displayRecords: [], stats: { completed: 0, pending: 0, overdue: 0 } })
    }
  },

  onHide() {
    this.stopVaccineSync()
  },

  onUnload() {
    this.stopVaccineSync()
  },

  calculateMonths(birthDate, currentDate) {
    return dateUtil.monthsBetween(birthDate, currentDate)
  },

  checkAndInitPlan(birthDate) {
    const familyCode = wx.getStorageSync('familyCode') || 'FAMILY'
    wx.cloud.callFunction({
      name: 'batchVaccine',
      data: { action: 'list', familyCode }
    }).then(res => {
      if (!res.result || !res.result.success) {
        wx.showToast({ title: '加载失败', icon: 'none' })
        return
      }
      const data = res.result.data || []
      if (data.length === 0) {
        this.initPlan(birthDate, familyCode)
      } else {
        this.renderRecords(data)
        this.startVaccineSync(familyCode, birthDate)
      }
    }).catch(err => {
      console.error(err)
      wx.showToast({ title: '加载失败', icon: 'none' })
    })
  },

  initPlan(birthDate, familyCode) {
    wx.showLoading({ title: '初始化计划...', mask: true })

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
      wx.hideLoading()
      if (res.result && res.result.success) {
        this.loadRecords()
      } else {
        wx.showToast({ title: '初始化失败', icon: 'none' })
      }
    }).catch(err => {
      wx.hideLoading()
      console.error(err)
      wx.showToast({ title: '初始化失败', icon: 'none' })
    })
  },

  loadRecords() {
    const familyCode = wx.getStorageSync('familyCode') || 'FAMILY'
    wx.cloud.callFunction({
      name: 'batchVaccine',
      data: { action: 'list', familyCode }
    }).then(res => {
      if (!res.result || !res.result.success) {
        wx.showToast({ title: '加载失败', icon: 'none' })
        return
      }
      this.renderRecords(res.result.data || [])
      this.startVaccineSync(familyCode, this.data.birthDate)
    }).catch(err => {
      console.error(err)
      wx.showToast({ title: '加载失败', icon: 'none' })
    })
  },

  renderRecords(data) {
    const records = data.map(r => ({
      ...r,
      isOverdue: r.status === 'planned' && r.plannedDate < this.data.today
    }))
    this.setData({ records })
    this.applyFilter()
    this.calculateStats(records)
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
    this.setData({ stats: { completed, pending, overdue } })
  },

  startVaccineSync(familyCode, birthDate) {
    if (!vaccineSync.shouldSyncVaccine({ familyCode, birthDate })) {
      this.stopVaccineSync()
      return
    }

    const key = vaccineSync.getVaccineSyncKey({ familyCode })
    if (this._vaccineSyncKey === key) return

    this.stopVaccineSync()
    this._vaccineSyncKey = key
    this.startVaccineWatcher(familyCode, key)
  },

  startVaccineWatcher(familyCode, key) {
    try {
      if (!wx.cloud || !wx.cloud.database) return
      const db = wx.cloud.database()
      this._vaccineWatcher = db.collection('vaccine_records')
        .where({ familyCode })
        .orderBy('plannedDate', 'asc')
        .watch({
          onChange: snapshot => {
            if (this._vaccineSyncKey !== key) return
            this.renderRecords(vaccineSync.recordsFromWatchSnapshot(snapshot))
          },
          onError: err => {
            console.error(err)
          }
        })
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

  applyFilter() {
    const filter = this.data.filters[this.data.filterIndex]
    let list = [...this.data.records]
    if (filter === '一类') list = list.filter(r => r.category === '一类')
    else if (filter === '二类') list = list.filter(r => r.category === '二类')
    else if (filter === '待接种') list = list.filter(r => r.status === 'planned')
    else if (filter === '已接种') list = list.filter(r => r.status === 'completed')
    this.setData({ displayRecords: list })
  },

  filterChange(e) {
    this.setData({ filterIndex: parseInt(e.detail.value) })
    this.applyFilter()
  },

  onBirthDateChange(e) {
    const date = e.detail.value
    wx.setStorageSync('babyBirthDate', date)
    const months = this.calculateMonths(date, this.data.today)
    this.setData({ birthDate: date, currentMonth: months })
    this.clearAndReinit(date)
  },

  clearAndReinit(birthDate) {
    wx.showModal({
      title: '提示',
      content: '修改出生日期将重新生成疫苗计划，是否继续？',
      success: (res) => {
        if (!res.confirm) return
        wx.showLoading({ title: '更新中...', mask: true })
        const familyCode = wx.getStorageSync('familyCode') || 'FAMILY'
        wx.cloud.callFunction({
          name: 'batchVaccine',
          data: { action: 'clear', familyCode }
        }).then(() => {
          this.initPlan(birthDate, familyCode)
        }).catch(err => {
          wx.hideLoading()
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
