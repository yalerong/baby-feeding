const dateUtil = require('../../utils/date.js')
const menuData = require('../../utils/menuData.js')
const familyRecordSync = require('../../utils/familyRecordSync.js')

Page({
  data: {
    birthDate: '',
    today: '',
    weekStart: '',
    monthStart: '',
    monthLabel: '',
    ageMonth: 0,
    currentAgeMonth: 0,
    isFuturePlan: false,
    planningNotice: '',
    viewMode: 'week',
    currentPlan: null,
    monthlyPlan: null,
    selectedDay: null,
    selectedDayIndex: 0,
    weekDays: [],
    hallDishes: [],
    hallContext: null,
    catalogDishes: [],
    catalogFilters: { ageRange: 'all', mealType: 'all', nutritionTag: 'all' },
    ageFilters: [
      { label: '全部月龄', value: 'all' },
      { label: '6月龄', value: '6' },
      { label: '7-8月龄', value: '7-8' },
      { label: '9-11月龄', value: '9-11' },
      { label: '12月龄+', value: '12+' }
    ],
    mealFilters: [
      { label: '全部餐次', value: 'all' },
      { label: '早餐', value: 'breakfast' },
      { label: '午餐', value: 'lunch' },
      { label: '晚餐', value: 'dinner' },
      { label: '加餐', value: 'snack' }
    ],
    nutritionFilters: [
      { label: '全部营养', value: 'all' },
      { label: '富铁', value: '富铁' },
      { label: '蛋白', value: '蛋白' },
      { label: '主食', value: '主食' },
      { label: '蔬菜', value: '蔬菜' },
      { label: '水果', value: '水果' }
    ],
    mealTypes: [],
    mealLabels: menuData.MEAL_LABELS,
    savedDocId: '',
    dirty: false,
    loading: false
  },

  onShow() {
    const today = dateUtil.todayStr()
    const birthDate = wx.getStorageSync('babyBirthDate') || ''
    const defaultWeekStart = birthDate
      ? menuData.getDefaultPlanningWeekStart({ birthDate, today })
      : this.getWeekStart(today)
    const weekStart = this.data.weekStart || defaultWeekStart
    const monthStart = this.data.monthStart || this.getMonthStart(weekStart)
    const currentAgeMonth = birthDate ? dateUtil.monthsBetween(birthDate, today) : 0
    this.setData({
      today,
      birthDate,
      weekStart,
      monthStart,
      monthLabel: this.getMonthLabel(monthStart),
      currentAgeMonth
    })
    this.loadWeek(weekStart)
    this.buildMonth(monthStart)
  },

  onHide() {
    this.stopMenuSync()
  },

  onUnload() {
    this.stopMenuSync()
  },

  getWeekStart(dateStr) {
    const parts = dateStr.split('-').map(n => parseInt(n, 10))
    const d = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]))
    const day = d.getUTCDay() || 7
    return dateUtil.addDays(dateStr, 1 - day)
  },

  getMonthStart(dateStr) {
    return dateStr.substring(0, 8) + '01'
  },

  getMonthLabel(dateStr) {
    return dateStr.substring(0, 7)
  },

  getDraftKey(weekStart) {
    return `menuDraft:${weekStart}`
  },

  switchView(e) {
    this.setData({ viewMode: e.currentTarget.dataset.mode })
  },

  loadWeek(weekStart) {
    this.stopMenuSync()
    if (!this.data.birthDate) {
      this.setData({ currentPlan: null, savedDocId: '', dirty: false, catalogDishes: menuData.getDishCatalog() })
      this.updatePlanningNotice(null)
      return
    }

    this.setData({ loading: true })
    const generated = menuData.generateWeeklyMenu({
      birthDate: this.data.birthDate,
      weekStart
    })

    if (generated.status === 'milk_only') {
      this.setData({
        currentPlan: this.decoratePlan(generated),
        ageMonth: generated.ageMonth,
        savedDocId: '',
        dirty: false,
        loading: false
      }, () => {
        this.updatePlanningNotice(this.data.currentPlan)
        this.syncSelectedDay(0)
        this.buildCatalog(generated.ageMonth)
      })
      return
    }

    const familyCode = wx.getStorageSync('familyCode') || 'FAMILY'
    wx.cloud.callFunction({
      name: 'weeklyMenu',
      data: { action: 'get', familyCode, weekStart }
    })
      .then(res => {
        if (!res.result || !res.result.success) {
          throw new Error(res.result && res.result.error)
        }
        const saved = res.result.data
        const draft = wx.getStorageSync(this.getDraftKey(weekStart))
        this.applyLoadedWeek(generated, saved, draft)
        this.startMenuSync(familyCode, weekStart, generated)
      })
      .catch(err => {
        console.error(err)
        const plan = this.decoratePlan(generated)
        this.setData({
          currentPlan: plan,
          ageMonth: generated.ageMonth,
          savedDocId: '',
          dirty: false,
          loading: false
        }, () => {
          this.updatePlanningNotice(plan)
          this.syncSelectedDay(this.getDefaultDayIndex(plan))
          this.buildCatalog(plan.ageMonth)
        })
        wx.showToast({ title: '使用本地推荐', icon: 'none' })
      })
  },

  applyLoadedWeek(generated, saved, draft) {
    const plan = draft || (saved ? this.mergeSavedPlan(generated, saved) : this.decoratePlan(generated))
    this.setData({
      currentPlan: plan,
      ageMonth: plan.ageMonth,
      savedDocId: saved ? saved._id : '',
      dirty: !!draft,
      loading: false
    }, () => {
      this.updatePlanningNotice(plan)
      this.syncSelectedDay(this.getDefaultDayIndex(plan))
      this.buildCatalog(plan.ageMonth)
    })
  },

  startMenuSync(familyCode, weekStart, generated) {
    if (!familyRecordSync.shouldSyncFamilyRecords({ familyCode }) || !weekStart) {
      this.stopMenuSync()
      return
    }

    const key = familyRecordSync.getFamilySyncKey({ familyCode, date: weekStart })
    if (this._menuSyncKey === key) return

    this.stopMenuSync()
    this._menuSyncKey = key
    try {
      if (!wx.cloud || !wx.cloud.database) return
      const db = wx.cloud.database()
      this._menuWatcher = db.collection('weekly_menus')
        .where({ familyCode, weekStart })
        .watch({
          onChange: snapshot => {
            if (this._menuSyncKey !== key || this.data.dirty) return
            const saved = familyRecordSync.recordsFromWatchSnapshot(snapshot)[0] || null
            this.applyLoadedWeek(generated, saved, null)
          },
          onError: err => {
            console.error(err)
          }
        })
    } catch (err) {
      console.error(err)
    }
  },

  stopMenuSync() {
    this._menuSyncKey = ''
    if (this._menuWatcher) {
      this._menuWatcher.close()
      this._menuWatcher = null
    }
  },

  mergeSavedPlan(generated, saved) {
    return this.decoratePlan({
      ...generated,
      days: saved.days || generated.days,
      nutritionSummary: saved.nutritionSummary || generated.nutritionSummary,
      note: saved.note || ''
    })
  },

  decoratePlan(plan) {
    if (!plan) return plan
    const nutritionList = Object.keys(plan.nutritionSummary || {}).map(name => ({
      name,
      count: plan.nutritionSummary[name]
    }))
    return { ...plan, nutritionList }
  },

  buildCatalog(ageMonth) {
    const catalogDishes = menuData.getDishCatalog(this.data.catalogFilters).map(dish => ({
      ...dish,
      isForPlanAge: ageMonth >= dish.ageMinMonth && ageMonth <= dish.ageMaxMonth
    }))
    catalogDishes.sort((a, b) => {
      if (a.isForPlanAge !== b.isForPlanAge) return a.isForPlanAge ? -1 : 1
      return a.ageMinMonth - b.ageMinMonth
    })
    this.setData({ catalogDishes })
  },

  enterCatalog() {
    this.buildCatalog(this.data.ageMonth)
    this.setData({ viewMode: 'catalog' })
  },

  closeCatalog() {
    this.setData({ viewMode: 'week' })
  },

  setCatalogFilter(e) {
    const { type, value } = e.currentTarget.dataset
    const catalogFilters = { ...this.data.catalogFilters, [type]: value }
    this.setData({ catalogFilters }, () => {
      this.buildCatalog(this.data.ageMonth)
    })
  },

  getWeekdayLabel(dateStr) {
    const names = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
    const parts = dateStr.split('-').map(n => parseInt(n, 10))
    const d = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]))
    return names[d.getUTCDay()]
  },

  getDefaultDayIndex(plan) {
    if (!plan || !plan.days || plan.days.length === 0) return 0
    const todayIndex = plan.days.findIndex(day => day.date === this.data.today)
    return todayIndex >= 0 ? todayIndex : 0
  },

  syncSelectedDay(dayIndex) {
    const plan = this.data.currentPlan
    if (!plan || !plan.days || plan.days.length === 0) {
      this.setData({ selectedDay: null, weekDays: [], mealTypes: [] })
      return
    }
    const safeIndex = Math.max(0, Math.min(dayIndex, plan.days.length - 1))
    const rawSelectedDay = plan.days[safeIndex]
    const selectedDay = {
      ...rawSelectedDay,
      shortDate: rawSelectedDay.date.substring(5),
      weekday: this.getWeekdayLabel(rawSelectedDay.date)
    }
    const weekDays = plan.days.map((day, index) => ({
      ...day,
      shortDate: day.date.substring(5),
      weekday: this.getWeekdayLabel(day.date),
      selected: index === safeIndex
    }))
    this.setData({
      selectedDay,
      selectedDayIndex: safeIndex,
      weekDays,
      mealTypes: Object.keys(selectedDay.meals || {})
    })
  },

  selectDay(e) {
    this.syncSelectedDay(parseInt(e.currentTarget.dataset.index, 10) || 0)
  },

  updatePlanningNotice(plan) {
    if (!plan || !this.data.birthDate) {
      this.setData({ isFuturePlan: false, planningNotice: '' })
      return
    }
    const isFuturePlan = dateUtil.compareDates(plan.weekStart, this.data.today) > 0
    const planningNotice = isFuturePlan
      ? `宝宝现在约 ${this.data.currentAgeMonth} 月龄，这里展示的是 ${plan.ageMonth} 月龄的提前规划菜单，可以先编辑保存。`
      : ''
    this.setData({ isFuturePlan, planningNotice })
  },

  buildMonth(monthStart) {
    if (!this.data.birthDate) {
      this.setData({ monthlyPlan: null })
      return
    }
    const monthlyPlan = menuData.generateMonthlyMenu({
      birthDate: this.data.birthDate,
      monthStart
    })
    this.setData({ monthlyPlan })
  },

  prevWeek() {
    const weekStart = dateUtil.addDays(this.data.weekStart, -7)
    this.setData({ weekStart })
    this.loadWeek(weekStart)
  },

  nextWeek() {
    const weekStart = dateUtil.addDays(this.data.weekStart, 7)
    this.setData({ weekStart })
    this.loadWeek(weekStart)
  },

  onWeekChange(e) {
    const weekStart = this.getWeekStart(e.detail.value)
    this.setData({ weekStart })
    this.loadWeek(weekStart)
  },

  onMonthChange(e) {
    const monthStart = this.getMonthStart(e.detail.value)
    this.setData({ monthStart, monthLabel: this.getMonthLabel(monthStart) })
    this.buildMonth(monthStart)
  },

  openWeek(e) {
    const weekStart = e.currentTarget.dataset.week
    this.setData({ weekStart, viewMode: 'week' })
    this.loadWeek(weekStart)
  },

  openDish(e) {
    const { mealType, dishIndex } = e.currentTarget.dataset
    const dayIndex = this.data.selectedDayIndex
    if (this.data.dirty && this.data.currentPlan) {
      wx.setStorageSync(this.getDraftKey(this.data.weekStart), this.data.currentPlan)
    }
    wx.navigateTo({
      url: `/pages/menuDish/menuDish?weekStart=${this.data.weekStart}&dayIndex=${dayIndex}&mealType=${mealType}&dishIndex=${dishIndex}`
    })
  },

  replaceDish(e) {
    const { mealType, dishIndex } = e.currentTarget.dataset
    const dayIndex = this.data.selectedDayIndex
    const plan = this.data.currentPlan
    const current = plan.days[dayIndex].meals[mealType][dishIndex]
    const hallDishes = menuData.getDishesFor(plan.ageMonth, mealType).map(dish => ({
      ...dish,
      ingredientsLabel: dish.ingredients.join('、'),
      isCurrent: current && dish.id === current.id
    }))
    this.setData({
      viewMode: 'hall',
      hallDishes,
      hallContext: {
        dayIndex,
        mealType,
        dishIndex,
        currentDishId: current ? current.id : '',
        mealLabel: this.data.mealLabels[mealType]
      }
    })
  },

  closeHall() {
    this.setData({ viewMode: 'week', hallDishes: [], hallContext: null })
  },

  chooseHallDish(e) {
    const id = e.currentTarget.dataset.id
    const dish = menuData.getDishById(id)
    const context = this.data.hallContext
    if (!dish || !context) return

    const plan = this.data.currentPlan
    const selected = JSON.parse(JSON.stringify(dish))
    plan.days[context.dayIndex].meals[context.mealType].splice(context.dishIndex, 1, selected)
    plan.nutritionSummary = this.calculateNutrition(plan.days)
    const draft = this.decoratePlan(plan)
    wx.setStorageSync(this.getDraftKey(this.data.weekStart), draft)
    this.setData({
      currentPlan: draft,
      dirty: true,
      viewMode: 'week',
      hallDishes: [],
      hallContext: null
    }, () => {
      this.syncSelectedDay(context.dayIndex)
    })
  },

  calculateNutrition(days) {
    const summary = {}
    days.forEach(day => {
      Object.keys(day.meals || {}).forEach(type => {
        ;(day.meals[type] || []).forEach(dish => {
          dish.nutritionTags.forEach(tag => {
            summary[tag] = (summary[tag] || 0) + 1
          })
        })
      })
    })
    return summary
  },

  regenerateWeek() {
    wx.showModal({
      title: '重新生成',
      content: '会覆盖本周未保存的修改，确定重新生成推荐菜单吗？',
      success: res => {
        if (!res.confirm) return
        const plan = menuData.generateWeeklyMenu({
          birthDate: this.data.birthDate,
          weekStart: this.data.weekStart
        })
        const draft = this.decoratePlan(plan)
        wx.setStorageSync(this.getDraftKey(this.data.weekStart), draft)
        this.setData({ currentPlan: draft, ageMonth: plan.ageMonth, dirty: true }, () => {
          this.syncSelectedDay(this.getDefaultDayIndex(draft))
        })
      }
    })
  },

  saveWeek() {
    const plan = this.data.currentPlan
    if (!plan || plan.status !== 'ready') {
      wx.showToast({ title: '暂无可保存菜单', icon: 'none' })
      return
    }

    wx.showLoading({ title: '保存中...', mask: true })
    const familyCode = wx.getStorageSync('familyCode') || 'FAMILY'
    const data = {
      ageMonth: plan.ageMonth,
      stage: plan.stage,
      days: plan.days,
      nutritionSummary: plan.nutritionSummary
    }

    wx.cloud.callFunction({
      name: 'weeklyMenu',
      data: { action: 'save', familyCode, weekStart: plan.weekStart, data }
    }).then(res => {
      wx.hideLoading()
      if (!res.result || !res.result.success) {
        throw new Error(res.result && res.result.error)
      }
      wx.removeStorageSync(this.getDraftKey(plan.weekStart))
      this.setData({ savedDocId: res.result._id || this.data.savedDocId, dirty: false })
      wx.showToast({ title: '已保存', icon: 'success' })
    }).catch(err => {
      wx.hideLoading()
      console.error(err)
      wx.showToast({ title: '保存失败，请检查 weekly_menus 集合', icon: 'none' })
    })
  }
})
