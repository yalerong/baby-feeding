// 菜谱库、菜单大厅与菜库筛选相关的方法。由 menu.js 通过 Object.assign 挂到 Page 上，方法名与 wxml 绑定保持一致。

const menuData = require('../../utils/menuData.js')

module.exports = {
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
  }
}
