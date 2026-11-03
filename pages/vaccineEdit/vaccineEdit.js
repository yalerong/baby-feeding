const VACCINE_SCHEDULES = require('../../utils/vaccineSchedules.js')

const dateUtil = require('../../utils/date.js')
const pageSnapshot = require('../../utils/pageSnapshot.js')

function plannedDates(records, schedule, birthDate) {
  let previousDate = ''
  return records.slice().sort((a, b) => a.dose - b.dose).map(record => {
    const doseInfo = schedule.doses.find(dose => dose.dose === record.dose)
    if (!doseInfo) return null
    let plannedDate = record.plannedDate
    if (!record.actualDate && !record.isCustomPlanned) {
      const minDate = dateUtil.addMonths(birthDate, doseInfo.minAgeMonth)
      const intervalDate = previousDate ? dateUtil.addDays(previousDate, doseInfo.intervalDays) : minDate
      plannedDate = dateUtil.compareDates(intervalDate, minDate) > 0 ? intervalDate : minDate
    }
    previousDate = record.actualDate || plannedDate || previousDate
    return { record, plannedDate }
  }).filter(Boolean)
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
    today: '',
    loading: false,
    saving: false
  },

  onLoad(options = {}) {
    this._editActive = true
    this._editUnloaded = false
    this._editFamilyCode = wx.getStorageSync('familyCode') || 'FAMILY'
    const todayStr = dateUtil.todayStr()
    this.setData({ today: todayStr })

    if (options.id) {
      this.setData({ _id: options.id })
      this.loadRecord(options.id)
    } else {
      this.setData({ isCustom: true, category: '自定义' })
    }
  },

  onShow() {
    this._editActive = true
    if (this._pendingRecalculation && this._pendingRecalculation.failed) this.offerFollowingRetry(this._pendingRecalculation)
    else if (this._completedMutation) this.finishMutation(this._completedMutation.familyCode, this._completedMutation.title)
  },

  onHide() {
    this._editActive = false
    if (this._navigateTimer) clearTimeout(this._navigateTimer)
    this._navigateTimer = null
    if (this.data.saving || this.data.loading) wx.hideLoading()
  },

  onUnload() {
    this._editUnloaded = true
    this.onHide()
  },

  isCurrentEdit(familyCode) {
    return !this._editUnloaded && this._editActive !== false &&
      (wx.getStorageSync('familyCode') || 'FAMILY') === familyCode &&
      (!this._editFamilyCode || this._editFamilyCode === familyCode)
  },

  finishMutation(familyCode, title) {
    this._completedMutation = { familyCode, title }
    if (!this.isCurrentEdit(familyCode)) return
    wx.hideLoading()
    wx.showToast({ title, icon: 'success' })
    this._navigateTimer = setTimeout(() => {
      this._navigateTimer = null
      if (this.isCurrentEdit(familyCode)) wx.navigateBack()
    }, 800)
  },

  loadRecord(_id) {
    this._recordLoaded = false
    const version = this._loadVersion = (this._loadVersion || 0) + 1
    this.setData({ loading: true })
    const familyCode = wx.getStorageSync('familyCode') || 'FAMILY'
    const current = () => !this._editUnloaded && this._loadVersion === version && this.data._id === _id &&
      (wx.getStorageSync('familyCode') || 'FAMILY') === familyCode
    return wx.cloud.callFunction({
      name: 'batchVaccine',
      data: { action: 'get', familyCode, _id }
    })
      .then(res => {
        if (!current()) return
        if (!res.result || !res.result.success) {
          throw new Error(res.result && res.result.error)
        }
        const r = res.result.data
        this.setData({
          loading: false,
          vaccineName: r.vaccineName,
          category: r.category,
          dose: r.dose,
          plannedDate: r.plannedDate,
          originalPlannedDate: r.plannedDate,
          actualDate: r.actualDate || '',
          note: r.note || '',
          isCustom: r.category === '自定义'
        })
        this._recordLoaded = true
      })
      .catch(() => {
        if (!current()) return
        this.setData({ loading: false })
        if (!this.isCurrentEdit(familyCode)) return
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
    this._plannedReset = false
    this.setData({ plannedDate: e.detail.value })
  },

  bindActualChange(e) {
    this.setData({ actualDate: e.detail.value })
  },

  bindNoteInput(e) {
    this.setData({ note: e.detail.value })
  },

  submit() {
    if (this.data.loading || this.data.saving || this._editUnloaded) return
    const familyCode = wx.getStorageSync('familyCode') || 'FAMILY'
    if (!this.isCurrentEdit(familyCode)) return
    if (this.data._id && this._recordLoaded === false) {
      wx.showToast({ title: '请先加载完整记录', icon: 'none' })
      return
    }
    if (!this.data.vaccineName.trim()) {
      wx.showToast({ title: '请输入疫苗名称', icon: 'none' })
      return
    }
    if (!this.data.plannedDate) {
      wx.showToast({ title: '请选择预计日期', icon: 'none' })
      return
    }
    if (!Number.isInteger(this.data.dose) || this.data.dose < 1) {
      wx.showToast({ title: '剂次至少为1', icon: 'none' })
      return
    }

    this.setData({ saving: true })
    wx.showLoading({ title: '保存中...', mask: true })
    const birthDate = wx.getStorageSync('babyBirthDate')
    const vaccineName = this.data.vaccineName.trim()

    const isCompleted = !!this.data.actualDate
    const isPlannedChanged = this.data.plannedDate !== this.data.originalPlannedDate && !this.data.isCustom

    const payload = {
      plannedDate: this.data.plannedDate,
      actualDate: this.data.actualDate || '',
      status: isCompleted ? 'completed' : 'planned',
      note: this.data.note.trim()
    }

    if (this._plannedReset) {
      payload.isCustomPlanned = false
    } else if (isPlannedChanged) {
      payload.isCustomPlanned = true
    }
    if (this.data.isCustom) {
      payload.vaccineName = vaccineName
      payload.dose = this.data.dose
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
          pageSnapshot.invalidate('vaccine')
          if (isCompleted && !this.data.isCustom) {
            const task = { familyCode, vaccineName, birthDate }
            this._pendingRecalculation = task
            return this.syncFollowing(task)
          }
          this.finishMutation(familyCode, '保存成功')
        })
        .catch(err => {
          if (!this._editUnloaded) this.setData({ saving: false })
          if (!this.isCurrentEdit(familyCode)) return
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
            vaccineName,
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
          pageSnapshot.invalidate('vaccine')
          this.finishMutation(familyCode, '保存成功')
        })
        .catch(err => {
          if (!this._editUnloaded) this.setData({ saving: false })
          if (!this.isCurrentEdit(familyCode)) return
          wx.hideLoading()
          console.error(err)
          wx.showToast({ title: '保存失败', icon: 'none' })
        })
    }
  },

  syncFollowing(task) {
    task.failed = false
    return this.recalculateFollowing(task.familyCode, task.vaccineName, task.birthDate).then(() => {
      if (this._pendingRecalculation !== task) return
      pageSnapshot.invalidate('vaccine')
      this._pendingRecalculation = null
      this.finishMutation(task.familyCode, '保存成功')
    }).catch(err => {
      if (this._pendingRecalculation !== task) return
      pageSnapshot.invalidate('vaccine')
      task.failed = true
      console.error(err)
      this.offerFollowingRetry(task)
    })
  },

  offerFollowingRetry(task) {
    if (this._pendingRecalculation !== task || task.dialogOpen || !this.isCurrentEdit(task.familyCode)) return
    task.dialogOpen = true
    wx.hideLoading()
    wx.showModal({
      title: '记录已保存',
      content: '后续接种日期未同步成功，可重试同步，无需重新保存这条记录。',
      confirmText: '重试同步',
      cancelText: '稍后',
      success: result => {
        task.dialogOpen = false
        if (this._pendingRecalculation !== task || !this.isCurrentEdit(task.familyCode)) return
        if (result.confirm) {
          wx.showLoading({ title: '同步中...', mask: true })
          this.syncFollowing(task)
        } else {
          this._pendingRecalculation = null
          this.finishMutation(task.familyCode, '记录已保存')
        }
      }
    })
  },

  recalculateFollowing(familyCode, vaccineName, birthDate) {
    if (!birthDate) return Promise.resolve()

    return wx.cloud.callFunction({
      name: 'batchVaccine',
      data: { action: 'list', familyCode }
    })
      .then(res => {
        if (!res.result || !res.result.success || !Array.isArray(res.result.data)) throw new Error('后续接种计划读取失败')
        const records = res.result.data
          .filter(r => r.vaccineName === vaccineName && r.category !== '自定义')
        const schedule = VACCINE_SCHEDULES.find(v => v.name === vaccineName)
        if (!schedule) return Promise.resolve()

        return Promise.all(plannedDates(records, schedule, birthDate)
          .filter(item => !item.record.actualDate && !item.record.isCustomPlanned && item.plannedDate !== item.record.plannedDate)
          .map(item => wx.cloud.callFunction({
            name: 'batchVaccine',
            data: { action: 'update', familyCode, _id: item.record._id, data: { plannedDate: item.plannedDate } }
          }).then(result => {
            if (!result.result || !result.result.success) throw new Error('后续接种日期更新失败')
          })))
      })
  },

  async resetPlanned() {
    if (this.data.loading || this.data.saving) return
    const familyCode = wx.getStorageSync('familyCode') || 'FAMILY'
    if (!this.isCurrentEdit(familyCode)) return
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

    let plannedStr = dateUtil.addMonths(birthDate, doseInfo.minAgeMonth)
    if (this.data.dose > 1) {
      const recordId = this.data._id
      this.setData({ loading: true })
      wx.showLoading({ title: '计算中...', mask: true })
      try {
        const res = await wx.cloud.callFunction({ name: 'batchVaccine', data: { action: 'list', familyCode } })
        if (!this.isCurrentEdit(familyCode) || this.data._id !== recordId) return
        if (!res.result || !res.result.success || !Array.isArray(res.result.data)) throw new Error('vaccine list failed')
        const target = { _id: recordId, dose: this.data.dose, plannedDate: plannedStr, isCustomPlanned: false }
        const previous = res.result.data
          .filter(record => record.vaccineName === this.data.vaccineName && record.category !== '自定义' &&
            record.dose < this.data.dose)
        plannedStr = plannedDates(previous.concat(target), schedule, birthDate).find(item => item.record === target).plannedDate
      } catch (err) {
        if (this.isCurrentEdit(familyCode)) wx.showToast({ title: '恢复失败，请重试', icon: 'none' })
        return
      } finally {
        if (!this._editUnloaded) this.setData({ loading: false })
        if (this.isCurrentEdit(familyCode)) wx.hideLoading()
      }
    }

    if (!this.isCurrentEdit(familyCode)) return
    this._plannedReset = true
    this.setData({ plannedDate: plannedStr })
    wx.showToast({ title: '已恢复系统预计日期', icon: 'none' })
  },

  deleteRecord() {
    if (!this.data._id || this.data.saving || this._recordLoaded === false) return
    const familyCode = wx.getStorageSync('familyCode') || 'FAMILY'
    if (!this.isCurrentEdit(familyCode)) return
    wx.showModal({
      title: '确认删除',
      content: '删除后无法恢复，确定吗？',
      confirmColor: '#ff4d4f',
      success: (res) => {
        if (res.confirm) {
          if (this.data.saving || !this.isCurrentEdit(familyCode)) return
          this.setData({ saving: true })
          wx.showLoading({ title: '删除中...', mask: true })
          wx.cloud.callFunction({
            name: 'batchVaccine',
            data: { action: 'remove', familyCode, _id: this.data._id }
          })
            .then(res => {
              if (res.result && res.result.success) {
                pageSnapshot.invalidate('vaccine')
                this.finishMutation(familyCode, '已删除')
              } else {
                if (!this._editUnloaded) this.setData({ saving: false })
                if (!this.isCurrentEdit(familyCode)) return
                wx.hideLoading()
                wx.showToast({ title: '删除失败', icon: 'none' })
              }
            })
            .catch(() => {
              if (!this._editUnloaded) this.setData({ saving: false })
              if (!this.isCurrentEdit(familyCode)) return
              wx.hideLoading()
              wx.showToast({ title: '删除失败', icon: 'none' })
            })
        }
      }
    })
  }
})
