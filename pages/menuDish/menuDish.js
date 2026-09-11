const menuData = require('../../utils/menuData.js')
const foodUnlock = require('../../utils/foodUnlock.js')

Page({
  data: {
    weekStart: '',
    dayIndex: 0,
    mealType: '',
    dishIndex: 0,
    plan: null,
    savedDocId: '',
    dish: null,
    mealLabel: '',
    ingredientsText: '',
    stepsText: '',
    cautionsText: '',
    isNewCustom: false
  },

  onLoad(options) {
    const mealType = options.mealType || 'breakfast'
    this.setData({
      weekStart: options.weekStart,
      dayIndex: parseInt(options.dayIndex, 10) || 0,
      mealType,
      dishIndex: parseInt(options.dishIndex, 10) || 0,
      mealLabel: menuData.MEAL_LABELS[mealType] || '',
      isNewCustom: options.custom === '1'
    })
    this.loadDish()
  },

  // 优先用菜单页跳转前缓存的那份菜单（和用户看到的一致），其次草稿、云端已保存，最后才按解锁状态重新生成
  loadDish() {
    const birthDate = wx.getStorageSync('babyBirthDate') || ''
    const familyCode = wx.getStorageSync('familyCode') || 'FAMILY'
    const weekStart = this.data.weekStart
    const cached = wx.getStorageSync(`menuPlanCache:${weekStart}`)
    const draft = wx.getStorageSync(this.getDraftKey())

    const trialsReq = wx.cloud.callFunction({ name: 'foodTrial', data: { action: 'list', familyCode } })
      .then(res => (res.result && res.result.data) || [])
      .catch(err => { console.error(err); return null })
    const savedReq = wx.cloud.callFunction({ name: 'weeklyMenu', data: { action: 'get', familyCode, weekStart } })
      .then(res => {
        if (!res.result || !res.result.success) throw new Error(res.result && res.result.error)
        return res.result.data
      })
      .catch(err => { console.error(err); return null })

    Promise.all([trialsReq, savedReq]).then(([trials, saved]) => {
      const generated = menuData.generateWeeklyMenu({
        birthDate,
        weekStart,
        excludedIngredients: trials ? foodUnlock.getExcludedIngredients(trials) : [],
        unlockedFoods: trials ? foodUnlock.getUnlockedFoodNames(trials) : null
      })
      const fromCache = cached && cached.weekStart === weekStart && Array.isArray(cached.days) ? cached : null
      const fromSaved = saved ? { ...generated, days: saved.days || generated.days, nutritionSummary: saved.nutritionSummary || generated.nutritionSummary } : null
      const plan = fromCache || draft || fromSaved || generated
      this.setDish(plan, saved ? saved._id : '')
    })
  },

  getDraftKey() {
    return `menuDraft:${this.data.weekStart}`
  },

  // 新建自定义菜：只在本页内存里占位，用户点保存才写进菜单
  buildCustomDish(plan) {
    return {
      id: `custom-${Date.now()}`,
      name: '',
      ageMinMonth: plan.ageMonth,
      ageMaxMonth: plan.ageMonth,
      mealTypes: [this.data.mealType],
      nutritionTags: [],
      foodGroups: [],
      texture: '按月龄处理',
      imageEmoji: '🍱',
      color: '#F3F0EA',
      ingredients: [],
      steps: [],
      cautions: ['新食材仍要单独尝试、少量观察'],
      isCustom: true
    }
  },

  setDish(plan, savedDocId) {
    const day = plan.days[this.data.dayIndex]
    const slot = day && day.meals[this.data.mealType]
    const dish = this.data.isNewCustom ? this.buildCustomDish(plan) : (slot && slot[this.data.dishIndex])
    if (!dish) {
      wx.showToast({ title: '菜品不存在', icon: 'none' })
      return
    }
    this.setData({
      plan,
      savedDocId,
      dish: this.decorateDish(dish),
      ingredientsText: dish.ingredients.join('\n'),
      stepsText: dish.steps.join('\n'),
      cautionsText: dish.cautions.join('\n')
    })
  },

  decorateDish(dish) {
    if (dish.servingLabel) return dish
    const servingByAge = dish.servingByAge || {
      '6': '尝试量 5-30g；从 1-2 小勺开始，能接受再慢慢增加',
      '7-8': '约 30-60g/餐；按宝宝食欲调整，不影响奶量',
      '9-11': '约 50-100g/餐；加餐少量即可，避免影响正餐',
      '12+': '约 80-150g/餐；以宝宝饥饱信号为准'
    }
    return {
      ...dish,
      servingByAge,
      servingLabel: Object.keys(servingByAge).map(age => `${age}月龄：${servingByAge[age]}`).join('；')
    }
  },

  bindNameInput(e) {
    this.setData({ 'dish.name': e.detail.value })
  },

  bindTextureInput(e) {
    this.setData({ 'dish.texture': e.detail.value })
  },

  bindIngredientsInput(e) {
    this.setData({ ingredientsText: e.detail.value })
  },

  bindStepsInput(e) {
    this.setData({ stepsText: e.detail.value })
  },

  bindCautionsInput(e) {
    this.setData({ cautionsText: e.detail.value })
  },

  splitLines(value) {
    return value.split('\n').map(item => item.trim()).filter(Boolean)
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

  saveDish() {
    if (!this.data.dish.name.trim()) {
      wx.showToast({ title: '请输入菜名', icon: 'none' })
      return
    }

    const plan = this.data.plan
    const dish = {
      ...this.data.dish,
      name: this.data.dish.name.trim(),
      texture: this.data.dish.texture.trim() || '按月龄处理',
      ingredients: this.splitLines(this.data.ingredientsText),
      steps: this.splitLines(this.data.stepsText),
      cautions: this.splitLines(this.data.cautionsText),
      isCustom: true
    }

    const meals = plan.days[this.data.dayIndex].meals
    if (!meals[this.data.mealType]) meals[this.data.mealType] = []
    meals[this.data.mealType].splice(this.data.dishIndex, 1, dish)
    plan.nutritionSummary = this.calculateNutrition(plan.days)

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
      wx.removeStorageSync(this.getDraftKey())
      wx.removeStorageSync(`menuPlanCache:${this.data.weekStart}`)
      wx.showToast({ title: '已保存', icon: 'success' })
      setTimeout(() => wx.navigateBack(), 700)
    }).catch(err => {
      wx.hideLoading()
      console.error(err)
      wx.showToast({ title: '保存失败，请检查 weekly_menus 集合', icon: 'none' })
    })
  }
})
