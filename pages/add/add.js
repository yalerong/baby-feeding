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
    solidFoodFoods: [],
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
    // 连同前一天一起拉：凌晨补录要和昨晚的记录比对
    wx.cloud.callFunction({
      name: 'getRecords',
      data: { familyCode, startDate: dateUtil.addDays(date, -1), endDateExclusive: dateUtil.addDays(date, 1) }
    }).then(res => {
      if (this.data.date !== date) return
      const feedings = feedingAudit.feedingRecords((res.result && res.result.data) || [])
      const sameDay = feedings.filter(record => record.date === date)
      this._dayFeedings = feedings
      this.setData({ latestFeeding: sameDay.length ? sameDay[sameDay.length - 1] : null })
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
        this._originalRecord = r
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
          solidFoodGrams: r.solidFoodGrams > 0 ? String(r.solidFoodGrams) : '',
          solidFoodFoods: Array.isArray(r.solidFoodFoods) ? r.solidFoodFoods : []
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
    return solidFood.rankFrequentDishes({
      records: this._recentSolidFoodRecords || [],
      ageMonth,
      customDishes: this._customDishes || []
    })
  },

  // 常吃列表 = 最近 30 天辅食记录 + 本周菜单里家长自己写的菜（含未保存草稿）
  loadFrequentSolidFoods() {
    const familyCode = wx.getStorageSync('familyCode')
    if (!familyCode) return
    const today = todayStr()
    const birthDate = wx.getStorageSync('babyBirthDate') || ''
    const recordsReq = wx.cloud.callFunction({
      name: 'getRecords',
      data: { familyCode, startDate: dateUtil.addDays(today, -30), endDateExclusive: dateUtil.addDays(today, 1) }
    }).then(res => (res.result && res.result.data) || []).catch(err => { console.error(err); return [] })
    let menuReq = Promise.resolve([])
    if (birthDate) {
      const weekStart = menuData.getDefaultPlanningWeekStart({ birthDate, today })
      const draft = wx.getStorageSync(`menuDraft:${weekStart}`)
      menuReq = wx.cloud.callFunction({ name: 'weeklyMenu', data: { action: 'get', familyCode, weekStart } })
        .then(res => solidFood.customDishesFromPlan(res.result && res.result.data))
        .catch(() => [])
        .then(saved => {
          const merged = solidFood.customDishesFromPlan(draft)
          saved.forEach(dish => { if (!merged.some(item => item.name === dish.name)) merged.push(dish) })
          return merged
        })
    }
    Promise.all([recordsReq, menuReq]).then(([records, customDishes]) => {
      this._recentSolidFoodRecords = records
      this._customDishes = customDishes
      this.setData({ solidFoodFrequentDishes: this.getFrequentSolidFoodDishes(this.data.date) })
    })
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
        solidFoodFoods: [],
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
        solidFoodFoods: lastSelection.solidFoodFoods || [],
        solidFoodReused: true
      })
      return
    }
    this.setData({ solidFood: true, solidFoodReused: false })
  },

  selectFrequentSolidFood(e) {
    const { dishId, name, foods } = e.currentTarget.dataset
    const dish = menuData.getDishById(dishId)
    if (dish) {
      this.setData({
        solidFoodDishId: dish.id,
        solidFoodName: dish.name,
        solidFoodCustomName: '',
        solidFoodFoods: [],
        solidFoodReused: false
      })
      return
    }
    if (!name) return
    this.setData({
      solidFoodDishId: '',
      solidFoodName: name,
      solidFoodCustomName: name,
      solidFoodFoods: Array.isArray(foods) ? foods : [],
      solidFoodReused: false
    })
  },

  bindSolidFoodCustomNameInput(e) {
    const name = e.detail.value
    this.setData({
      solidFoodDishId: '',
      solidFoodName: name,
      solidFoodCustomName: name,
      solidFoodFoods: [],
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
      ...solidFoodPayload,
      solidFoodFoods: solidFoodPayload.solidFood ? (this.data.solidFoodFoods || []) : []
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
            grams: payload.solidFoodGrams,
            solidFoodFoods: payload.solidFoodFoods
          })
        }
        this.syncSolidFoodTrial({
          before: isEdit ? this._originalRecord : null,
          after: payload,
          recordId: isEdit ? this.data._id : (res.result._id || '')
        })
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

  // 保存/修改/删除辅食记录后同步试吃打卡：先回退旧记录当天的自动打卡，再给新记录打卡。
  // 只处理不晚于今天的记录；早于最近一次试吃日期的补录由 getAutoTrialTarget 拒绝。
  syncSolidFoodTrial({ before, after, recordId }) {
    const familyCode = wx.getStorageSync('familyCode')
    const today = todayStr()
    const beforeSolid = !!(before && before.solidFood && before.date && before.date <= today)
    const afterSolid = !!(after && after.solidFood && after.date && after.date <= today)
    if (!familyCode || (!beforeSolid && !afterSolid)) return Promise.resolve()
    return wx.cloud.callFunction({ name: 'foodTrial', data: { action: 'list', familyCode } }).then(res => {
      const trials = (res.result && res.result.data) || []
      const extraFoods = menuData.filterExtraFoods(trials.map(trial => trial.foodName))
      const afterFoods = afterSolid
        ? solidFood.getCanonicalFoods({ dishId: after.solidFoodDishId, name: after.solidFoodDishName, foods: after.solidFoodFoods, extraFoods })
        : []
      let chain = Promise.resolve(trials)
      if (beforeSolid) {
        const beforeFoods = solidFood.getCanonicalFoods({ dishId: before.solidFoodDishId, name: before.solidFoodDishName, foods: before.solidFoodFoods, extraFoods })
        chain = this.loadOtherSolidFoods(before.date, recordId, extraFoods).then(otherSources => {
          const otherFoods = Object.keys(otherSources)
          const sameDayAfter = afterSolid && after.date === before.date
          const covered = otherFoods.concat(sameDayAfter ? afterFoods : [])
          const revert = foodUnlock.getTrialRevertFoods({ foods: beforeFoods, otherFoods: covered, trials, date: before.date, recordId })
          // 本记录打的卡、但同一天别的记录还吃着：把来源移交过去（改成同一天同食材时来源仍是本记录，不用动）
          const transfer = foodUnlock.getTrialRevertFoods({ foods: beforeFoods, otherFoods: sameDayAfter ? afterFoods : [], trials, date: before.date, recordId })
            .filter(food => otherSources[food])
          const calls = revert.map(food => ({ action: 'undoLog', familyCode, foodName: food, date: before.date }))
            .concat(transfer.map(food => ({ action: 'transferLogSource', familyCode, foodName: food, date: before.date, recordId: otherSources[food] })))
          if (calls.length === 0) return trials
          return calls.reduce((prev, data) => prev.then(() => wx.cloud.callFunction({ name: 'foodTrial', data }).then(res => {
            if (!res.result || !res.result.success) throw new Error(`${data.foodName}：${(res.result && res.result.error) || '试吃状态更新失败'}`)
          })), Promise.resolve())
            .then(() => wx.cloud.callFunction({ name: 'foodTrial', data: { action: 'list', familyCode } }))
            .then(listRes => {
              if (revert.length) wx.showToast({ title: `已回退 ${revert.join('、')} 当天试吃`, icon: 'none' })
              return (listRes.result && listRes.result.data) || []
            })
            .catch(err => {
              // 回退/移交没成功就不再给新记录打卡，避免试吃状态和记录对不上
              console.error(err)
              wx.showToast({ title: `试吃回退失败：${err.message || ''}`.slice(0, 40), icon: 'none', duration: 2500 })
              return null
            })
        }).catch(err => {
          // 同日其它记录拉不到时宁可不回退，也不能把别的记录撑着的试吃减掉
          console.error(err)
          return trials
        })
      }
      return chain.then(freshTrials => {
        if (!freshTrials || !afterSolid) return
        const nameChanged = !before || before.solidFoodDishName !== after.solidFoodDishName
        if (afterFoods.length === 0) {
          if (nameChanged) wx.showToast({ title: '没认出食材，未自动记试吃；可在菜单-食物解锁里手动记', icon: 'none', duration: 2500 })
          return
        }
        return this.autoLogSolidFoodTrial(after, afterFoods, freshTrials, recordId)
      })
    }).catch(err => console.error(err))
  },

  // 同一天其它记录吃到的食材 → 其中一条记录的 _id，用来判断回退时是否还有别的记录撑着、以及来源移交给谁
  loadOtherSolidFoods(date, recordId, extraFoods) {
    const familyCode = wx.getStorageSync('familyCode')
    return wx.cloud.callFunction({ name: 'getRecords', data: { familyCode, date } }).then(res => {
      if (!res.result || !res.result.success) throw new Error((res.result && res.result.error) || 'getRecords failed')
      const sources = {}
      ;((res.result && res.result.data) || []).forEach(record => {
        if (!record || record._id === recordId || !record.solidFood) return
        solidFood.getCanonicalFoods({ dishId: record.solidFoodDishId, name: record.solidFoodDishName, foods: record.solidFoodFoods, extraFoods })
          .forEach(food => { if (!sources[food]) sources[food] = record._id || '' })
      })
      return sources
    })
  },

  // 沿用「一次只试一种」纪律，规则见 foodUnlock.getAutoTrialTarget
  autoLogSolidFoodTrial(payload, foods, trials, recordId) {
    const familyCode = wx.getStorageSync('familyCode')
    const target = foodUnlock.getAutoTrialTarget(foods, trials, payload.date)
    if (target === null) return
    if (target === '') {
      wx.showToast({ title: '这道菜含多种未试食材，未自动记试吃', icon: 'none' })
      return
    }
    const dateLabel = payload.date === todayStr() ? '' : `${payload.date.substring(5)} `
    return wx.cloud.callFunction({
      name: 'foodTrial',
      data: { action: 'log', familyCode, foodName: target, date: payload.date, recordId: recordId || '' }
    }).then(logRes => {
      if (logRes.result && logRes.result.success) {
        const count = Number(logRes.result.data.trialCount) || 0
        wx.showToast({
          title: count >= foodUnlock.UNLOCK_DAYS ? `${target} 已解锁 🎉` : `已自动记 ${dateLabel}${target} 试吃 ${count}/${foodUnlock.UNLOCK_DAYS}`,
          icon: 'none'
        })
      } else if (logRes.result && logRes.result.error) {
        wx.showToast({ title: `未记试吃：${logRes.result.error}`, icon: 'none', duration: 2500 })
      }
    })
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
          }).then(res => {
            wx.hideLoading()
            if (!res.result || !res.result.success) {
              wx.showToast({ title: '删除失败', icon: 'none' })
              return
            }
            feedingReminderCache.clearForToday(wx.getStorageSync('familyCode'), todayStr())
            this.syncSolidFoodTrial({ before: this._originalRecord, after: null, recordId: this.data._id })
            wx.showToast({ title: '已删除', icon: 'success' })
            setTimeout(() => wx.navigateBack(), 800)
          }).catch(err => {
            wx.hideLoading()
            console.error(err)
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
