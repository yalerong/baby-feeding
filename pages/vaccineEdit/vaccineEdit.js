const VACCINE_SCHEDULES = require('../../utils/vaccineSchedules.js')

const dateUtil = require('../../utils/date.js')

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
    const todayStr = dateUtil.todayStr()
    this.setData({ today: todayStr })

    if (options.id) {
      this.setData({ _id: options.id })
      this.loadRecord(options.id)
    } else {
      this.setData({ isCustom: true, category: '自定义' })
    }
  },

  loadRecord(_id) {
    const familyCode = wx.getStorageSync('familyCode') || 'FAMILY'
    wx.cloud.callFunction({
      name: 'batchVaccine',
      data: { action: 'get', familyCode, _id }
    })
      .then(res => {
        if (!res.result || !res.result.success) {
          throw new Error(res.result && res.result.error)
        }
        const r = res.result.data
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
    const familyCode = wx.getStorageSync('familyCode') || 'FAMILY'

    const isCompleted = !!this.data.actualDate
    const isPlannedChanged = this.data.plannedDate !== this.data.originalPlannedDate && !this.data.isCustom

    const payload = {
      plannedDate: this.data.plannedDate,
      actualDate: this.data.actualDate || '',
      status: isCompleted ? 'completed' : 'planned',
      note: this.data.note.trim()
    }

    if (isPlannedChanged) {
      payload.isCustomPlanned = true
    }

    if (this.data._id) {
      wx.cloud.callFunction({
        name: 'batchVaccine',
        data: { action: 'update', familyCode, _id: this.data._id, data: payload }
      })
        .then(res => {
          if (!res.result || !res.result.success) {
            throw new Error(res.result && res.result.error)
          }
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
      wx.cloud.callFunction({
        name: 'batchVaccine',
        data: {
          action: 'add',
          familyCode,
          record: {
            vaccineName: this.data.vaccineName,
            category: this.data.category,
            dose: this.data.dose,
            plannedDate: this.data.plannedDate,
            actualDate: this.data.actualDate || '',
            status: isCompleted ? 'completed' : 'planned',
            isCustomPlanned: false,
            note: this.data.note.trim()
          }
        }
      })
        .then(res => {
          if (!res.result || !res.result.success) {
            throw new Error(res.result && res.result.error)
          }
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

    const familyCode = wx.getStorageSync('familyCode') || 'FAMILY'
    const vaccineName = this.data.vaccineName

    return wx.cloud.callFunction({
      name: 'batchVaccine',
      data: { action: 'list', familyCode }
    })
      .then(res => {
        if (!res.result || !res.result.success) return Promise.resolve()
        const records = (res.result.data || [])
          .filter(r => r.vaccineName === vaccineName)
          .sort((a, b) => a.dose - b.dose)
        const schedule = VACCINE_SCHEDULES.find(v => v.name === vaccineName)
        if (!schedule) return Promise.resolve()

        let lastActual = ''
        const updates = []

        records.forEach(r => {
          const doseInfo = schedule.doses.find(d => d.dose === r.dose)
          if (!doseInfo) return

          if (r.actualDate) {
            lastActual = r.actualDate
          } else if (lastActual && !r.isCustomPlanned) {
            const intervalDate = dateUtil.addDays(lastActual, doseInfo.intervalDays)
            const minDate = dateUtil.addMonths(birthDate, doseInfo.minAgeMonth)
            const finalDateStr = dateUtil.compareDates(intervalDate, minDate) > 0 ? intervalDate : minDate

            if (finalDateStr !== r.plannedDate) {
              updates.push(
                wx.cloud.callFunction({
                  name: 'batchVaccine',
                  data: {
                    action: 'update',
                    familyCode,
                    _id: r._id,
                    data: { plannedDate: finalDateStr }
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

    const plannedStr = dateUtil.addMonths(birthDate, doseInfo.minAgeMonth)

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
          const familyCode = wx.getStorageSync('familyCode') || 'FAMILY'
          wx.cloud.callFunction({
            name: 'batchVaccine',
            data: { action: 'remove', familyCode, _id: this.data._id }
          })
            .then(res => {
              wx.hideLoading()
              if (res.result && res.result.success) {
                wx.showToast({ title: '已删除', icon: 'success' })
                setTimeout(() => wx.navigateBack(), 800)
              } else {
                wx.showToast({ title: '删除失败', icon: 'none' })
              }
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
