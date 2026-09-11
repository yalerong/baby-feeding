const dateUtil = require('../../utils/date.js')
const menuData = require('../../utils/menuData.js')
const familyRecordSync = require('../../utils/familyRecordSync.js')
const foodUnlock = require('../../utils/foodUnlock.js')
const menuRefresh = require('../../utils/menuRefresh.js')

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
    unlockNotice: null
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
      currentAgeMonth,
      guideVisible: !wx.getStorageSync('menuGuideDismissed'),
      guidePosition: wx.getStorageSync('menuGuidePosition') === 'bottom' ? 'bottom' : 'top'
    })
    this.loadLibraryDishes()
    this.loadFoodTrials().then(() => {
      this.loadWeek(weekStart)
      this.buildMonth(monthStart)
    })
  },

  // 家庭菜谱库：家长自己写过的菜，跨周复用
  loadLibraryDishes() {
    const familyCode = wx.getStorageSync('familyCode') || 'FAMILY'
    return wx.cloud.callFunction({ name: 'customDish', data: { action: 'list', familyCode } })
      .then(res => {
        const libraryDishes = res.result && res.result.success ? (res.result.data || []) : []
        this.setData({ libraryDishes })
        if (this.data.hallContext) this.setData({ hallLibraryDishes: this.buildHallLibraryDishes(this.data.hallContext.mealType) })
      })
      .catch(err => console.error(err))
  },

  // 菜谱库里的菜也要过一遍过敏排除：按规范食材和原始配料名都匹配，和菜库菜同一口径
  libraryDishContainsExcluded(dish) {
    const excluded = this.data.excludedIngredients || []
    if (excluded.length === 0) return false
    const foods = Array.isArray(dish.foods) && dish.foods.length
      ? dish.foods
      : (dish.ingredients || []).reduce((acc, ingredient) => acc.concat(menuData.canonicalizeIngredient(ingredient)), [])
    return foods.some(food => excluded.includes(food)) || (dish.ingredients || []).some(name => excluded.includes(name))
  },

  buildHallLibraryDishes(mealType) {
    return this.data.libraryDishes
      .filter(dish => !dish.mealTypes || dish.mealTypes.length === 0 || dish.mealTypes.includes(mealType))
      .filter(dish => !this.libraryDishContainsExcluded(dish))
      .map(dish => ({
        ...dish,
        ingredientsLabel: (dish.ingredients || []).join('、') || '未填食材'
      }))
  },

  chooseLibraryDish(e) {
    const id = e.currentTarget.dataset.id
    const source = this.data.libraryDishes.find(dish => dish._id === id)
    const context = this.data.hallContext
    const plan = this.data.currentPlan
    if (!source || !context || !plan) return
    const dish = {
      id: `custom-${source._id}`,
      libraryId: source._id,
      name: source.name,
      ageMinMonth: plan.ageMonth,
      ageMaxMonth: plan.ageMonth,
      mealTypes: source.mealTypes && source.mealTypes.length ? source.mealTypes : [context.mealType],
      nutritionTags: source.nutritionTags || [],
      foodGroups: [],
      texture: source.texture || '按月龄处理',
      imageEmoji: source.imageEmoji || '🍱',
      color: source.color || '#F3F0EA',
      ingredients: source.ingredients || [],
      steps: source.steps || [],
      cautions: source.cautions || [],
      isCustom: true
    }
    const meals = plan.days[context.dayIndex].meals
    if (!meals[context.mealType]) meals[context.mealType] = []
    meals[context.mealType].splice(context.dishIndex, 1, dish)
    plan.nutritionSummary = this.calculateNutrition(plan.days)
    const draft = this.decoratePlan(plan)
    wx.setStorageSync(this.getDraftKey(this.data.weekStart), draft)
    this.setData({
      currentPlan: draft,
      dirty: true,
      viewMode: 'week',
      hallDishes: [],
      hallLibraryDishes: [],
      hallContext: null
    }, () => {
      this.syncSelectedDay(context.dayIndex)
    })
  },

  removeLibraryDish(e) {
    const id = e.currentTarget.dataset.id
    const source = this.data.libraryDishes.find(dish => dish._id === id)
    if (!source) return
    wx.showModal({
      title: '从菜谱库删除',
      content: `删除“${source.name}”后已排进菜单的不受影响，确定吗？`,
      confirmText: '删除',
      confirmColor: '#D9534F',
      success: result => {
        if (!result.confirm) return
        wx.cloud.callFunction({
          name: 'customDish',
          data: { action: 'remove', familyCode: wx.getStorageSync('familyCode') || 'FAMILY', _id: id }
        }).then(res => {
          if (!res.result || !res.result.success) throw new Error(res.result && res.result.error)
          return this.loadLibraryDishes()
        }).then(() => wx.showToast({ title: '已删除', icon: 'success' }))
          .catch(err => wx.showToast({ title: err.message || '删除失败', icon: 'none' }))
      }
    })
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

  // 打开菜品详情前把当前看到的整周菜单存下来，详情页照这份显示，不再各自重新生成
  getPlanCacheKey(weekStart) {
    return `menuPlanCache:${weekStart}`
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
    if (viewMode === 'trial') this.buildTrialFoods()
  },

  loadFoodTrials() {
    const familyCode = wx.getStorageSync('familyCode') || 'FAMILY'
    return wx.cloud.callFunction({ name: 'foodTrial', data: { action: 'list', familyCode } })
      .then(res => {
        if (!res.result || !res.result.success) throw new Error((res.result && res.result.error) || 'foodTrial list failed')
        const foodTrials = res.result.data || []
        const trialMode = foodUnlock.normalizeMode(res.result.settings && res.result.settings.trialMode)
        this.setData({
          foodTrials,
          trialMode,
          activeTrialFood: foodUnlock.getActiveFoodName(foodTrials, this.data.today, trialMode),
          excludedIngredients: foodUnlock.getExcludedIngredients(foodTrials),
          unlockedFoods: foodUnlock.getUnlockedFoodNames(foodTrials),
          foodTrialError: ''
        })
        this.buildTrialFoods()
      })
      .catch(err => {
        console.error(err)
        // 试吃数据不可用时 unlockedFoods 保持 null，菜单不做解锁限制
        this.setData({ foodTrialError: '试吃记录暂不可用，请部署 foodTrial 云函数并创建 food_trials 集合', unlockedFoods: null })
        this.buildTrialFoods()
      })
  },

  buildTrialFoods() {
    const ageMonth = Math.max(6, this.data.currentAgeMonth || this.data.ageMonth || 6)
    const byName = {}
    this.data.foodTrials.forEach(trial => { byName[trial.foodName] = trial })
    const used = {}
    const trialFoods = []
    menuData.getDishCatalog({ ageMonth }).forEach(dish => {
      menuData.getDishFoods(dish).forEach(name => {
        if (used[name]) return
        used[name] = true
        const food = foodUnlock.decorateFood(name, byName[name], this.data.trialMode)
        const allergen = foodUnlock.getAllergenInfo(name)
        trialFoods.push({
          ...food,
          allergenLevel: allergen.level,
          allergenLabel: allergen.label,
          allergenHint: allergen.hint,
          progressSteps: foodUnlock.buildTrialSteps(food.trialCount, food.status),
          emoji: this.getFoodEmoji(name),
          category: this.getFoodCategory(dish, name),
          isActive: this.data.activeTrialFood === name,
          canUndoToday: byName[name] && byName[name].lastTriedDate === this.data.today
        })
      })
    })
    // 有试吃记录但不在当前月龄菜库里的食材（自定义、早期月龄、疑似过敏）也要显示，否则会出现"看不见的当前试吃"
    foodUnlock.getMissingTrialFoodNames(this.data.foodTrials, used).forEach(name => {
      if (used[name]) return
      used[name] = true
      const trial = byName[name]
      const food = foodUnlock.decorateFood(name, trial, this.data.trialMode)
      const allergen = foodUnlock.getAllergenInfo(name)
      trialFoods.push({
        ...food,
        allergenLevel: allergen.level,
        allergenLabel: allergen.label,
        allergenHint: allergen.hint,
        progressSteps: foodUnlock.buildTrialSteps(food.trialCount, food.status),
        emoji: this.getFoodEmoji(name),
        category: trial && trial.isCustom ? '自定义' : this.getFoodCategory({}, name),
        isActive: this.data.activeTrialFood === name,
        canUndoToday: trial && trial.lastTriedDate === this.data.today
      })
    })
    // "移除"只给完整菜库里没有的食材（自定义/误存的菜名）；只是超出当前月龄的菜库食材不算
    const knownFoods = menuData.getKnownFoodNames()
    trialFoods.forEach(food => { food.isOffCatalog = !knownFoods.includes(food.name) })
    const orderedTrialFoods = foodUnlock.orderTrialFoods(trialFoods)
    this.setData({
      trialFoods: orderedTrialFoods,
      unlockedFoodCount: orderedTrialFoods.filter(food => food.status === 'unlocked').length
    })
  },

  getFoodEmoji(name) {
    if (/(南瓜|胡萝卜|西兰花|菠菜|番茄|土豆|豌豆|山药|白菜|青菜|红薯|西葫芦|玉米|扁豆)/.test(name)) return '🥬'
    if (/(苹果|香蕉|梨|桃|牛油果)/.test(name)) return '🍎'
    if (/(鸡|牛|猪|鱼|虾|蛋|肉)/.test(name)) return '🥩'
    if (/(米|面|粥|燕麦)/.test(name)) return '🌾'
    return '🥣'
  },

  getFoodCategory(dish, name) {
    const group = (dish.foodGroups || [])[0]
    if (group) return group
    if (/(果|蕉|梨|桃)/.test(name)) return '水果'
    return '食材'
  },

  loadWeek(weekStart) {
    this.stopMenuSync()
    if (!this.data.birthDate) {
      this.setData({ currentPlan: null, savedDocId: '', dirty: false, catalogDishes: menuData.getDishCatalog() })
      this.updatePlanningNotice(null)
      return
    }

    this.setData({ loading: true, unlockNotice: null })
    const generated = menuData.generateWeeklyMenu({
      birthDate: this.data.birthDate,
      weekStart,
      excludedIngredients: this.data.excludedIngredients,
      unlockedFoods: this.data.unlockedFoods
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
      loading: false,
      unlockNotice: this.buildUnlockNotice(plan, saved)
    }, () => {
      this.updatePlanningNotice(plan)
      this.syncSelectedDay(this.getDefaultDayIndex(plan))
      this.buildCatalog(plan.ageMonth)
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
      monthStart,
      excludedIngredients: this.data.excludedIngredients,
      unlockedFoods: this.data.unlockedFoods
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
    this.navigateToDish(this.data.selectedDayIndex, mealType, dishIndex)
  },

  navigateToDish(dayIndex, mealType, dishIndex, options) {
    if (this.data.currentPlan) {
      wx.setStorageSync(this.getPlanCacheKey(this.data.weekStart), this.data.currentPlan)
      if (this.data.dirty) wx.setStorageSync(this.getDraftKey(this.data.weekStart), this.data.currentPlan)
    }
    const custom = options && options.custom ? '&custom=1' : ''
    wx.navigateTo({
      url: `/pages/menuDish/menuDish?weekStart=${this.data.weekStart}&dayIndex=${dayIndex}&mealType=${mealType}&dishIndex=${dishIndex}${custom}`
    })
  },

  // 大厅里"自己写一道"：不动当前餐位，带 custom=1 去详情页，详情页保存时才把自定义菜写进去
  addCustomDish() {
    const context = this.data.hallContext
    if (!context || !this.data.currentPlan) return
    this.setData({ viewMode: 'week', hallDishes: [], hallContext: null }, () => {
      this.navigateToDish(context.dayIndex, context.mealType, context.dishIndex, { custom: true })
    })
  },

  replaceDish(e) {
    const { mealType, dishIndex } = e.currentTarget.dataset
    const dayIndex = this.data.selectedDayIndex
    const plan = this.data.currentPlan
    const current = plan.days[dayIndex].meals[mealType][dishIndex]
    const hallDishes = menuData.getDishesFor(plan.ageMonth, mealType, this.data.excludedIngredients)
      .filter(dish => menuData.dishAllowedByUnlocked(dish, this.data.unlockedFoods))
      .map(dish => ({
        ...dish,
        ingredientsLabel: dish.ingredients.join('、'),
        isCurrent: current && dish.id === current.id
      }))
    this.setData({
      viewMode: 'hall',
      hallDishes,
      hallLibraryDishes: this.buildHallLibraryDishes(mealType),
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
    this.setData({ viewMode: 'week', hallDishes: [], hallLibraryDishes: [], hallContext: null })
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
    const data = {
      ageMonth: plan.ageMonth,
      stage: plan.stage,
      days: plan.days,
      nutritionSummary: plan.nutritionSummary,
      unlockedFoods: this.data.unlockedFoods
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
      this.setData({ savedDocId: res.result._id || this.data.savedDocId, dirty: false, unlockNotice: null })
      wx.showToast({ title: '已保存', icon: 'success' })
    }).catch(err => {
      wx.hideLoading()
      console.error(err)
      wx.showToast({ title: '保存失败，请检查 weekly_menus 集合', icon: 'none' })
    })
  },

  // 严格/宽松模式切换，存在云端 families 文档上，全家共用
  toggleTrialMode() {
    const next = this.data.trialMode === 'relaxed' ? 'strict' : 'relaxed'
    const info = foodUnlock.TRIAL_MODES[next]
    wx.showModal({
      title: `切换到${info.label}`,
      content: `${info.desc}${next === 'strict' ? ' 已有的累计天数保留，之后的打卡按连续要求计算。' : ''}`,
      confirmText: '切换',
      success: result => {
        if (!result.confirm) return
        wx.showLoading({ title: '切换中', mask: true })
        wx.cloud.callFunction({
          name: 'foodTrial',
          data: { action: 'setTrialMode', familyCode: wx.getStorageSync('familyCode') || 'FAMILY', mode: next, date: this.data.today }
        }).then(res => {
          if (!res.result || !res.result.success) throw new Error(res.result && res.result.error)
          return this.loadFoodTrials()
        }).then(() => {
          wx.hideLoading()
          wx.showToast({ title: `已切换到${info.label}`, icon: 'success' })
        }).catch(err => {
          wx.hideLoading()
          const message = err.message || '切换失败'
          if (message.length > 20) {
            wx.showModal({ title: '暂时不能切换', content: message, showCancel: false, confirmText: '知道了' })
          } else {
            wx.showToast({ title: message, icon: 'none' })
          }
        })
      }
    })
  },

  bindCustomFoodInput(e) {
    this.setData({ customFoodInput: e.detail.value })
  },

  // 菜库没有的食材（胡萝卜、玉米……）自己加进解锁列表；输入菜名会识别成食材
  addCustomFood() {
    if (this.data.foodTrialError) {
      wx.showModal({ title: '试吃功能暂不可用', content: this.data.foodTrialError, showCancel: false, confirmText: '知道了' })
      return
    }
    const known = menuData.filterExtraFoods(this.data.foodTrials.map(trial => trial.foodName))
    const foodName = menuData.resolveFoodName(this.data.customFoodInput, known)
    if (!foodName) {
      wx.showToast({ title: '请输入食材名', icon: 'none' })
      return
    }
    if (foodName.length > 20) {
      wx.showToast({ title: '食材名太长了', icon: 'none' })
      return
    }
    if (this.data.trialFoods.some(food => food.name === foodName)) {
      wx.showToast({ title: `${foodName} 已在列表里`, icon: 'none' })
      this.setData({ customFoodInput: '' })
      return
    }
    wx.showLoading({ title: '添加中', mask: true })
    wx.cloud.callFunction({
      name: 'foodTrial',
      data: { action: 'add', familyCode: wx.getStorageSync('familyCode') || 'FAMILY', foodName }
    }).then(res => {
      if (!res.result || !res.result.success) throw new Error(res.result && res.result.error)
      this.setData({ customFoodInput: '' })
      return this.loadFoodTrials()
    }).then(() => {
      wx.hideLoading()
      wx.showToast({ title: `已添加 ${foodName}`, icon: 'success' })
    }).catch(err => {
      wx.hideLoading()
      wx.showToast({ title: err.message || '添加失败', icon: 'none' })
    })
  },

  // 菜库外的食材条目可以整条移除（自定义加错的、早期误存的菜名）
  removeFood(e) {
    const foodName = e.currentTarget.dataset.name
    wx.showModal({
      title: '移除这项食材',
      content: `会删除“${foodName}”的全部试吃记录，确定吗？`,
      confirmColor: '#D9534F',
      success: result => {
        if (!result.confirm) return
        wx.cloud.callFunction({
          name: 'foodTrial',
          data: { action: 'remove', familyCode: wx.getStorageSync('familyCode') || 'FAMILY', foodName }
        }).then(res => {
          if (!res.result || !res.result.success) throw new Error(res.result && res.result.error)
          return this.loadFoodTrials()
        }).then(() => {
          this.loadWeek(this.data.weekStart)
          this.buildMonth(this.data.monthStart)
          wx.showToast({ title: '已移除', icon: 'success' })
        }).catch(err => wx.showToast({ title: err.message || '移除失败', icon: 'none' }))
      }
    })
  },

  recordFoodTrial(e) {
    const foodName = e.currentTarget.dataset.name
    if (this.data.foodTrialError) {
      wx.showModal({
        title: '试吃功能暂不可用',
        content: this.data.foodTrialError,
        showCancel: false,
        confirmText: '知道了'
      })
      return
    }
    const active = this.data.activeTrialFood
    if (active && active !== foodName) {
      wx.showToast({ title: `请先连续完成 ${active}`, icon: 'none' })
      return
    }
    wx.showModal({
      title: '记录今天试吃',
      content: `${foodName}：确认今天已吃且未记录异常吗？`,
      confirmText: '确认记录',
      success: result => {
        if (!result.confirm) return
        wx.showLoading({ title: '正在记录', mask: true })
        wx.cloud.callFunction({
          name: 'foodTrial',
          data: { action: 'log', familyCode: wx.getStorageSync('familyCode') || 'FAMILY', foodName, date: this.data.today }
        }).then(res => {
          if (!res.result || !res.result.success) throw new Error(res.result && res.result.error)
          wx.hideLoading()
          wx.showToast({ title: '试吃已记录', icon: 'success' })
          return this.loadFoodTrials()
        }).then(() => {
          this.loadWeek(this.data.weekStart)
          this.buildMonth(this.data.monthStart)
        }).catch(err => {
          wx.hideLoading()
          wx.showToast({ title: err.message || '记录失败', icon: 'none' })
        })
      }
    })
  },

  undoFoodTrial(e) {
    const foodName = e.currentTarget.dataset.name
    wx.showModal({
      title: '撤销今天的试吃记录',
      content: `确认刚才是误点吗？撤销后会回退“${foodName}”的连续试吃天数。`,
      confirmText: '确认撤销',
      confirmColor: '#D9534F',
      success: result => {
        if (!result.confirm) return
        wx.cloud.callFunction({
          name: 'foodTrial',
          data: { action: 'undoLog', familyCode: wx.getStorageSync('familyCode') || 'FAMILY', foodName, date: this.data.today }
        }).then(res => {
          if (!res.result || !res.result.success) throw new Error(res.result && res.result.error)
          wx.showToast({ title: '已撤销今天的试吃', icon: 'success' })
          return this.loadFoodTrials()
        }).then(() => {
          this.loadWeek(this.data.weekStart)
          this.buildMonth(this.data.monthStart)
        }).catch(err => wx.showToast({ title: err.message || '撤销失败', icon: 'none' }))
      }
    })
  },

  markFoodAllergic(e) {
    const foodName = e.currentTarget.dataset.name
    // editable 弹窗可以顺手记症状（基础库 2.17.1+）；confirmText 不能超过 4 个字
    wx.showModal({
      title: `标记 ${foodName} 疑似过敏`,
      editable: true,
      placeholderText: '症状和时间，如：饭后1小时嘴边起疹',
      confirmText: '确定标记',
      confirmColor: '#D9534F',
      success: result => {
        if (!result.confirm) return
        wx.cloud.callFunction({
          name: 'foodTrial',
          data: { action: 'setStatus', familyCode: wx.getStorageSync('familyCode') || 'FAMILY', foodName, status: 'allergic', note: result.content || '', date: this.data.today }
        }).then(res => {
          if (!res.result || !res.result.success) throw new Error(res.result && res.result.error)
          return this.loadFoodTrials()
        }).then(() => {
          this.loadWeek(this.data.weekStart)
          this.buildMonth(this.data.monthStart)
        }).catch(err => wx.showToast({ title: err.message || '设置失败', icon: 'none' }))
      }
    })
  },

  restoreFood(e) {
    const foodName = e.currentTarget.dataset.name
    wx.cloud.callFunction({
      name: 'foodTrial',
      data: { action: 'setStatus', familyCode: wx.getStorageSync('familyCode') || 'FAMILY', foodName, status: 'tracking' }
    }).then(res => {
      if (!res.result || !res.result.success) throw new Error(res.result && res.result.error)
      return this.loadFoodTrials()
    }).then(() => {
      this.loadWeek(this.data.weekStart)
      this.buildMonth(this.data.monthStart)
    }).catch(err => wx.showToast({ title: err.message || '恢复失败', icon: 'none' }))
  }
})
