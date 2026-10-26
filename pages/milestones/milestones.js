const dateUtil = require('../../utils/date.js')
const milestones = require('../../utils/developmentMilestones.js')
const pageSnapshot = require('../../utils/pageSnapshot.js')
const groupIcons = { social: '♡', language: '♪', cognitive: '✦', motor: '↗' }
const statusDescriptions = {
  yes: '在日常互动中见过这个表现',
  notYet: '有机会观察，暂时还没见到',
  unsure: '还没机会观察，或暂时拿不准'
}

Page({
  data: {
    ageText: '', ageMonths: null, selectedMonth: 6,
    groups: [], total: 0, recordedCount: 0, stageHint: '', activities: [],
    expandedGroups: { social: true },
    loading: true, refreshing: false, hasSnapshot: false, loadError: false, saving: false,
    editor: null,
    statusOptions: milestones.STATUS_OPTIONS.map(option => ({ ...option, description: statusDescriptions[option.value] })),
    today: ''
  },

  onShow() {
    const today = dateUtil.todayStr()
    const birthDate = wx.getStorageSync('babyBirthDate') || ''
    const ageMonths = birthDate ? dateUtil.monthsBetween(birthDate, today) : null
    const familyCode = wx.getStorageSync('familyCode') || 'FAMILY'
    const key = pageSnapshot.key({ familyCode, birthDate })
    const changedContext = this._milestoneKey !== key
    this._milestoneVisible = true
    this._unloaded = false
    this._familyCode = familyCode
    this._birthDate = birthDate
    this._milestoneKey = key
    if (changedContext) {
      this._loadVersion = (this._loadVersion || 0) + 1
      const cached = pageSnapshot.read('milestones', key)
      this._records = cached !== null ? cached : []
      this._recordsKey = cached !== null ? key : null
    }
    const task = this._saveTask
    const sameSave = task && task.key === key
    const saving = !!(sameSave && !task.done)
    const saved = sameSave && task.done && task.success && !task.reconciled
    if (saved) {
      this._records = (this._records || []).filter(row => row.milestoneId !== task.record.milestoneId).concat(task.record)
      task.reconciled = true
    }
    this.setData({
      today, ageMonths, ageText: birthDate ? dateUtil.ageText(birthDate, today) : '',
      selectedMonth: changedContext ? milestones.getReferenceMonth(ageMonths) : this.data.selectedMonth,
      editor: changedContext || saved ? null : this.data.editor,
      saving, hasSnapshot: this._recordsKey === key,
      ...(changedContext ? { loading: this._recordsKey !== key, refreshing: false, loadError: false, expandedGroups: { social: true } } : {})
    })
    this.renderChecklist()
    // 同家庭的未保存编辑仍由用户保留；不让刷新覆盖正在填写或提交的观察。
    if (this.data.saving || this.data.editor) return
    return this.loadRecords()
  },

  onHide() {
    this._milestoneVisible = false
    this._loadVersion = (this._loadVersion || 0) + 1
  },

  onUnload() {
    this._unloaded = true
    this.onHide()
  },

  isMilestoneContextCurrent(key, version) {
    return this._milestoneVisible && !this._unloaded && this._milestoneKey === key &&
      (version === undefined || version === this._loadVersion) &&
      (wx.getStorageSync('familyCode') || 'FAMILY') === this._familyCode &&
      (wx.getStorageSync('babyBirthDate') || '') === this._birthDate
  },

  async onPullDownRefresh() {
    try {
      if (!this.data.saving && !this.data.editor) await this.loadRecords()
    } finally {
      if (this._milestoneVisible && !this._unloaded) wx.stopPullDownRefresh()
    }
  },

  async loadRecords() {
    const key = this._milestoneKey
    if (!this.isMilestoneContextCurrent(key) || this.data.saving || this.data.editor) return
    const version = (this._loadVersion || 0) + 1
    this._loadVersion = version
    this.setData({ loading: !this.data.hasSnapshot, refreshing: this.data.hasSnapshot, loadError: false })
    try {
      const res = await wx.cloud.callFunction({
        name: 'milestoneRecord', data: { action: 'list', familyCode: this._familyCode }
      })
      if (!res.result || !res.result.success || !Array.isArray(res.result.data)) throw new Error('load failed')
      if (!this.isMilestoneContextCurrent(key, version) || this.data.saving || this.data.editor) return
      this._records = res.result.data
      this._recordsKey = key
      pageSnapshot.write('milestones', key, this._records)
      this.setData({ hasSnapshot: true })
      this.renderChecklist()
    } catch (err) {
      if (this.isMilestoneContextCurrent(key, version)) this.setData({ loadError: true })
    } finally {
      if (this.isMilestoneContextCurrent(key, version)) this.setData({ loading: false, refreshing: false })
    }
  },

  renderChecklist() {
    const { selectedMonth, ageMonths } = this.data
    const checklist = milestones.buildChecklist(selectedMonth, this._records)
    checklist.groups.forEach(group => {
      group.recordedCount = group.items.filter(item => item.status).length
      group.icon = groupIcons[group.id]
    })
    let stageHint = `按${selectedMonth}个月清单，留意日常互动中的小变化。`
    if (ageMonths === null) stageHint = '请先在首页设置宝宝生日；目前可手动查看6、9、12个月清单。'
    else if (ageMonths < selectedMonth) stageHint = `下一阶段预览：先了解就好，无需提前完成${selectedMonth}个月清单。`
    else if (ageMonths >= 15) stageHint = '这里收录的是6、9、12个月历史参考，请结合当前月龄继续进行儿保随访。'
    this.setData({
      ...checklist, stageHint,
      activities: milestones.getActivities(ageMonths, selectedMonth, this._records)
    })
  },

  selectMonth(e) {
    const selectedMonth = Number(e.currentTarget.dataset.month)
    if (this.data.saving || !milestones.CHECKLISTS[selectedMonth]) return
    this.setData({ selectedMonth, editor: null, expandedGroups: { social: true } })
    this.renderChecklist()
  },

  toggleGroup(e) {
    const id = e.currentTarget.dataset.id
    if (!this.data.groups.some(group => group.id === id)) return
    this.setData({ expandedGroups: { ...this.data.expandedGroups, [id]: !this.data.expandedGroups[id] } })
  },

  openObservation(e) {
    if (!this.isMilestoneContextCurrent(this._milestoneKey) || this.data.loading || this.data.refreshing || this.data.loadError || this.data.saving) return
    const id = e.currentTarget.dataset.id
    const item = this.data.groups.reduce((all, group) => all.concat(group.items), []).find(row => row.id === id)
    if (!item) return
    this.setData({ editor: { ...item, observedDate: item.observedDate || this.data.today } })
  },

  closeEditor() {
    if (!this.data.saving) this.setData({ editor: null })
  },

  stopTap() {},

  selectStatus(e) {
    if (this.data.saving || !this.data.editor) return
    const status = e.currentTarget.dataset.status
    if (!milestones.STATUS_OPTIONS.some(option => option.value === status)) return
    this.setData({ editor: { ...this.data.editor, status } })
  },

  onNoteInput(e) {
    if (!this.data.saving && this.data.editor) {
      this.setData({ editor: { ...this.data.editor, note: e.detail.value } })
    }
  },

  onDateChange(e) {
    if (!this.data.saving && this.data.editor) {
      this.setData({ editor: { ...this.data.editor, observedDate: e.detail.value } })
    }
  },

  async saveObservation() {
    const editor = this.data.editor
    if (!editor || !this.isMilestoneContextCurrent(this._milestoneKey) || this.data.loading || this.data.refreshing || this.data.loadError || this.data.saving) return
    if (!editor.status) {
      wx.showToast({ title: '请选择观察结果', icon: 'none' })
      return
    }
    const record = {
      milestoneId: editor.id, status: editor.status,
      observedDate: editor.observedDate, note: editor.note || ''
    }
    const task = { key: this._milestoneKey, familyCode: this._familyCode, record, done: false, success: false }
    this._saveTask = task
    this.setData({ saving: true })
    try {
      const res = await wx.cloud.callFunction({
        name: 'milestoneRecord', data: { action: 'set', familyCode: task.familyCode, ...record }
      })
      if (!res.result || !res.result.success) throw new Error('save failed')
      task.success = true
      pageSnapshot.invalidate('milestones')
      if (!this.isMilestoneContextCurrent(task.key) || this._saveTask !== task) return
      this._records = this._records.filter(row => row.milestoneId !== record.milestoneId).concat(record)
      task.reconciled = true
      pageSnapshot.write('milestones', task.key, this._records)
      this.renderChecklist()
      this.setData({ editor: null })
      wx.showToast({ title: '已保存', icon: 'success' })
    } catch (err) {
      if (this.isMilestoneContextCurrent(task.key) && this._saveTask === task) wx.showToast({ title: '保存失败，请重试', icon: 'none' })
    } finally {
      task.done = true
      if (this.isMilestoneContextCurrent(task.key) && this._saveTask === task) this.setData({ saving: false })
    }
  },

  copySource() {
    wx.setClipboardData({
      data: milestones.getSourceUrl(this.data.selectedMonth)
    })
  },

  copyActivitySource() {
    wx.setClipboardData({ data: milestones.getSourceUrl(this.data.selectedMonth, 'activities') })
  },

  copySummary() {
    if (!this.isMilestoneContextCurrent(this._milestoneKey) || this.data.loading || this.data.refreshing || this.data.loadError || this.data.saving) return
    wx.setClipboardData({
      data: milestones.buildObservationSummary(this.data.selectedMonth, this._records, this.data)
    })
  }
})
