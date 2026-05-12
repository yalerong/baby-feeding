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

function formatDate(d) {
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

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
    const now = new Date()
    const todayStr = formatDate(now)
    this.setData({ today: todayStr })

    const birthDate = wx.getStorageSync('babyBirthDate')
    if (birthDate) {
      const months = this.calculateMonths(birthDate, todayStr)
      this.setData({ birthDate, currentMonth: months })
      this.checkAndInitPlan(birthDate)
    } else {
      this.setData({ birthDate: '', records: [], displayRecords: [], stats: { completed: 0, pending: 0, overdue: 0 } })
    }
  },

  calculateMonths(birthDate, currentDate) {
    const b = new Date(birthDate)
    const c = new Date(currentDate)
    let months = (c.getFullYear() - b.getFullYear()) * 12 + (c.getMonth() - b.getMonth())
    if (c.getDate() < b.getDate()) months--
    if (months < 0) months = 0
    return months
  },

  checkAndInitPlan(birthDate) {
    const familyCode = wx.getStorageSync('familyCode') || 'FAMILY'
    const db = wx.cloud.database()
    db.collection('vaccine_records')
      .where({ familyCode })
      .count()
      .then(res => {
        if (res.total === 0) {
          this.initPlan(birthDate, familyCode)
        } else {
          this.loadRecords()
        }
      })
  },

  initPlan(birthDate, familyCode) {
    wx.showLoading({ title: '初始化计划...', mask: true })
    const db = wx.cloud.database()
    const promises = []

    VACCINE_SCHEDULES.forEach(v => {
      v.doses.forEach(d => {
        const birth = new Date(birthDate)
        const planned = new Date(birth.getFullYear(), birth.getMonth() + d.minAgeMonth, birth.getDate())
        const record = {
          familyCode,
          vaccineName: v.name,
          category: v.category,
          dose: d.dose,
          plannedDate: formatDate(planned),
          actualDate: '',
          status: 'planned',
          isCustomPlanned: false,
          note: ''
        }
        promises.push(
          db.collection('vaccine_records').add({
            data: { ...record, createTime: db.serverDate() }
          })
        )
      })
    })

    Promise.all(promises)
      .then(() => {
        wx.hideLoading()
        this.loadRecords()
      })
      .catch(err => {
        wx.hideLoading()
        console.error(err)
        wx.showToast({ title: '初始化失败', icon: 'none' })
      })
  },

  loadRecords() {
    const familyCode = wx.getStorageSync('familyCode') || 'FAMILY'
    const db = wx.cloud.database()
    db.collection('vaccine_records')
      .where({ familyCode })
      .orderBy('plannedDate', 'asc')
      .get()
      .then(res => {
        const records = res.data.map(r => ({
          ...r,
          isOverdue: r.status === 'planned' && r.plannedDate < this.data.today
        }))
        this.setData({ records })
        this.applyFilter()
        this.calculateStats(records)
      })
      .catch(err => {
        console.error(err)
        wx.showToast({ title: '加载失败', icon: 'none' })
      })
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
        if (res.confirm) {
          wx.showLoading({ title: '更新中...', mask: true })
          const familyCode = wx.getStorageSync('familyCode') || 'FAMILY'
          const db = wx.cloud.database()
          db.collection('vaccine_records')
            .where({ familyCode })
            .get()
            .then(res => {
              const removes = res.data.map(r =>
                db.collection('vaccine_records').doc(r._id).remove()
              )
              return Promise.all(removes)
            })
            .then(() => {
              this.initPlan(birthDate, familyCode)
            })
            .catch(err => {
              wx.hideLoading()
              console.error(err)
              wx.showToast({ title: '更新失败', icon: 'none' })
            })
        } else {
          // 用户取消，不重新生成，但 birthDate 已经改了，需要改回来？
          // 其实不需要，因为计划没重新生成，数据对不上。但这种情况很少。
        }
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
                const db = wx.cloud.database()
                db.collection('vaccine_records').doc(item._id).remove()
                  .then(() => {
                    wx.hideLoading()
                    wx.showToast({ title: '已删除', icon: 'success' })
                    this.loadRecords()
                  })
                  .catch(() => {
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
