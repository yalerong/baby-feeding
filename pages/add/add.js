const dateUtil = require('../../utils/date.js')
const feedingAudit = require('../../utils/feedingAudit.js')
const menuData = require('../../utils/menuData.js')
const solidFood = require('../../utils/solidFood.js')
const foodUnlock = require('../../utils/foodUnlock.js')
const feedingReminderCache = require('../../utils/feedingReminderCache.js')
const todayStr = dateUtil.todayStr
const nowTimeStr = dateUtil.nowTimeStr

Page({
  data: {
    isEdit: false,
    _id: '',
    date: '',
    time: '',
    breastMilk: '',
    formula: '',
    stool: false,
    stoolDesc: '',
    total: 0,
    stoolTextures: ['稀', '稠'],
    stoolColors: ['黄', '非黄色'],
    stoolAmounts: ['少', '中', '多'],
    stoolTextureIndex: -1,
    stoolColorIndex: -1,
    stoolAmountIndex: -1,
    saving: false,
    latestFeeding: null,
    solidFood: false,
    solidFoodDishId: '',
    solidFoodName: '',
    solidFoodCustomName: '',
    solidFoodGrams: '',
    solidFoodFrequentDishes: [],
    solidFoodReused: false,
    solidFoodGramPresets: [5, 10, 20, 30, 50]
  },

  onLoad(options) {
    this.setData({ solidFoodFrequentDishes: this.getFrequentSolidFoodDishes(todayStr()) })
    this.loadFrequentSolidFoods()
    if (options.id) {
      const id = decodeURIComponent(options.id)
      wx.setNavigationBarTitle({ title: '编辑记录' })
      this.setData({ isEdit: true, _id: id })
      this.loadRecord(id)
    } else {
      wx.setNavigationBarTitle({ title: '添加记录' })
      this.setData({
        date: todayStr(),
        time: nowTimeStr()
      })
      this.loadLatestFeeding(todayStr())
    }
  },

  loadLatestFeeding(date) {
    const familyCode = wx.getStorageSync('familyCode')
    if (!familyCode || !date) return
    wx.cloud.callFunction({
      name: 'getRecords',
      data: { familyCode, date }
    }).then(res => {
      if (this.data.date !== date) return
      const feedings = feedingAudit.feedingRecords((res.result && res.result.data) || [])
      this._dayFeedings = feedings
      this.setData({ latestFeeding: feedings.length ? feedings[feedings.length - 1] : null })
    }).catch(err => console.error(err))
  },

  loadRecord(_id) {
    const familyCode = wx.getStorageSync('familyCode')
    wx.showLoading({ title: '加载中...' })
    wx.cloud.callFunction({
      name: 'getRecords',
      data: { familyCode, _id }
    }).then(res => {
      wx.hideLoading()
      const list = res.result.data || []
      if (list.length > 0) {
        const r = list[0]
        const stoolDesc = r.stoolDesc || ''
        let stoolTextureIndex = -1
        let stoolColorIndex = -1
        let stoolAmountIndex = -1
        if (stoolDesc) {
          const parts = stoolDesc.split(/[,，\-、\s]+/).filter(Boolean)
          if (parts[0]) stoolTextureIndex = this.data.stoolTextures.indexOf(parts[0])
          if (parts[1]) stoolColorIndex = this.data.stoolColors.indexOf(parts[1])
          if (parts[2]) stoolAmountIndex = this.data.stoolAmounts.indexOf(parts[2])
        }
        this.setData({
          date: r.date,
          time: r.time,
          breastMilk: r.breastMilk > 0 ? String(r.breastMilk) : '',
          formula: r.formula > 0 ? String(r.formula) : '',
          stool: r.stool,
          stoolDesc,
          stoolTextureIndex,
          stoolColorIndex,
          stoolAmountIndex,
          total: r.total || 0,
          solidFoodFrequentDishes: this.getFrequentSolidFoodDishes(r.date),
          solidFood: !!r.solidFood,
          solidFoodDishId: r.solidFoodDishId || '',
          solidFoodName: r.solidFoodDishName || '',
          solidFoodCustomName: r.solidFoodDishId ? '' : (r.solidFoodDishName || ''),
          solidFoodGrams: r.solidFoodGrams > 0 ? String(r.solidFoodGrams) : ''
        })
      }
    }).catch(err => {
      wx.hideLoading()
      wx.showToast({ title: '加载失败', icon: 'none' })
    })
  },

  getFrequentSolidFoodDishes(date) {
    const birthDate = wx.getStorageSync('babyBirthDate') || ''
    const ageMonth = Math.max(6, dateUtil.monthsBetween(birthDate, date || todayStr()))
    return solidFood.rankFrequentDishes({ records: this._recentSolidFoodRecords || [], ageMonth })
  },

  loadFrequentSolidFoods() {
    const familyCode = wx.getStorageSync('familyCode')
    if (!familyCode) return
    const today = todayStr()
    wx.cloud.callFunction({
      name: 'getRecords',
      data: { familyCode, startDate: dateUtil.addDays(today, -30), endDateExclusive: dateUtil.addDays(today, 1) }
    }).then(res => {
      this._recentSolidFoodRecords = (res.result && res.result.data) || []
      this.setData({ solidFoodFrequentDishes: this.getFrequentSolidFoodDishes(this.data.date) })
    }).catch(err => console.error(err))
  },

  bindDateChange(e) {
    const date = e.detail.value
    this._dayFeedings = []
    this.setData({
      date,
      latestFeeding: null,
      solidFoodFrequentDishes: this.getFrequentSolidFoodDishes(date)
    })
    if (!this.data.isEdit) this.loadLatestFeeding(date)
  },

  bindTimeChange(e) {
    this.setData({ time: e.detail.value })
  },

  bindBreastInput(e) {
    const val = parseFloat(e.detail.value) || 0
    this.setData({
      breastMilk: e.detail.value,
      total: val + (parseFloat(this.data.formula) || 0)
    })
  },

  bindFormulaInput(e) {
    const val = parseFloat(e.detail.value) || 0
    this.setData({
      formula: e.detail.value,
      total: (parseFloat(this.data.breastMilk) || 0) + val
    })
  },

  bindStoolChange(e) {
    this.setData({ stool: e.detail.value })
  },

  bindSolidFoodChange(e) {
    const enabled = e.detail.value
    if (!enabled) {
      this.setData({
        solidFood: false,
        solidFoodDishId: '',
        solidFoodName: '',
        solidFoodCustomName: '',
        solidFoodGrams: '',
        solidFoodReused: false
      })
      return
    }

    const lastSelection = solidFood.restoreLastSelection(wx.getStorageSync('lastSolidFoodSelection'))
    if (lastSelection) {
      this.setData({
        solidFood: true,
        solidFoodDishId: lastSelection.solidFoodDishId,
        solidFoodName: lastSelection.solidFoodDishName,
        solidFoodCustomName: lastSelection.solidFoodDishId ? '' : lastSelection.solidFoodDishName,
        solidFoodGrams: String(lastSelection.solidFoodGrams),
        solidFoodReused: true
      })
      return
    }
    this.setData({ solidFood: true, solidFoodReused: false })
  },

  selectFrequentSolidFood(e) {
    const { dishId, name } = e.currentTarget.dataset
    const dish = menuData.getDishById(dishId)
    if (dish) {
      this.setData({
        solidFoodDishId: dish.id,
        solidFoodName: dish.name,
        solidFoodCustomName: '',
        solidFoodReused: false
      })
      return
    }
    if (!name) return
    this.setData({
      solidFoodDishId: '',
      solidFoodName: name,
      solidFoodCustomName: name,
      solidFoodReused: false
    })
  },

  bindSolidFoodCustomNameInput(e) {
    const name = e.detail.value
    this.setData({
      solidFoodDishId: '',
      solidFoodName: name,
      solidFoodCustomName: name,
      solidFoodReused: false
    })
  },

  bindSolidFoodGramsInput(e) {
    this.setData({ solidFoodGrams: e.detail.value, solidFoodReused: false })
  },

  useSolidFoodGramPreset(e) {
    this.setData({ solidFoodGrams: String(e.currentTarget.dataset.grams), solidFoodReused: false })
  },

  bindStoolTextureChange(e) {
    this.setData({ stoolTextureIndex: parseInt(e.detail.value) })
  },

  bindStoolColorChange(e) {
    this.setData({ stoolColorIndex: parseInt(e.detail.value) })
  },

  bindStoolAmountChange(e) {
    this.setData({ stoolAmountIndex: parseInt(e.detail.value) })
  },

  buildStoolDesc() {
    const texture = this.data.stoolTextures[this.data.stoolTextureIndex] || ''
    const color = this.data.stoolColors[this.data.stoolColorIndex] || ''
    const amount = this.data.stoolAmounts[this.data.stoolAmountIndex] || ''
    const parts = [texture, color, amount].filter(Boolean)
    return parts.join('，')
  },

  submit() {
    if (this.data.saving) return
    const familyCode = wx.getStorageSync('familyCode')
    if (!familyCode) {
      wx.showToast({ title: '缺少家庭码', icon: 'none' })
      return
    }

    const breast = parseFloat(this.data.breastMilk) || 0
    const formula = parseFloat(this.data.formula) || 0
    const solidFoodPayload = solidFood.normalize({
      enabled: this.data.solidFood,
      dishId: this.data.solidFoodDishId,
      customName: this.data.solidFoodCustomName,
      grams: this.data.solidFoodGrams
    })

    if (this.data.solidFood && !solidFoodPayload) {
      wx.showToast({ title: '请选择辅食种类并填写克数', icon: 'none' })
      return
    }

    if (breast === 0 && formula === 0 && !this.data.stool && !solidFoodPayload.solidFood) {
      wx.showToast({ title: '请至少填写奶量、大便或辅食', icon: 'none' })
      return
    }

    const payload = {
      familyCode,
      date: this.data.date,
      time: this.data.time,
      breastMilk: breast,
      formula: formula,
      total: breast + formula,
      stool: this.data.stool,
      stoolDesc: this.data.stool ? this.buildStoolDesc() : '',
      ...solidFoodPayload
    }

    const nearest = feedingAudit.nearestFeeding(this._dayFeedings, payload)
    if (!this.data.isEdit && nearest && feedingAudit.isPossibleDuplicate(nearest.minutes)) {
      wx.showModal({
        title: '可能重复记录',
        content: `距 ${nearest.record.time} 那条记录 ${nearest.minutes} 分钟。请确认这不是同一次喂养的重复录入。`,
        confirmText: '继续保存',
        cancelText: '返回检查',
        success: result => {
          if (result.confirm) this.saveRecord(payload)
        }
      })
      return
    }
    this.saveRecord(payload)
  },

  saveRecord(payload) {
    this.setData({ saving: true })
    wx.showLoading({ title: '保存中...', mask: true })
    const isEdit = this.data.isEdit
    if (isEdit) payload._id = this.data._id
    wx.cloud.callFunction({
      name: isEdit ? 'updateRecord' : 'addRecord',
      data: payload
    }).then(res => {
      wx.hideLoading()
      if (res.result && res.result.success) {
        feedingReminderCache.clearForToday(wx.getStorageSync('familyCode'), todayStr())
        if (payload.solidFood) {
          wx.setStorageSync('lastSolidFoodSelection', {
            dishId: payload.solidFoodDishId,
            name: payload.solidFoodDishName,
            grams: payload.solidFoodGrams
          })
          if (!isEdit) this.autoLogSolidFoodTrial(payload)
        }
        wx.showToast({ title: isEdit ? '修改成功' : '保存成功', icon: 'success' })
        setTimeout(() => wx.navigateBack(), 800)
        return
      }
      this.setData({ saving: false })
      wx.showToast({ title: isEdit ? '修改失败' : '保存失败', icon: 'none' })
    }).catch(err => {
      wx.hideLoading()
      this.setData({ saving: false })
      console.error(err)
      wx.showToast({ title: isEdit ? '修改失败' : '保存失败', icon: 'none' })
    })
  },

  // 录辅食自动联动试吃打卡：沿用「一次只试一种」纪律，规则见 getSolidFoodTrialTarget
  autoLogSolidFoodTrial(payload) {
    if (payload.date !== todayStr()) return
    const familyCode = wx.getStorageSync('familyCode')
    const foods = this.getSolidFoodCanonicalFoods(payload)
    if (!familyCode || foods.length === 0) return
    wx.cloud.callFunction({ name: 'foodTrial', data: { action: 'list', familyCode } }).then(res => {
      const trials = (res.result && res.result.data) || []
      const target = foodUnlock.getAutoTrialTarget(foods, trials, payload.date)
      if (target === null) return
      if (target === '') {
        wx.showToast({ title: '这道菜含多种未试食材，未自动记试吃', icon: 'none' })
        return
      }
      return wx.cloud.callFunction({
        name: 'foodTrial',
        data: { action: 'log', familyCode, foodName: target, date: payload.date }
      }).then(logRes => {
        if (logRes.result && logRes.result.success) {
          const count = Number(logRes.result.data.trialCount) || 0
          wx.showToast({
            title: count >= foodUnlock.UNLOCK_DAYS ? `${target} 已解锁 🎉` : `已自动记 ${target} 试吃 ${count}/${foodUnlock.UNLOCK_DAYS}`,
            icon: 'none'
          })
        }
      })
    }).catch(err => console.error(err))
  },

  getSolidFoodCanonicalFoods(payload) {
    if (payload.solidFoodDishId) {
      const dish = menuData.getDishById(payload.solidFoodDishId)
      if (dish) return menuData.getDishFoods(dish)
    }
    const name = payload.solidFoodDishName || ''
    return name ? menuData.getIngredientFoods(name) : []
  },

  deleteRecord() {
    if (!this.data.isEdit || !this.data._id) return

    wx.showModal({
      title: '确认删除',
      content: '删除后无法恢复，确定吗？',
      confirmColor: '#ff4d4f',
      success: (res) => {
        if (res.confirm) {
          wx.showLoading({ title: '删除中...', mask: true })
          wx.cloud.callFunction({
            name: 'deleteRecord',
            data: { _id: this.data._id, familyCode: wx.getStorageSync('familyCode') }
          }).then(() => {
            wx.hideLoading()
            feedingReminderCache.clearForToday(wx.getStorageSync('familyCode'), todayStr())
            wx.showToast({ title: '已删除', icon: 'success' })
            setTimeout(() => wx.navigateBack(), 800)
          }).catch(err => {
            wx.hideLoading()
            wx.showToast({ title: '删除失败', icon: 'none' })
          })
        }
      }
    })
  },

  goBack() {
    wx.navigateBack()
  }
})
