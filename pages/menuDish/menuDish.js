const menuData = require('../../utils/menuData.js')

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
    cautionsText: ''
  },

  onLoad(options) {
    const mealType = options.mealType || 'breakfast'
    this.setData({
      weekStart: options.weekStart,
      dayIndex: parseInt(options.dayIndex, 10) || 0,
      mealType,
      dishIndex: parseInt(options.dishIndex, 10) || 0,
      mealLabel: menuData.MEAL_LABELS[mealType] || ''
    })
    this.loadDish()
  },

  loadDish() {
    const birthDate = wx.getStorageSync('babyBirthDate') || ''
    const generated = menuData.generateWeeklyMenu({
      birthDate,
      weekStart: this.data.weekStart
    })
    const db = wx.cloud.database()
    const familyCode = wx.getStorageSync('familyCode') || 'FAMILY'

    db.collection('weekly_menus')
      .where({ familyCode, weekStart: this.data.weekStart })
      .limit(1)
      .get()
      .then(res => {
        const saved = res.data && res.data[0]
        const draft = wx.getStorageSync(this.getDraftKey())
        const plan = draft || (saved ? { ...generated, days: saved.days || generated.days } : generated)
        this.setDish(plan, saved ? saved._id : '')
      })
      .catch(err => {
        console.error(err)
        this.setDish(generated, '')
      })
  },

  getDraftKey() {
    return `menuDraft:${this.data.weekStart}`
  },

  setDish(plan, savedDocId) {
    const day = plan.days[this.data.dayIndex]
    const dish = day && day.meals[this.data.mealType] && day.meals[this.data.mealType][this.data.dishIndex]
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
          dish.nutritionTags.forEach(tag => {
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

    plan.days[this.data.dayIndex].meals[this.data.mealType].splice(this.data.dishIndex, 1, dish)
    plan.nutritionSummary = this.calculateNutrition(plan.days)

    wx.showLoading({ title: '保存中...', mask: true })
    const db = wx.cloud.database()
    const familyCode = wx.getStorageSync('familyCode') || 'FAMILY'
    const data = {
      familyCode,
      weekStart: plan.weekStart,
      ageMonth: plan.ageMonth,
      stage: plan.stage,
      days: plan.days,
      nutritionSummary: plan.nutritionSummary,
      updateTime: db.serverDate()
    }
    const task = this.data.savedDocId
      ? db.collection('weekly_menus').doc(this.data.savedDocId).update({ data })
      : db.collection('weekly_menus').add({ data: { ...data, createTime: db.serverDate() } })

    task.then(() => {
      wx.hideLoading()
      wx.removeStorageSync(this.getDraftKey())
      wx.showToast({ title: '已保存', icon: 'success' })
      setTimeout(() => wx.navigateBack(), 700)
    }).catch(err => {
      wx.hideLoading()
      console.error(err)
      wx.showToast({ title: '保存失败，请检查 weekly_menus 集合', icon: 'none' })
    })
  }
})
