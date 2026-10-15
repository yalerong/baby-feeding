const dateUtil = require('../../utils/date.js')
const milestones = require('../../utils/developmentMilestones.js')

Page({
  data: {
    ageText: '', ageMonths: null, selectedMonth: 6,
    groups: [], total: 0, recordedCount: 0, stageHint: '', activities: [],
    loading: true, loadError: false, saving: false,
    editor: null, statusOptions: milestones.STATUS_OPTIONS, today: ''
  },

  onShow() {
    if (this.data.saving || this.data.editor) return
    const today = dateUtil.todayStr()
    const birthDate = wx.getStorageSync('babyBirthDate') || ''
    const ageMonths = birthDate ? dateUtil.monthsBetween(birthDate, today) : null
    this._familyCode = wx.getStorageSync('familyCode') || 'FAMILY'
    this._records = []
    this.setData({
      today, ageMonths, ageText: birthDate ? dateUtil.ageText(birthDate, today) : '',
      selectedMonth: milestones.getReferenceMonth(ageMonths), editor: null
    })
    this.renderChecklist()
    return this.loadRecords()
  },

  onUnload() {
    this._unloaded = true
    this._loadVersion = (this._loadVersion || 0) + 1
  },

  async onPullDownRefresh() {
    try {
      if (!this.data.saving && !this.data.editor) await this.loadRecords()
    } finally {
      wx.stopPullDownRefresh()
    }
  },

  async loadRecords() {
    if (this.data.saving || this.data.editor) return
    const version = (this._loadVersion || 0) + 1
    this._loadVersion = version
    this.setData({ loading: true, loadError: false })
    try {
      const res = await wx.cloud.callFunction({
        name: 'milestoneRecord', data: { action: 'list', familyCode: this._familyCode }
      })
      if (!res.result || !res.result.success || !Array.isArray(res.result.data)) throw new Error('load failed')
      if (version !== this._loadVersion) return
      this._records = res.result.data
      this.renderChecklist()
    } catch (err) {
      if (version === this._loadVersion) this.setData({ loadError: true })
    } finally {
      if (version === this._loadVersion) this.setData({ loading: false })
    }
  },

  renderChecklist() {
    const { selectedMonth, ageMonths } = this.data
    let stageHint = `${selectedMonth}个月节点的日常观察参考。已记录项目数不代表能力评分。`
    if (ageMonths === null) stageHint = '请先在首页设置宝宝生日；目前可手动查看6、9、12个月清单。'
    else if (ageMonths < selectedMonth) stageHint = `下一阶段预览：宝宝目前无需提前完成${selectedMonth}个月清单。`
    else if (ageMonths >= 15) stageHint = '这里收录的是6、9、12个月历史参考，请结合当前月龄继续进行儿保随访。'
    this.setData({
      ...milestones.buildChecklist(selectedMonth, this._records), stageHint,
      activities: milestones.getActivities(ageMonths, selectedMonth, this._records)
    })
  },

  selectMonth(e) {
    const selectedMonth = Number(e.currentTarget.dataset.month)
    if (this.data.saving || !milestones.CHECKLISTS[selectedMonth]) return
    this.setData({ selectedMonth, editor: null })
    this.renderChecklist()
  },

  openObservation(e) {
    if (this.data.loading || this.data.loadError || this.data.saving) return
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
    if (!editor || this.data.saving) return
    if (!editor.status) {
      wx.showToast({ title: '请选择观察结果', icon: 'none' })
      return
    }
    const record = {
      milestoneId: editor.id, status: editor.status,
      observedDate: editor.observedDate, note: editor.note || ''
    }
    this.setData({ saving: true })
    try {
      const res = await wx.cloud.callFunction({
        name: 'milestoneRecord', data: { action: 'set', familyCode: this._familyCode, ...record }
      })
      if (!res.result || !res.result.success) throw new Error('save failed')
      if (this._unloaded) return
      this._records = this._records.filter(row => row.milestoneId !== record.milestoneId).concat(record)
      this.renderChecklist()
      this.setData({ editor: null })
      wx.showToast({ title: '已保存', icon: 'success' })
    } catch (err) {
      if (!this._unloaded) wx.showToast({ title: '保存失败，请重试', icon: 'none' })
    } finally {
      if (!this._unloaded) this.setData({ saving: false })
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
    if (this.data.loading || this.data.loadError) return
    wx.setClipboardData({
      data: milestones.buildObservationSummary(this.data.selectedMonth, this._records, this.data)
    })
  }
})
