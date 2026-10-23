// 食物试吃/解锁相关的方法。由 menu.js 通过 Object.assign 挂到 Page 上，方法名与 wxml 绑定保持一致。

const menuData = require('../../utils/menuData.js')
const foodUnlock = require('../../utils/foodUnlock.js')

module.exports = {
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
        const food = foodUnlock.decorateFood(name, byName[name], this.data.trialMode, this.data.today)
        const allergen = foodUnlock.getAllergenInfo(name)
        trialFoods.push({
          ...food,
          allergenLevel: allergen.level,
          allergenLabel: allergen.label,
          allergenHint: allergen.hint,
          progressSteps: foodUnlock.buildTrialSteps(food.streakExpired ? 0 : food.trialCount, food.status),
          emoji: this.getFoodEmoji(name),
          category: this.getFoodCategory(dish, name),
          isActive: this.data.activeTrialFood === name,
          canUndoToday: byName[name] && !byName[name].manuallyUnlocked && byName[name].lastTriedDate === this.data.today
        })
      })
    })
    // 有试吃记录但不在当前月龄菜库里的食材（自定义、早期月龄、疑似过敏）也要显示，否则会出现"看不见的当前试吃"
    foodUnlock.getMissingTrialFoodNames(this.data.foodTrials, used).forEach(name => {
      if (used[name]) return
      used[name] = true
      const trial = byName[name]
      const food = foodUnlock.decorateFood(name, trial, this.data.trialMode, this.data.today)
      const allergen = foodUnlock.getAllergenInfo(name)
      trialFoods.push({
        ...food,
        allergenLevel: allergen.level,
        allergenLabel: allergen.label,
        allergenHint: allergen.hint,
        progressSteps: foodUnlock.buildTrialSteps(food.streakExpired ? 0 : food.trialCount, food.status),
        emoji: this.getFoodEmoji(name),
        category: trial && trial.isCustom ? '自定义' : this.getFoodCategory({}, name),
        isActive: this.data.activeTrialFood === name,
        canUndoToday: trial && !trial.manuallyUnlocked && trial.lastTriedDate === this.data.today
      })
    })
    // 标记菜库外食材；未解锁时只有这些条目提供移除，已解锁项统一提供移除。
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

  // 清除食材的试吃档案；菜库内食材保留在菜库，菜库外条目从列表移除。
  removeFood(e) {
    const foodName = e.currentTarget.dataset.name
    const catalogNote = menuData.getKnownFoodNames().includes(foodName)
      ? '食材仍保留在菜库，之后按未解锁处理。'
      : '该食材将从食物解锁列表中移除。'
    wx.showModal({
      title: '移除试吃档案',
      content: `会删除“${foodName}”的试吃记录、解锁状态和异常备注，首页辅食记录保留。${catalogNote}确定移除吗？`,
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

  manualUnlockFood(e) {
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
    if (this.data.trialActionBusy) return
    this.setData({ trialActionBusy: true })
    wx.showModal({
      title: '手动解锁',
      content: `仅用于“${foodName}”之前已经试吃通过、只是漏登记的情况；不会补造历史试吃日期。确认标记为已解锁吗？`,
      confirmText: '确认解锁',
      success: result => {
        if (!result.confirm) {
          this.setData({ trialActionBusy: false })
          return
        }
        wx.showLoading({ title: '正在登记', mask: true })
        wx.cloud.callFunction({
          name: 'foodTrial',
          data: { action: 'setStatus', familyCode: wx.getStorageSync('familyCode') || 'FAMILY', foodName, status: 'unlocked', date: this.data.today }
        }).then(res => {
          if (!res.result || !res.result.success) throw new Error(res.result && res.result.error)
          return this.loadFoodTrials()
        }).then(() => {
          if (this.data.foodTrialError) throw new Error(`已登记，刷新失败：${this.data.foodTrialError}`)
          wx.hideLoading()
          this.setData({ trialActionBusy: false })
          this.loadWeek(this.data.weekStart)
          this.buildMonth(this.data.monthStart)
          wx.showToast({ title: '已补登记解锁', icon: 'success' })
        }).catch(err => {
          wx.hideLoading()
          this.setData({ trialActionBusy: false })
          const message = err.message || '登记失败'
          if (message.length > 20) {
            wx.showModal({ title: message.indexOf('已登记，刷新失败') === 0 ? '刷新失败' : '登记失败', content: message, showCancel: false, confirmText: '知道了' })
          } else {
            wx.showToast({ title: message, icon: 'none' })
          }
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
}
