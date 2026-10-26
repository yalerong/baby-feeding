const dateUtil = require('../../utils/date.js')
const menuData = require('../../utils/menuData.js')
const familyRecordSync = require('../../utils/familyRecordSync.js')
const foodUnlock = require('../../utils/foodUnlock.js')
const menuRefresh = require('../../utils/menuRefresh.js')
const menuStorage = require('../../utils/menuStorage.js')
const trialMethods = require('./trial.js')
const libraryMethods = require('./library.js')

Page(Object.assign({}, trialMethods, libraryMethods, {
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
    loading: false,
    foodTrials: [],
    trialFoods: [],
    unlockedFoodCount: 0,
    activeTrialFood: '',
    excludedIngredients: [],
    unlockedFoods: null,
    guideVisible: false,
    guidePosition: 'top',
    foodTrialError: '',
    customFoodInput: '',
    trialMode: 'strict',
    trialModes: foodUnlock.TRIAL_MODES,
    libraryDishes: [],
    hallLibraryDishes: [],
    unlockNotice: null,
    trialActionBusy: false
  },

  onShow() {
    const today = dateUtil.todayStr()
    const familyCode = wx.getStorageSync('familyCode') || 'FAMILY'
    const birthDate = wx.getStorageSync('babyBirthDate') || ''
    const contextChanged = this._menuFamilyCode !== familyCode || this.data.birthDate !== birthDate
    this._menuVersion = (this._menuVersion || 0) + 1
    this._menuHidden = false
    this._menuFamilyCode = familyCode
    const defaultWeekStart = birthDate
      ? menuData.getDefaultPlanningWeekStart({ birthDate, today })
      : this.getWeekStart(today)
    const weekStart = (!contextChanged && this.data.weekStart) || defaultWeekStart
    const monthStart = (!contextChanged && this.data.monthStart) || this.getMonthStart(weekStart)
    const currentAgeMonth = birthDate ? dateUtil.monthsBetween(birthDate, today) : 0
    if (contextChanged) {
      this._foodTrialsReady = null
      this._monthSignature = ''
      this._catalogSignature = ''
      this.setData({
        currentPlan: null, monthlyPlan: null, selectedDay: null, selectedDayIndex: 0, weekDays: [], mealTypes: [],
        ageMonth: 0, isFuturePlan: false, planningNotice: '', customFoodInput: '', trialActionBusy: false,
        savedDocId: '', dirty: false, unlockNotice: null, hallContext: null,
        foodTrials: [], trialFoods: [], excludedIngredients: [], unlockedFoods: null,
        libraryDishes: [], hallLibraryDishes: [], hallDishes: [], catalogDishes: [],
        unlockedFoodCount: 0, activeTrialFood: '', foodTrialError: '', trialMode: 'strict'
      })
    }
    this.setData({
      today,
      birthDate,
      weekStart,
      monthStart,
      monthLabel: this.getMonthLabel(monthStart),
      currentAgeMonth,
      guideVisible: !wx.getStorageSync('menuGuideDismissed'),
      guidePosition: wx.getStorageSync('menuGuidePosition') === 'bottom' ? 'bottom' : 'top'
    })
    const context = this.captureMenuContext()
    this.loadLibraryDishes()
    const trialsReady = this.loadFoodTrials()
    const weekReady = this.loadWeek(weekStart, trialsReady)
    trialsReady.then(() => {
      if (this.isMenuContextCurrent(context)) this.buildMonth(this.data.monthStart)
    })
    return weekReady
  },

  onHide() {
    this._menuHidden = true
    this._menuVersion = (this._menuVersion || 0) + 1
    this.stopMenuSync()
  },

  onUnload() {
    this.onHide()
  },

  captureMenuContext() {
    return {
      version: this._menuVersion || 0,
      familyCode: wx.getStorageSync('familyCode') || 'FAMILY',
      birthDate: this.data.birthDate
    }
  },

  isMenuContextCurrent(context) {
    return !this._menuHidden && (this._menuVersion || 0) === context.version &&
      (wx.getStorageSync('familyCode') || 'FAMILY') === context.familyCode &&
      this.data.birthDate === context.birthDate
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

  getDraftKey(weekStart, familyCode = wx.getStorageSync('familyCode') || 'FAMILY') {
    return menuStorage.draftKey(familyCode, weekStart)
  },

  // 打开菜品详情前把当前看到的整周菜单存下来，详情页照这份显示，不再各自重新生成
  getPlanCacheKey(weekStart, familyCode = wx.getStorageSync('familyCode') || 'FAMILY') {
    return menuStorage.planKey(familyCode, weekStart)
  },

  dismissGuide() {
    wx.setStorageSync('menuGuideDismissed', true)
    this.setData({ guideVisible: false })
  },

  toggleGuidePosition() {
    const guidePosition = this.data.guidePosition === 'top' ? 'bottom' : 'top'
    wx.setStorageSync('menuGuidePosition', guidePosition)
    this.setData({ guidePosition })
  },

  switchView(e) {
    const viewMode = e.currentTarget.dataset.mode
    // 点「本周」始终回到当前规划周，避免从月视图跳去别的周后回不来
    if (viewMode === 'week' && this.data.birthDate) {
      const defaultWeekStart = menuData.getDefaultPlanningWeekStart({ birthDate: this.data.birthDate, today: this.data.today })
      if (defaultWeekStart !== this.data.weekStart) {
        this.setData({ viewMode, weekStart: defaultWeekStart })
        this.loadWeek(defaultWeekStart)
        return
      }
    }
    this.setData({ viewMode })
    if (viewMode === 'trial' && !this._trialLoading) this.buildTrialFoods()
    if (viewMode === 'month') this.buildMonth(this.data.monthStart)
  },

  loadWeek(weekStart, trialsReady) {
    if (this._menuHidden) return Promise.resolve()
    const context = this.captureMenuContext()
    const requestVersion = (this._weekRequestVersion || 0) + 1
    this._weekRequestVersion = requestVersion
    const isCurrent = () => this.isMenuContextCurrent(context) &&
      this._weekRequestVersion === requestVersion && this.data.weekStart === weekStart
    this.stopMenuSync()
    if (!this.data.birthDate) {
      this.setData({ currentPlan: null, savedDocId: '', dirty: false, loading: false })
      this.updatePlanningNotice(null)
      return Promise.resolve()
    }

    const patch = { loading: !this.data.currentPlan, unlockNotice: null }
    if (this.data.currentPlan && this.data.currentPlan.weekStart !== weekStart) {
      Object.assign(patch, { currentPlan: null, selectedDay: null, weekDays: [], mealTypes: [], savedDocId: '', dirty: false, loading: true })
    }
    this.setData(patch)
    const milkOnly = dateUtil.compareDates(dateUtil.addDays(weekStart, 6), dateUtil.addMonths(context.birthDate, 6)) < 0
    const savedRequest = milkOnly
      ? Promise.resolve({ result: { success: true, data: null } })
      : wx.cloud.callFunction({ name: 'weeklyMenu', data: { action: 'get', familyCode: context.familyCode, weekStart } })
    // 读取可并行，菜单生成仍要等待试吃结果，避免短暂显示未排除过敏食材的推荐。
    return Promise.all([
      trialsReady || this._foodTrialsReady || Promise.resolve(),
      savedRequest.then(res => ({ res }), error => ({ error }))
    ]).then(([trialsApplied, response]) => {
      if (!isCurrent() || trialsApplied === false) return
      const generated = menuData.generateWeeklyMenu({
        birthDate: context.birthDate,
        weekStart,
        excludedIngredients: this.data.excludedIngredients,
        unlockedFoods: this.data.unlockedFoods
      })
      const result = response.res && response.res.result
      const draft = milkOnly ? null : wx.getStorageSync(this.getDraftKey(weekStart))
      if (response.error || !result || !result.success) {
        console.error(response.error || new Error(result && result.error))
        this.applyLoadedWeek(generated, null, draft)
        wx.showToast({ title: '使用本地推荐', icon: 'none' })
        return
      }
      this.applyLoadedWeek(generated, result.data, draft)
      if (!milkOnly) this.startMenuSync(context.familyCode, weekStart, generated)
    })
  },

  applyLoadedWeek(generated, saved, draft) {
    const context = this.captureMenuContext()
    const requestVersion = this._weekRequestVersion
    if (!this.isMenuContextCurrent(context)) return
    const plan = draft || (saved ? this.mergeSavedPlan(generated, saved) : this.decoratePlan(generated))
    this.setData({
      currentPlan: plan,
      ageMonth: plan.ageMonth,
      savedDocId: saved ? saved._id : '',
      dirty: !!draft,
      loading: false,
      unlockNotice: this.buildUnlockNotice(plan, saved)
    }, () => {
      if (!this.isMenuContextCurrent(context) || this._weekRequestVersion !== requestVersion) return
      this.updatePlanningNotice(plan)
      this.syncSelectedDay(this.getDefaultDayIndex(plan))
      if (this.data.viewMode === 'catalog') this.buildCatalog(plan.ageMonth)
    })
  },

  // 保存过的菜单，之后又解锁了新食材、且这周还有今天以后的常规餐位 → 提示刷新
  buildUnlockNotice(plan, saved) {
    if (!saved || !plan || plan.status !== 'ready') return null
    const foods = menuRefresh.getNewlyUnlockedFoods(this.data.unlockedFoods, saved.unlockedFoods)
    if (foods.length === 0) return null
    const hasFuture = (plan.days || []).some(day => day.phase === 'regular' && dateUtil.compareDates(day.date, this.data.today) > 0)
    return hasFuture ? { foods, foodsLabel: foods.join('、') } : null
  },

  refreshFutureDays() {
    const plan = this.data.currentPlan
    if (!plan || plan.status !== 'ready') return
    const generated = menuData.generateWeeklyMenu({
      birthDate: this.data.birthDate,
      weekStart: this.data.weekStart,
      excludedIngredients: this.data.excludedIngredients,
      unlockedFoods: this.data.unlockedFoods
    })
    const result = menuRefresh.refreshFutureDays({ plan: JSON.parse(JSON.stringify(plan)), generated, today: this.data.today })
    if (result.changedDates.length === 0) {
      wx.showToast({ title: '这周没有可刷新的餐位', icon: 'none' })
      this.setData({ unlockNotice: null })
      return
    }
    const draft = this.decoratePlan(result.plan)
    wx.setStorageSync(this.getDraftKey(this.data.weekStart), draft)
    this.setData({ currentPlan: draft, dirty: true, unlockNotice: null }, () => {
      this.syncSelectedDay(this.data.selectedDayIndex)
      wx.showToast({ title: `已刷新 ${result.changedDates.length} 天，记得保存`, icon: 'none' })
    })
  },

  dismissUnlockNotice() {
    this.setData({ unlockNotice: null })
  },

  startMenuSync(familyCode, weekStart, generated) {
    const context = this.captureMenuContext()
    const requestVersion = this._weekRequestVersion
    if (!this.isMenuContextCurrent(context) || context.familyCode !== familyCode || this.data.weekStart !== weekStart) return
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
            if (!this.isMenuContextCurrent(context) || this._weekRequestVersion !== requestVersion ||
              this.data.weekStart !== weekStart || this._menuSyncKey !== key || this.data.dirty) return
            const saved = familyRecordSync.recordsFromWatchSnapshot(snapshot)[0] || null
            this.applyLoadedWeek(generated, saved, null)
          },
          onError: err => {
            if (this.isMenuContextCurrent(context)) console.error(err)
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
      date: day.date,
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
    if (this._menuHidden || this.data.viewMode !== 'month' || this._trialLoading) return
    if (!this.data.birthDate) {
      this.setData({ monthlyPlan: null })
      return
    }
    const signature = JSON.stringify([this.data.birthDate, monthStart, this.data.excludedIngredients, this.data.unlockedFoods])
    if (signature === this._monthSignature && this.data.monthlyPlan) return
    const monthlyPlan = menuData.generateMonthlyMenu({
      birthDate: this.data.birthDate,
      monthStart,
      excludedIngredients: this.data.excludedIngredients,
      unlockedFoods: this.data.unlockedFoods
    })
    this._monthSignature = signature
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

  calculateNutrition(days) {
    const summary = {}
    days.forEach(day => {
      Object.keys(day.meals || {}).forEach(type => {
        ;(day.meals[type] || []).forEach(dish => {
          ;(dish.nutritionTags || []).forEach(tag => {
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
          weekStart: this.data.weekStart,
          excludedIngredients: this.data.excludedIngredients,
          unlockedFoods: this.data.unlockedFoods
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
    const context = this.captureMenuContext()
    const draftKey = this.getDraftKey(plan.weekStart, familyCode)
    const data = {
      ageMonth: plan.ageMonth,
      stage: plan.stage,
      days: plan.days,
      nutritionSummary: plan.nutritionSummary,
      unlockedFoods: this.data.unlockedFoods
    }

    return wx.cloud.callFunction({
      name: 'weeklyMenu',
      data: { action: 'save', familyCode, weekStart: plan.weekStart, data }
    }).then(res => {
      wx.hideLoading()
      if (!res.result || !res.result.success) {
        throw new Error(res.result && res.result.error)
      }
      wx.removeStorageSync(draftKey)
      if (!this.isMenuContextCurrent(context) || this.data.weekStart !== plan.weekStart) return
      this.setData({ savedDocId: res.result._id || this.data.savedDocId, dirty: false, unlockNotice: null })
      wx.showToast({ title: '已保存', icon: 'success' })
    }).catch(err => {
      wx.hideLoading()
      if (!this.isMenuContextCurrent(context) || this.data.weekStart !== plan.weekStart) return
      console.error(err)
      wx.showToast({ title: '保存失败，请检查 weekly_menus 集合', icon: 'none' })
    })
  },
}))
