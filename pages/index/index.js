const dateUtil = require('../../utils/date.js')
const supplementSync = require('../../utils/supplementSync.js')
const familyRecordSync = require('../../utils/familyRecordSync.js')
const feedingAudit = require('../../utils/feedingAudit.js')
const feedingReminderCache = require('../../utils/feedingReminderCache.js')
const dailyReviewError = require('../../utils/dailyReviewError.js')
const todayStr = dateUtil.todayStr
const nowTimeStr = dateUtil.nowTimeStr

const RECOMMENDATION_WINDOW_DAYS = 10
const RECOMMENDATION_READY_TEXT = `根据过去 ${RECOMMENDATION_WINDOW_DAYS} 个完整日记录，白天与夜间分别计算`

function toTimestamp(dateStr, timeStr) {
  return dateUtil.toBeijingTimestamp(dateStr, timeStr)
}

function formatIntervalText(minutes) {
  if (minutes < 0) return ''
  if (minutes < 1) return '刚刚'
  if (minutes < 60) return minutes + ' 分钟'
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (m === 0) return h + ' 小时'
  return h + ' 小时 ' + m + ' 分钟'
}

Page({
  data: {
    familyCode: '',
    todayDate: '',
    currentDate: '',
    records: [],
    quickBreast: '',
    quickFormula: '',
    quickSaving: false,
    cryAlertTemplateId: '',
    babyBirthDate: '',
    babyDays: 0,
    babyAgeText: '',
    babyMilestone: '',
    lastFeedingTs: 0,
    sinceLastFeedingText: '',
    feedingReminderMinutes: feedingAudit.DEFAULT_REMINDER_MINUTES,
    feedingReminderAuto: true,
    feedingRecommendationText: `正在根据近 ${RECOMMENDATION_WINDOW_DAYS} 天喝奶记录计算建议`,
    feedingPeriodRecommendations: {
      daytime: { minutes: 240, sampleCount: 0 },
      nighttime: { minutes: 240, sampleCount: 0 }
    },
    feedingReminderPickerLabel: '4 小时',
    feedingReminderOptions: [
      { minutes: 180, label: '3 小时' },
      { minutes: 210, label: '3.5 小时' },
      { minutes: 240, label: '4 小时' },
      { minutes: 270, label: '4.5 小时' },
      { minutes: 300, label: '5 小时' }
    ],
    feedingReminderIndex: 2,
    feedingIntervalReminder: {
      visible: false,
      text: ''
    },
    dailyReview: {
      visible: false,
      date: '',
      feedingCount: 0,
      totalMilk: 0,
      closePairCount: 0
    },
    supplementReminder: {
      visible: false,
      day: 0,
      name: '',
      nextName: '',
      taken: false,
      title: '',
      statusText: '',
      actionText: ''
    },
    todayStats: {
      count: 0,
      total: 0,
      breast: 0,
      formula: 0,
      ratio: '0%',
      stool: 0
    }
  },

  onShow() {
    const familyCode = wx.getStorageSync('familyCode') || 'FAMILY'
    const today = todayStr()
    const currentDate = this.data.currentDate || today
    const savedReminderMinutes = Number(wx.getStorageSync('feedingReminderMinutes'))
    const feedingReminderMinutes = savedReminderMinutes || feedingAudit.DEFAULT_REMINDER_MINUTES
    const feedingReminderIndex = this.data.feedingReminderOptions.findIndex(item => item.minutes === feedingReminderMinutes)

    this.setData({
      familyCode,
      todayDate: today,
      currentDate,
      feedingReminderMinutes,
      feedingReminderAuto: !savedReminderMinutes,
      feedingReminderIndex: feedingReminderIndex === -1 ? 2 : feedingReminderIndex,
      feedingReminderPickerLabel: feedingAudit.formatReminderHours(feedingReminderMinutes),
      cryAlertTemplateId: getApp().globalData.cryAlertTemplateId || ''
    })

    this.loadHomeSummary(currentDate, today)
    this.refreshBaby(today)
    this.startSinceTimer()
  },

  // 启动聚合：一次云调用取回当天记录/昨日回顾/补剂状态/近10日建议，失败回退多请求路径
  loadHomeSummary(date, today) {
    const familyCode = this.data.familyCode
    const reminder = dateUtil.supplementReminder(wx.getStorageSync('babyBirthDate') || '', today)
    const supplementName = (date === today && reminder.name) ? reminder.name : ''
    const reviewDate = feedingAudit.getPreviousDayReviewDate(today) || ''

    const cacheKey = feedingReminderCache.getKey(familyCode, today)
    const cachedRecommendation = wx.getStorageSync(cacheKey)
    const hasRecommendationCache = !!(cachedRecommendation && cachedRecommendation.daytime && cachedRecommendation.nighttime)
    if (hasRecommendationCache) {
      this.setData({
        feedingPeriodRecommendations: cachedRecommendation,
        feedingRecommendationText: RECOMMENDATION_READY_TEXT
      }, () => this.refreshSinceLastFeeding())
    }

    if (reviewDate) this._dailyReviewRequestDate = reviewDate
    this._suppressSupplementFetch = !!supplementName

    wx.cloud.callFunction({
      name: 'homeSummary',
      data: {
        familyCode,
        date,
        reviewDate,
        supplementName,
        recommendation: hasRecommendationCache
          ? null
          : { startDate: dateUtil.addDays(today, -RECOMMENDATION_WINDOW_DAYS), endDateExclusive: today }
      }
    }).then(res => {
      const result = res.result
      if (!result || !result.success) throw new Error((result && result.error) || 'homeSummary failed')

      if (this.data.currentDate === date) {
        this._prevFeedingByDate = this._prevFeedingByDate || {}
        this._prevFeedingByDate[date] = result.prevFeeding || null
        this.calculateStats(result.records || [], result.prevFeeding || null)
        this.startFeedingSync(familyCode, date)
      }

      if (result.recommendationRecords) {
        const recommendations = feedingAudit.recommendReminderByPeriod(result.recommendationRecords)
        wx.setStorageSync(cacheKey, recommendations)
        this.setData({
          feedingPeriodRecommendations: recommendations,
          feedingRecommendationText: RECOMMENDATION_READY_TEXT
        }, () => this.refreshSinceLastFeeding())
      }

      if (supplementName && result.supplementTaken !== null &&
        this.data.todayDate === today && this.data.supplementReminder.name === supplementName) {
        this.applySupplementReminder(reminder, !!result.supplementTaken)
      }

      if (reviewDate && result.review &&
        feedingAudit.getPreviousDayReviewDate(this.data.todayDate) === reviewDate) {
        if (result.review.confirmed) {
          this.setData({ dailyReview: { visible: false, date: '', feedingCount: 0, totalMilk: 0, closePairCount: 0 } })
        } else {
          const review = feedingAudit.buildDailyReview(result.review.records || [])
          this.setData({
            dailyReview: {
              visible: true,
              date: reviewDate,
              feedingCount: review.feedingCount,
              totalMilk: review.totalMilk,
              closePairCount: review.closePairs.length
            }
          })
        }
      }
    }).catch(err => {
      console.error(err)
      if (reviewDate && this._dailyReviewRequestDate === reviewDate) this._dailyReviewRequestDate = ''
      this._suppressSupplementFetch = false
      this.fetchRecords(date)
      if (!hasRecommendationCache) this.loadFeedingReminderRecommendation()
      if (supplementName) this.fetchSupplementTaken(reminder, today)
    })
  },

  onHide() {
    this.stopSinceTimer()
    this.stopSupplementSync()
    this.stopFeedingSync()
  },

  onUnload() {
    this.stopSinceTimer()
    this.stopSupplementSync()
    this.stopFeedingSync()
  },

  startSinceTimer() {
    this.stopSinceTimer()
    this._sinceTimer = setInterval(() => {
      this.refreshSinceLastFeeding()
    }, 60000)
  },

  stopSinceTimer() {
    if (this._sinceTimer) {
      clearInterval(this._sinceTimer)
      this._sinceTimer = null
    }
  },

  refreshSinceLastFeeding() {
    if (this.data.currentDate !== this.data.todayDate || !this.data.lastFeedingTs) {
      if (this.data.sinceLastFeedingText || this.data.feedingIntervalReminder.visible) {
        this.setData({
          sinceLastFeedingText: '',
          feedingIntervalReminder: { visible: false, text: '' }
        })
      }
      return
    }
    const diff = Math.floor((dateUtil.nowBeijingTimestamp() - this.data.lastFeedingTs) / 60000)
    const period = feedingAudit.getFeedingPeriod({ time: this.data.lastFeedingTime })
    const suggested = this.data.feedingPeriodRecommendations[period]
    const reminderMinutes = this.data.feedingReminderAuto && suggested ? suggested.minutes : this.data.feedingReminderMinutes
    const overdue = feedingAudit.isFeedingOverdue(diff, reminderMinutes)
    this.setData({
      sinceLastFeedingText: formatIntervalText(diff),
      feedingIntervalReminder: overdue
        ? { visible: true, text: `已达到${period === 'nighttime' ? '夜间' : '白天'} ${feedingAudit.formatReminderHours(reminderMinutes)} 提醒间隔，请确认是否需要喂奶或补记。` }
        : { visible: false, text: '' }
    })
  },

  onFeedingReminderChange(e) {
    const index = Number(e.detail.value)
    const option = this.data.feedingReminderOptions[index]
    if (!option) return
    wx.setStorageSync('feedingReminderMinutes', option.minutes)
    this.setData({
      feedingReminderMinutes: option.minutes,
      feedingReminderIndex: index,
      feedingReminderPickerLabel: feedingAudit.formatReminderHours(option.minutes),
      feedingReminderAuto: false
    }, () => this.refreshSinceLastFeeding())
  },

  loadFeedingReminderRecommendation() {
    const endDateExclusive = this.data.todayDate
    const startDate = dateUtil.addDays(endDateExclusive, -RECOMMENDATION_WINDOW_DAYS)
    const cacheKey = feedingReminderCache.getKey(this.data.familyCode, endDateExclusive)
    const cached = wx.getStorageSync(cacheKey)
    if (cached && cached.daytime && cached.nighttime) {
      this.setData({
        feedingPeriodRecommendations: cached,
        feedingRecommendationText: RECOMMENDATION_READY_TEXT
      }, () => this.refreshSinceLastFeeding())
      return
    }
    wx.cloud.callFunction({
      name: 'getRecords',
      data: {
        familyCode: this.data.familyCode,
        startDate,
        endDateExclusive
      }
    }).then(res => {
      const recommendations = feedingAudit.recommendReminderByPeriod((res.result && res.result.data) || [])
      wx.setStorageSync(cacheKey, recommendations)
      const data = {
        feedingPeriodRecommendations: recommendations,
        feedingRecommendationText: RECOMMENDATION_READY_TEXT
      }
      this.setData(data, () => this.refreshSinceLastFeeding())
    }).catch(err => {
      console.error(err)
      this.setData({ feedingRecommendationText: `暂时无法计算近 ${RECOMMENDATION_WINDOW_DAYS} 天建议，暂用默认间隔` })
    })
  },

  refreshBaby(today) {
    const birth = wx.getStorageSync('babyBirthDate') || ''
    if (!birth) {
      this.setData({ babyBirthDate: '', babyDays: 0, babyAgeText: '', babyMilestone: '' }, () => {
        this.refreshSupplementReminder()
      })
      return
    }
    const days = dateUtil.daysBetween(birth, today)
    this.setData({
      babyBirthDate: birth,
      babyDays: days,
      babyAgeText: dateUtil.ageText(birth, today),
      babyMilestone: dateUtil.milestone(days)
    }, () => {
      this.refreshSupplementReminder()
    })
  },

  applySupplementReminder(reminder, taken) {
    this.setData({
      supplementReminder: {
        visible: true,
        day: reminder.day,
        name: reminder.name,
        nextName: reminder.nextName,
        taken,
        title: '今天该吃 ' + reminder.name,
        statusText: taken ? '已记录' : '还没记录',
        actionText: taken ? '取消已吃' : '标记已吃'
      }
    })
  },

  refreshSupplementReminder() {
    if (this.data.currentDate !== this.data.todayDate) {
      this.stopSupplementSync()
      this.setData({
        supplementReminder: {
          visible: false,
          day: 0,
          name: '',
          nextName: '',
          taken: false,
          title: '',
          statusText: '',
          actionText: ''
        }
      })
      return
    }

    const reminder = dateUtil.supplementReminder(this.data.babyBirthDate, this.data.todayDate)
    if (!reminder.name) {
      this.stopSupplementSync()
      this.setData({
        supplementReminder: {
          visible: true,
          day: 0,
          name: '',
          nextName: '',
          taken: false,
          title: 'VD/VAD 提醒',
          statusText: '设置宝宝生日后自动轮换',
          actionText: ''
        }
      })
      return
    }

    this.applySupplementReminder(reminder, this.data.supplementReminder.taken)

    const date = this.data.todayDate
    this.startSupplementSync(reminder, date)
    this.fetchSupplementTaken(reminder, date)
  },

  fetchSupplementTaken(reminder, date) {
    // 启动时聚合接口已带回补剂状态，跳过这一次单独查询
    if (this._suppressSupplementFetch) {
      this._suppressSupplementFetch = false
      return
    }
    const key = supplementSync.getSupplementSyncKey({
      familyCode: this.data.familyCode,
      date,
      name: reminder.name
    })
    wx.cloud.callFunction({
      name: 'supplement',
      data: {
        action: 'get',
        familyCode: this.data.familyCode,
        date,
        name: reminder.name
      }
    }).then(res => {
      if (!res.result || !res.result.success) return
      if (this._supplementSyncKey && this._supplementSyncKey !== key) return
      if (this.data.todayDate !== date || this.data.supplementReminder.name !== reminder.name) return
      this.applySupplementReminder(reminder, !!res.result.taken)
    }).catch(err => {
      console.error(err)
    })
  },

  startSupplementSync(reminder, date) {
    const familyCode = this.data.familyCode
    if (!supplementSync.shouldSyncSupplement({
      currentDate: this.data.currentDate,
      todayDate: this.data.todayDate,
      familyCode,
      name: reminder.name
    })) {
      this.stopSupplementSync()
      return
    }

    const key = supplementSync.getSupplementSyncKey({ familyCode, date, name: reminder.name })
    if (this._supplementSyncKey === key) return

    this.stopSupplementSync()
    this._supplementSyncKey = key
    this.startSupplementWatcher(reminder, date, key)
  },

  startSupplementWatcher(reminder, date, key) {
    try {
      if (!wx.cloud || !wx.cloud.database) return
      const db = wx.cloud.database()
      this._supplementWatcher = db.collection('supplement_records')
        .where({
          familyCode: this.data.familyCode,
          date,
          name: reminder.name
        })
        .watch({
          onChange: snapshot => {
            if (this._supplementSyncKey !== key) return
            this.applySupplementReminder(reminder, supplementSync.takenFromWatchSnapshot(snapshot))
          },
          onError: err => {
            console.error(err)
          }
        })
    } catch (err) {
      console.error(err)
    }
  },

  stopSupplementSync() {
    this._supplementSyncKey = ''
    if (this._supplementWatcher) {
      this._supplementWatcher.close()
      this._supplementWatcher = null
    }
  },

  toggleSupplementTaken() {
    const reminder = this.data.supplementReminder
    if (!reminder.name || this._supplementSaving) return

    const nextTaken = !reminder.taken
    this._supplementSaving = true
    wx.cloud.callFunction({
      name: 'supplement',
      data: {
        action: 'set',
        familyCode: this.data.familyCode,
        date: this.data.todayDate,
        name: reminder.name,
        taken: nextTaken
      }
    }).then(res => {
      this._supplementSaving = false
      if (res.result && res.result.success) {
        this.applySupplementReminder(reminder, nextTaken)
        wx.showToast({
          title: nextTaken ? '已标记' : '已取消',
          icon: 'none'
        })
      } else {
        wx.showToast({ title: supplementSync.operationFailureTitle(res), icon: 'none' })
      }
    }).catch(err => {
      this._supplementSaving = false
      console.error(err)
      wx.showToast({ title: supplementSync.operationFailureTitle(err), icon: 'none' })
    })
  },

  onBirthDateChange(e) {
    const date = e.detail.value
    wx.setStorageSync('babyBirthDate', date)
    this.refreshBaby(this.data.todayDate)
  },

  bindDateChange(e) {
    const date = e.detail.value
    this.stopFeedingSync()
    this.setData({ currentDate: date }, () => {
      this.refreshSupplementReminder()
    })
    this.fetchRecords(date)
  },

  fetchRecords(date) {
    wx.cloud.callFunction({
      name: 'getRecords',
      data: {
        familyCode: this.data.familyCode,
        date: date
      }
    }).then(res => {
      if (this.data.currentDate !== date) return
      const records = res.result.data || []
      const prevFeeding = res.result.prevFeeding || null
      this._prevFeedingByDate = this._prevFeedingByDate || {}
      this._prevFeedingByDate[date] = prevFeeding
      this.calculateStats(records, prevFeeding)
      this.startFeedingSync(this.data.familyCode, date)
    }).catch(err => {
      console.error(err)
      wx.showToast({ title: '获取记录失败', icon: 'none' })
    })
  },

  startFeedingSync(familyCode, date) {
    if (!familyRecordSync.shouldSyncFamilyRecords({ familyCode }) || !date) {
      this.stopFeedingSync()
      return
    }

    const key = familyRecordSync.getFamilySyncKey({ familyCode, date })
    if (this._feedingSyncKey === key) return

    this.stopFeedingSync()
    this._feedingSyncKey = key
    try {
      if (!wx.cloud || !wx.cloud.database) return
      const db = wx.cloud.database()
      this._feedingWatcher = db.collection('feeding_records')
        .where({ familyCode, date })
        .orderBy('time', 'asc')
        .watch({
          onChange: snapshot => {
            if (this._feedingSyncKey !== key) return
            const prevFeeding = this._prevFeedingByDate && this._prevFeedingByDate[date]
              ? this._prevFeedingByDate[date]
              : null
            this.calculateStats(familyRecordSync.recordsFromWatchSnapshot(snapshot), prevFeeding)
          },
          onError: err => {
            console.error(err)
          }
        })
    } catch (err) {
      console.error(err)
    }
  },

  stopFeedingSync() {
    this._feedingSyncKey = ''
    if (this._feedingWatcher) {
      this._feedingWatcher.close()
      this._feedingWatcher = null
    }
  },

  calculateStats(records, prevFeeding) {
    let breast = 0
    let formula = 0
    let stool = 0
    let count = 0
    const now = dateUtil.nowBeijingTimestamp()
    let chainTs = prevFeeding ? toTimestamp(prevFeeding.date, prevFeeding.time) : null
    let mostRecentPastTs = (chainTs !== null && chainTs <= now) ? chainTs : 0
    let mostRecentPastTime = mostRecentPastTs && prevFeeding ? prevFeeding.time : ''

    const enriched = records.map(r => {
      const breastMilk = r.breastMilk || 0
      const formulaMilk = r.formula || 0
      breast += breastMilk
      formula += formulaMilk
      const isFeeding = breastMilk + formulaMilk > 0
      if (isFeeding) count += 1
      if (r.stool) stool += 1

      let intervalText = ''
      if (isFeeding) {
        const curTs = toTimestamp(r.date, r.time)
        if (chainTs !== null && curTs !== null) {
          intervalText = formatIntervalText(Math.floor((curTs - chainTs) / 60000))
        }
        if (curTs !== null) {
          chainTs = curTs
          if (curTs <= now) {
            mostRecentPastTs = curTs
            mostRecentPastTime = r.time
          }
        }
      }
      return Object.assign({}, r, { intervalText })
    })
    const total = breast + formula
    const ratio = total === 0 ? '0%' : (breast / total * 100).toFixed(1) + '%'

    this.setData({
      records: enriched,
      lastFeedingTs: mostRecentPastTs,
      lastFeedingTime: mostRecentPastTime,
      todayStats: {
        count,
        total,
        breast,
        formula,
        ratio,
        stool
      }
    }, () => {
      this.refreshSinceLastFeeding()
      this.refreshDailyReview()
    })
  },

  refreshDailyReview() {
    const reviewDate = feedingAudit.getPreviousDayReviewDate(this.data.todayDate)
    if (!reviewDate) {
      this.setData({ dailyReview: { visible: false, date: '', feedingCount: 0, totalMilk: 0, closePairCount: 0 } })
      return
    }
    if (this._dailyReviewRequestDate === reviewDate) return
    this._dailyReviewRequestDate = reviewDate

    wx.cloud.callFunction({
      name: 'dailyReview',
      data: { action: 'get', familyCode: this.data.familyCode, date: reviewDate }
    }).then(res => {
      if (feedingAudit.getPreviousDayReviewDate(this.data.todayDate) !== reviewDate) return
      if (res.result && res.result.success && res.result.confirmed) {
        this.setData({ dailyReview: { visible: false, date: '', feedingCount: 0, totalMilk: 0, closePairCount: 0 } })
        return null
      }
      return wx.cloud.callFunction({
        name: 'getRecords',
        data: { familyCode: this.data.familyCode, date: reviewDate }
      })
    }).then(res => {
      if (!res || feedingAudit.getPreviousDayReviewDate(this.data.todayDate) !== reviewDate) return
      const review = feedingAudit.buildDailyReview((res.result && res.result.data) || [])
      this.setData({
        dailyReview: {
          visible: true,
          date: reviewDate,
          feedingCount: review.feedingCount,
          totalMilk: review.totalMilk,
          closePairCount: review.closePairs.length
        }
      })
    }).catch(err => {
      this._dailyReviewRequestDate = ''
      console.error(err)
    })
  },

  confirmDailyReview() {
    const reviewDate = this.data.dailyReview.date
    if (!reviewDate) return
    wx.cloud.callFunction({
      name: 'dailyReview',
      data: { action: 'confirm', familyCode: this.data.familyCode, date: reviewDate }
    }).then(res => {
      if (!res.result || !res.result.success) throw new Error((res.result && res.result.error) || 'confirm failed')
      this.setData({
        dailyReview: {
          ...this.data.dailyReview,
          visible: false
        }
      })
    }).catch(err => {
      console.error(err)
      wx.showToast({ title: dailyReviewError.formatDailyReviewError(err), icon: 'none' })
    })
  },

  goAdd() {
    wx.navigateTo({ url: '/pages/add/add' })
  },

  enableCryAlert() {
    const templateId = this.data.cryAlertTemplateId
    if (!templateId || templateId === 'YOUR_CRY_ALERT_TEMPLATE_ID') {
      wx.showToast({ title: '请先配置哭声提醒模板', icon: 'none' })
      return
    }

    wx.requestSubscribeMessage({
      tmplIds: [templateId],
      success: result => {
        if (result[templateId] !== 'accept') {
          wx.showToast({ title: '未授权哭声提醒', icon: 'none' })
          return
        }

        wx.cloud.callFunction({
          name: 'cryAlertSubscription',
          data: { action: 'grant', templateId }
        }).then(res => {
          if (res.result && res.result.success) {
            wx.showToast({ title: '哭声提醒已开启', icon: 'success' })
          } else {
            wx.showToast({ title: '提醒授权保存失败', icon: 'none' })
          }
        }).catch(err => {
          console.error(err)
          wx.showToast({ title: '提醒授权保存失败', icon: 'none' })
        })
      },
      fail: err => {
        console.error(err)
        wx.showToast({ title: '提醒授权失败', icon: 'none' })
      }
    })
  },

  goBatch() {
    wx.navigateTo({ url: '/pages/batch/batch' })
  },

  goEdit(e) {
    const id = e.currentTarget.dataset.id
    wx.navigateTo({ url: '/pages/add/add?id=' + encodeURIComponent(id) })
  },

  goToday() {
    if (this.data.currentDate === this.data.todayDate) return
    this.stopFeedingSync()
    this.setData({ currentDate: this.data.todayDate }, () => {
      this.refreshSupplementReminder()
    })
    this.fetchRecords(this.data.todayDate)
  },

  onQuickBreast(e) {
    this.setData({ quickBreast: e.detail.value })
  },

  onQuickFormula(e) {
    this.setData({ quickFormula: e.detail.value })
  },

  quickSave() {
    if (this.data.quickSaving) return
    const breast = parseFloat(this.data.quickBreast) || 0
    const formula = parseFloat(this.data.quickFormula) || 0
    if (breast === 0 && formula === 0) {
      wx.showToast({ title: '请填写母乳或奶粉', icon: 'none' })
      return
    }

    const familyCode = this.data.familyCode
    if (!familyCode) {
      wx.showToast({ title: '缺少家庭码', icon: 'none' })
      return
    }

    this.setData({ quickSaving: true })
    wx.showLoading({ title: '保存中...', mask: true })
    const saveDate = todayStr()
    wx.cloud.callFunction({
      name: 'addRecord',
      data: {
        familyCode,
        date: saveDate,
        time: nowTimeStr(),
        breastMilk: breast,
        formula: formula,
        total: breast + formula,
        stool: false,
        stoolDesc: ''
      }
    }).then(res => {
      wx.hideLoading()
      if (res.result && res.result.success) {
        wx.showToast({ title: '已保存', icon: 'success' })
        this.setData({ quickBreast: '', quickFormula: '', quickSaving: false })
        if (saveDate !== this.data.todayDate) {
          this.onShow()
        } else if (this.data.currentDate === this.data.todayDate) {
          this.fetchRecords(this.data.todayDate)
        }
      } else {
        this.setData({ quickSaving: false })
        wx.showToast({ title: '保存失败', icon: 'none' })
      }
    }).catch(() => {
      wx.hideLoading()
      this.setData({ quickSaving: false })
      wx.showToast({ title: '保存失败', icon: 'none' })
    })
  }
})
