const menuData = require('../../utils/menuData.js')
const foodUnlock = require('../../utils/foodUnlock.js')
const menuStorage = require('../../utils/menuStorage.js')

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
    isNewCustom: false,
    validating: false,
    validationError: '',
    canSave: false,
    saving: false
  },

  onLoad(options) {
    this._detailHidden = false
    this._detailUnloaded = false
    const mealType = options.mealType || 'breakfast'
    this.setData({
      weekStart: options.weekStart,
      dayIndex: parseInt(options.dayIndex, 10) || 0,
      mealType,
      dishIndex: parseInt(options.dishIndex, 10) || 0,
      mealLabel: menuData.MEAL_LABELS[mealType] || '',
      isNewCustom: options.custom === '1'
    })
    return this.loadDish()
  },

  onShow() {
    if (this._detailUnloaded) return
    if (this._detailHidden || (this._dishContext && !this.isDishContextCurrent(this._dishContext))) {
      this._detailHidden = false
      return this.loadDish()
    }
  },

  onHide() {
    this._detailHidden = true
    this._loadVersion = (this._loadVersion || 0) + 1
    if (this._navigateTimer) {
      clearTimeout(this._navigateTimer)
      this._navigateTimer = null
    }
    if (this._saving) wx.hideLoading()
    this._saving = false
    this._saveContext = null
  },

  onUnload() {
    this._detailUnloaded = true
    this.onHide()
  },

  isDishContextCurrent(context) {
    return !!context && !this._detailHidden && !this._detailUnloaded &&
      this._loadVersion === context.version &&
      (wx.getStorageSync('familyCode') || 'FAMILY') === context.familyCode &&
      (wx.getStorageSync('babyBirthDate') || '') === context.birthDate &&
      this.data.weekStart === context.weekStart && this.data.dayIndex === context.dayIndex &&
      this.data.mealType === context.mealType && this.data.dishIndex === context.dishIndex &&
      this.data.isNewCustom === context.isNewCustom
  },

  usablePlan(plan, context) {
    if (!plan || plan.weekStart !== context.weekStart || !Array.isArray(plan.days) ||
      (plan.birthDate && plan.birthDate !== context.birthDate)) return false
    const day = plan.days[context.dayIndex]
    if (!day || !day.meals) return false
    if (context.isNewCustom) return true
    const slot = day.meals[context.mealType]
    const dish = Array.isArray(slot) && slot[context.dishIndex]
    return !!dish && Array.isArray(dish.ingredients) && Array.isArray(dish.steps) && Array.isArray(dish.cautions)
  },

  // 先展示本次跳转的家庭快照，后台核对成功后再允许保存；核对不会重建正在编辑的表单。
  loadDish() {
    if (this._detailHidden || this._detailUnloaded) return Promise.resolve()
    if (this._saving && this.isDishContextCurrent(this._dishContext)) return Promise.resolve()
    const birthDate = wx.getStorageSync('babyBirthDate') || ''
    const familyCode = wx.getStorageSync('familyCode') || 'FAMILY'
    const weekStart = this.data.weekStart
    const context = {
      familyCode, birthDate, weekStart, dayIndex: this.data.dayIndex,
      mealType: this.data.mealType, dishIndex: this.data.dishIndex, isNewCustom: this.data.isNewCustom,
      version: (this._loadVersion || 0) + 1
    }
    const targetKey = JSON.stringify([familyCode, birthDate, weekStart, context.dayIndex, context.mealType, context.dishIndex, context.isNewCustom])
    const changed = this._dishTargetKey !== targetKey
    this._loadVersion = context.version
    this._dishContext = context
    this._dishTargetKey = targetKey
    this._validatedContext = null
    this._unlockedFoods = null
    if (changed) {
      if (this._saving) wx.hideLoading()
      this._saving = false
      this._saveContext = null
      this.setData({ plan: null, dish: null, savedDocId: '', ingredientsText: '', stepsText: '', cautionsText: '' })
    }
    this.setData({ validating: true, validationError: '', canSave: false, saving: false })
    const cached = wx.getStorageSync(menuStorage.planKey(familyCode, weekStart))
    const draft = wx.getStorageSync(menuStorage.draftKey(familyCode, weekStart))
    const local = this.usablePlan(cached, context) ? cached : this.usablePlan(draft, context) ? draft : null
    if (local && !this.data.dish) this.setDish(JSON.parse(JSON.stringify(local)), '')

    const read = request => wx.cloud.callFunction(request).then(res => {
      if (!res.result || !res.result.success) return { error: new Error((res.result && res.result.error) || 'load failed') }
      return { value: res.result.data }
    }, error => ({ error }))
    const trialsReq = read({ name: 'foodTrial', data: { action: 'list', familyCode } })
    const savedReq = read({ name: 'weeklyMenu', data: { action: 'get', familyCode, weekStart } })
    return Promise.all([trialsReq, savedReq]).then(([trialResult, savedResult]) => {
      if (!this.isDishContextCurrent(context)) return
      const verifiedTrials = !trialResult.error && Array.isArray(trialResult.value)
      const trials = verifiedTrials ? trialResult.value : null
      const saved = !savedResult.error && savedResult.value
      this._unlockedFoods = trials ? foodUnlock.getUnlockedFoodNames(trials) : null
      if (!this.data.dish) {
        const generated = menuData.generateWeeklyMenu({
          birthDate, weekStart,
          excludedIngredients: trials ? foodUnlock.getExcludedIngredients(trials) : [],
          unlockedFoods: this._unlockedFoods
        })
        const plan = saved ? { ...generated, days: saved.days || generated.days, nutritionSummary: saved.nutritionSummary || generated.nutritionSummary } : generated
        this.setDish(plan, saved ? saved._id : '')
      }
      const verified = verifiedTrials && !savedResult.error
      this._validatedContext = verified ? context : null
      this.setData({
        savedDocId: saved ? saved._id : this.data.savedDocId,
        validating: false,
        canSave: verified && !!this.data.dish,
        validationError: !verified ? '暂时无法核对食材或菜单，重新核对后再保存' :
          this.data.dish ? '' : '该餐位暂时没有菜品，请返回菜单重新选择'
      })
    }).catch(err => {
      if (!this.isDishContextCurrent(context)) return
      console.error(err)
      this.setData({ validating: false, canSave: false, validationError: '菜品加载失败，请重新核对后再保存' })
    })
  },

  getDraftKey() {
    return menuStorage.draftKey(wx.getStorageSync('familyCode') || 'FAMILY', this.data.weekStart)
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
    const slot = day && day.meals && day.meals[this.data.mealType]
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
    if (this._saving) return
    const context = this._dishContext
    if (!this.isDishContextCurrent(context)) return
    if (this.data.validating || !this.data.canSave || this._validatedContext !== context) {
      wx.showToast({ title: '请先完成食材和菜单核对', icon: 'none' })
      return
    }
    if (!this.data.dish) return
    if (!this.data.dish.name.trim()) {
      wx.showToast({ title: '请输入菜名', icon: 'none' })
      return
    }

    const plan = JSON.parse(JSON.stringify(this.data.plan))
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

    this._saving = true
    this._saveContext = context
    this._libraryError = ''
    this.setData({ saving: true })
    wx.showLoading({ title: '保存中...', mask: true })
    const familyCode = context.familyCode
    const isCurrent = () => this._saveContext === context && this.isDishContextCurrent(context)
    const data = {
      ageMonth: plan.ageMonth,
      stage: plan.stage,
      days: plan.days,
      nutritionSummary: plan.nutritionSummary,
      unlockedFoods: this._unlockedFoods || null
    }

    // 自定义菜先进家庭菜谱库（拿到 libraryId 挂在菜上），库存失败不影响周菜单保存
    const foods = []
    dish.ingredients.forEach(ingredient => {
      menuData.canonicalizeIngredient(ingredient).forEach(food => { if (!foods.includes(food)) foods.push(food) })
    })
    const libraryDish = {
      name: dish.name,
      ingredients: dish.ingredients,
      foods,
      steps: dish.steps,
      cautions: dish.cautions,
      texture: dish.texture,
      mealTypes: dish.mealTypes && dish.mealTypes.length ? dish.mealTypes : [this.data.mealType],
      nutritionTags: dish.nutritionTags || [],
      imageEmoji: dish.imageEmoji,
      color: dish.color
    }
    const libraryReq = wx.cloud.callFunction({
      name: 'customDish',
      data: { action: 'save', familyCode, _id: dish.libraryId || '', dish: libraryDish }
    }).then(res => {
      if (!isCurrent()) return
      if (res.result && res.result.success && res.result._id) {
        dish.libraryId = res.result._id
      } else if (res.result && res.result.error) {
        this._libraryError = res.result.error
      }
    }).catch(err => { if (isCurrent()) console.error(err) })

    return libraryReq.then(() => {
      if (!isCurrent()) return null
      return wx.cloud.callFunction({ name: 'weeklyMenu', data: { action: 'save', familyCode, weekStart: context.weekStart, data } })
    }).then(res => {
      if (!res || !isCurrent()) return
      wx.hideLoading()
      if (!res.result || !res.result.success) {
        throw new Error(res.result && res.result.error)
      }
      wx.removeStorageSync(menuStorage.draftKey(familyCode, context.weekStart))
      wx.removeStorageSync(menuStorage.planKey(familyCode, context.weekStart))
      this._saving = false
      this._saveContext = null
      this.setData({ saving: false, canSave: false, savedDocId: res.result._id || this.data.savedDocId })
      if (this._libraryError) {
        wx.showToast({ title: `菜单已保存，但没进菜谱库：${this._libraryError}`, icon: 'none', duration: 3000 })
        this._libraryError = ''
      } else {
        wx.showToast({ title: '已保存', icon: 'success' })
      }
      this._navigateTimer = setTimeout(() => {
        if (this.isDishContextCurrent(context)) wx.navigateBack()
      }, 700)
    }).catch(err => {
      if (!isCurrent()) return
      wx.hideLoading()
      this._saving = false
      this._saveContext = null
      this.setData({ saving: false })
      console.error(err)
      wx.showToast({ title: '保存失败，请检查 weekly_menus 集合', icon: 'none' })
    })
  }
})
