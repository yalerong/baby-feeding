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
    _id: '',
    isCustom: false,
    vaccineName: '',
    category: '一类',
    dose: 1,
    plannedDate: '',
    originalPlannedDate: '',
    actualDate: '',
    note: '',
    today: ''
  },

  onLoad(options) {
    const now = new Date()
    const todayStr = formatDate(now)
    this.setData({ today: todayStr })

    if (options.id) {
      this.setData({ _id: options.id })
      this.loadRecord(options.id)
    } else {
      this.setData({ isCustom: true, category: '自定义' })
    }
  },

  loadRecord(_id) {
    const db = wx.cloud.database()
    db.collection('vaccine_records').doc(_id).get()
      .then(res => {
        const r = res.data
        this.setData({
          vaccineName: r.vaccineName,
          category: r.category,
          dose: r.dose,
          plannedDate: r.plannedDate,
          originalPlannedDate: r.plannedDate,
          actualDate: r.actualDate || '',
          note: r.note || '',
          isCustom: r.category === '自定义'
        })
      })
      .catch(() => {
        wx.showToast({ title: '加载失败', icon: 'none' })
      })
  },

  bindNameInput(e) {
    this.setData({ vaccineName: e.detail.value })
  },

  bindDoseInput(e) {
    this.setData({ dose: parseInt(e.detail.value) || 1 })
  },

  bindPlannedChange(e) {
    this.setData({ plannedDate: e.detail.value })
  },

  bindActualChange(e) {
    this.setData({ actualDate: e.detail.value })
  },

  bindNoteInput(e) {
    this.setData({ note: e.detail.value })
  },

  submit() {
    if (!this.data.vaccineName) {
      wx.showToast({ title: '请输入疫苗名称', icon: 'none' })
      return
    }
    if (!this.data.plannedDate) {
      wx.showToast({ title: '请选择预计日期', icon: 'none' })
      return
    }
    if (!this.data.dose || this.data.dose < 1) {
      wx.showToast({ title: '剂次至少为1', icon: 'none' })
      return
    }

    wx.showLoading({ title: '保存中...', mask: true })
    const db = wx.cloud.database()
    const familyCode = wx.getStorageSync('familyCode') || 'FAMILY'

    const isCompleted = !!this.data.actualDate
    const isPlannedChanged = this.data.plannedDate !== this.data.originalPlannedDate && !this.data.isCustom

    const payload = {
      plannedDate: this.data.plannedDate,
      actualDate: this.data.actualDate || '',
      status: isCompleted ? 'completed' : 'planned',
      note: this.data.note.trim(),
      updateTime: db.serverDate()
    }

    if (isPlannedChanged) {
      payload.isCustomPlanned = true
    }

    if (this.data._id) {
      db.collection('vaccine_records').doc(this.data._id).update({ data: payload })
        .then(() => {
          if (isCompleted) {
            return this.recalculateFollowing()
          }
        })
        .then(() => {
          wx.hideLoading()
          wx.showToast({ title: '保存成功', icon: 'success' })
          setTimeout(() => wx.navigateBack(), 800)
        })
        .catch(err => {
          wx.hideLoading()
          console.error(err)
          wx.showToast({ title: '保存失败', icon: 'none' })
        })
    } else {
      db.collection('vaccine_records').add({
        data: {
          familyCode,
          vaccineName: this.data.vaccineName,
          category: this.data.category,
          dose: this.data.dose,
          plannedDate: this.data.plannedDate,
          actualDate: this.data.actualDate || '',
          status: isCompleted ? 'completed' : 'planned',
          isCustomPlanned: false,
          note: this.data.note.trim(),
          createTime: db.serverDate(),
          updateTime: db.serverDate()
        }
      })
        .then(() => {
          wx.hideLoading()
          wx.showToast({ title: '保存成功', icon: 'success' })
          setTimeout(() => wx.navigateBack(), 800)
        })
        .catch(err => {
          wx.hideLoading()
          console.error(err)
          wx.showToast({ title: '保存失败', icon: 'none' })
        })
    }
  },

  recalculateFollowing() {
    const birthDate = wx.getStorageSync('babyBirthDate')
    if (!birthDate) return Promise.resolve()

    const db = wx.cloud.database()
    const familyCode = wx.getStorageSync('familyCode') || 'FAMILY'
    const vaccineName = this.data.vaccineName

    return db.collection('vaccine_records')
      .where({ familyCode, vaccineName })
      .orderBy('dose', 'asc')
      .get()
      .then(res => {
        const records = res.data
        const schedule = VACCINE_SCHEDULES.find(v => v.name === vaccineName)
        if (!schedule) return Promise.resolve()

        let lastActual = null
        const updates = []

        records.forEach(r => {
          const doseInfo = schedule.doses.find(d => d.dose === r.dose)
          if (!doseInfo) return

          if (r.actualDate) {
            lastActual = new Date(r.actualDate)
          } else if (lastActual && !r.isCustomPlanned) {
            const newDate = new Date(lastActual)
            newDate.setDate(newDate.getDate() + doseInfo.intervalDays)
            const birth = new Date(birthDate)
            const minDate = new Date(birth.getFullYear(), birth.getMonth() + doseInfo.minAgeMonth, birth.getDate())
            const finalDate = newDate > minDate ? newDate : minDate
            const finalDateStr = formatDate(finalDate)

            if (finalDateStr !== r.plannedDate) {
              updates.push(
                db.collection('vaccine_records').doc(r._id).update({
                  data: {
                    plannedDate: finalDateStr,
                    updateTime: db.serverDate()
                  }
                })
              )
            }
          }
        })

        return Promise.all(updates)
      })
  },

  resetPlanned() {
    const birthDate = wx.getStorageSync('babyBirthDate')
    if (!birthDate) {
      wx.showToast({ title: '请先设置出生日期', icon: 'none' })
      return
    }

    const schedule = VACCINE_SCHEDULES.find(v => v.name === this.data.vaccineName)
    if (!schedule) {
      wx.showToast({ title: '自定义疫苗无法恢复系统预计', icon: 'none' })
      return
    }

    const doseInfo = schedule.doses.find(d => d.dose === this.data.dose)
    if (!doseInfo) return

    const birth = new Date(birthDate)
    const planned = new Date(birth.getFullYear(), birth.getMonth() + doseInfo.minAgeMonth, birth.getDate())
    const plannedStr = formatDate(planned)

    this.setData({ plannedDate: plannedStr })
    wx.showToast({ title: '已恢复系统预计日期', icon: 'none' })
  },

  deleteRecord() {
    if (!this.data._id) return
    wx.showModal({
      title: '确认删除',
      content: '删除后无法恢复，确定吗？',
      confirmColor: '#ff4d4f',
      success: (res) => {
        if (res.confirm) {
          wx.showLoading({ title: '删除中...', mask: true })
          const db = wx.cloud.database()
          db.collection('vaccine_records').doc(this.data._id).remove()
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
