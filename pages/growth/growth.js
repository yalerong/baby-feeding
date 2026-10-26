const familyRecordSync = require('../../utils/familyRecordSync.js')
const { withChartCanvas } = require('../../utils/chartCanvas.js')
const dateUtil = require('../../utils/date.js')
const growthStandards = require('../../utils/growthStandards.js')
const pageSnapshot = require('../../utils/pageSnapshot.js')

function fetchGrowthRecords(familyCode) {
  const db = wx.cloud.database()
  const fetchPage = (skip, collected) => db.collection('growth_records')
    .where({ familyCode })
    .orderBy('date', 'desc')
    .orderBy('_id', 'desc')
    .skip(skip)
    .limit(20)
    .get()
    .then(res => {
      const page = res.data || []
      const records = collected.concat(page)
      return page.length === 20 ? fetchPage(skip + 20, records) : records
    })
  return fetchPage(0, [])
}

Page({
  data: {
    records: [],
    recordCount: 0,
    historyExpanded: true,
    viewMode: 'weight',
    weightOverflowCount: 0,
    weightOverflowMax: 0,
    latest: { weight: '-', height: '-', weightDiff: '-', heightDiff: '-' },
    babyBirthDate: '',
    weightPercentile: '-',
    heightPercentile: '-',
    chartRecordCount: 0,
    canvasHeight: 300,
    pixelRatio: 1
  },

  onLoad() {
    const sys = wx.getSystemInfoSync()
    this.setData({
      pixelRatio: sys.pixelRatio || 1
    })
  },

  onShow() {
    this.stopGrowthSync()
    const familyCode = wx.getStorageSync('familyCode') || 'FAMILY'
    const birthDate = wx.getStorageSync('babyBirthDate') || ''
    const key = pageSnapshot.key({ familyCode, birthDate })
    const changedContext = this._growthContextKey !== key
    this._growthVisible = true
    this._growthContextKey = key
    this._growthContext = { familyCode, birthDate, key, watchVersion: 0, fallbackStarted: false }
    this.setData({ babyBirthDate: birthDate })
    if (changedContext) {
      this._growthSignature = ''
      this._growthVisibleCount = 20
    }
    const cached = pageSnapshot.read('growth', key)
    if (cached !== null) this.renderRecords(cached)
    else if (changedContext && (this._growthRecords || this.data.records).length) this.renderRecords([])
    this.loadRecords()
  },

  onHide() {
    this._growthVisible = false
    this.stopGrowthSync()
    this._growthContext = null
  },

  onUnload() {
    this.onHide()
  },

  loadRecords() {
    const context = this._growthContext
    if (!this.isGrowthContextCurrent(context)) return
    this.startGrowthSync(context.familyCode, context)
  },

  isGrowthContextCurrent(context) {
    return !!context && this._growthVisible && this._growthContext === context &&
      (wx.getStorageSync('familyCode') || 'FAMILY') === context.familyCode &&
      (wx.getStorageSync('babyBirthDate') || '') === context.birthDate
  },

  loadGrowthFallback(context) {
    if (!this.isGrowthContextCurrent(context) || context.fallbackStarted) return
    context.fallbackStarted = true
    this.clearGrowthInitTimer()
    const version = context.watchVersion
    const key = pageSnapshot.key({ familyCode: context.familyCode, birthDate: context.birthDate, operation: 'getRecords' })
    return pageSnapshot.fetch('growth', key, () => fetchGrowthRecords(context.familyCode))
      .then(records => {
        if (!this.isGrowthContextCurrent(context) || context.watchVersion !== version) return
        pageSnapshot.write('growth', context.key, records)
        this.renderRecords(records)
      })
      .catch(err => {
        if (!this.isGrowthContextCurrent(context) || context.watchVersion !== version) return
        console.error(err)
        wx.showToast({ title: '加载失败', icon: 'none' })
      })
  },

  renderRecords(records) {
    const signature = JSON.stringify([this.data.babyBirthDate, records.map(row => [row._id, row.date, row.weight, row.height, row.note])])
    if (this._growthSignature === signature) return false
    this._growthSignature = signature
    this._growthRecords = records
    this.calculateLatest(records)
    const overflow = records.filter(record => record.weight > 20)
    this.setData({
      records: records.slice(0, this._growthVisibleCount || 20),
      recordCount: records.length,
      weightOverflowCount: overflow.length,
      weightOverflowMax: overflow.length ? Math.max(...overflow.map(record => record.weight)) : 0
    }, () => {
      if (this._growthVisible !== false) this.drawChart(records)
    })
    return true
  },

  showMoreHistory() {
    const records = this._growthRecords || []
    this._growthVisibleCount = Math.min(records.length, (this._growthVisibleCount || 20) + 20)
    this.setData({ records: records.slice(0, this._growthVisibleCount) })
  },

  startGrowthSync(familyCode, context = this._growthContext) {
    if (!this.isGrowthContextCurrent(context) || this._growthSyncKey === context.key) return
    this._growthSyncKey = context.key
    this._growthInitTimer = setTimeout(() => this.loadGrowthFallback(context), 8000)
    try {
      if (!wx.cloud || !wx.cloud.database) throw new Error('watch unavailable')
      const db = wx.cloud.database()
      const query = db.collection('growth_records')
        .where({ familyCode })
        .orderBy('date', 'desc')
        .orderBy('_id', 'desc')
      if (typeof query.watch !== 'function') throw new Error('watch unavailable')
      const watcher = query.watch({
        onChange: snapshot => {
          if (!this.isGrowthContextCurrent(context) || context.watchFailed) return
          this.clearGrowthInitTimer()
          context.watchVersion += 1
          const records = familyRecordSync.recordsFromWatchSnapshot(snapshot)
          const changed = this.renderRecords(records)
          if (changed || !context.synced) pageSnapshot.write('growth', context.key, records)
          context.synced = true
        },
        onError: err => {
          if (!this.isGrowthContextCurrent(context)) return
          context.watchFailed = true
          console.error(err)
          this.loadGrowthFallback(context)
          if (this._growthWatcher) {
            this._growthWatcher.close()
            this._growthWatcher = null
          }
        }
      })
      if (!this.isGrowthContextCurrent(context) || context.watchFailed) watcher.close()
      else this._growthWatcher = watcher
    } catch (err) {
      this.loadGrowthFallback(context)
    }
  },

  clearGrowthInitTimer() {
    if (this._growthInitTimer !== undefined) {
      clearTimeout(this._growthInitTimer)
      this._growthInitTimer = undefined
    }
  },

  stopGrowthSync() {
    this.clearGrowthInitTimer()
    this._growthSyncKey = ''
    if (this._growthWatcher) {
      this._growthWatcher.close()
      this._growthWatcher = null
    }
  },

  calculateLatest(records) {
    if (records.length === 0) {
      this.setData({
        latest: { weight: '-', height: '-', weightDiff: '-', heightDiff: '-' },
        weightPercentile: '-',
        heightPercentile: '-'
      })
      return
    }
    const latestWeight = records.find(r => r.weight > 0)
    const prevWeight = latestWeight ? records.slice(records.indexOf(latestWeight) + 1).find(r => r.weight > 0) : null
    const latestHeight = records.find(r => r.height > 0)
    const prevHeight = latestHeight ? records.slice(records.indexOf(latestHeight) + 1).find(r => r.height > 0) : null

    this.setData({
      latest: {
        weight: latestWeight ? latestWeight.weight : '-',
        height: latestHeight ? latestHeight.height : '-',
        weightDiff: (latestWeight && prevWeight) ? (latestWeight.weight - prevWeight.weight).toFixed(2) : '-',
        heightDiff: (latestHeight && prevHeight) ? (latestHeight.height - prevHeight.height).toFixed(1) : '-'
      },
      weightPercentile: this.percentileFor('weight', latestWeight),
      heightPercentile: this.percentileFor('height', latestHeight)
    })
  },

  // 固定使用男宝标准；没有生日时无法对齐月龄。
  percentileFor(measure, record) {
    const birth = this.data.babyBirthDate
    if (!birth || !record) return '-'
    const age = dateUtil.ageInMonths(birth, record.date)
    if (age === null || age < 0) return '-'
    const value = growthStandards.percentileOf(measure, 'boy', age, measure === 'weight' ? record.weight : record.height)
    return value === null ? '-' : String(Math.round(value))
  },

  toggleHistory() {
    this.setData({ historyExpanded: !this.data.historyExpanded })
  },

  switchMode(e) {
    const mode = e.currentTarget.dataset.mode
    this.setData({ viewMode: mode })
    const records = this._growthRecords || this.data.records
    if (records.length > 0) {
      this.drawChart(records)
    }
  },

  drawChart(records) {
    if (!records || this._growthVisible === false) return
    const isWeight = this.data.viewMode === 'weight'
    const measure = isWeight ? 'weight' : 'height'
    const birth = this.data.babyBirthDate
    const useBand = Boolean(birth)

    const data = records
      .filter(d => isWeight ? d.weight > 0 : d.height > 0)
      .map(d => ({ ...d, age: useBand ? dateUtil.ageInMonths(birth, d.date) : null }))
      .filter(d => !useBand || (d.age !== null && d.age >= 0))
    data.sort(useBand
      ? (a, b) => a.age - b.age
      : (a, b) => a.date.localeCompare(b.date))
    this.setData({ chartRecordCount: data.length })
    if (data.length === 0) {
      withChartCanvas('#growthCanvas', this.data.pixelRatio, () => {})
      return
    }

    const maxAge = useBand ? Math.max(...data.map(d => d.age)) : 0
    const xLimit = Math.max(12, Math.ceil(maxAge))
    const xTick = xLimit <= 12 ? 3 : xLimit <= 24 ? 6 : xLimit <= 60 ? 12 : this.niceTick(xLimit / 4)
    const xMax = useBand ? Math.ceil(xLimit / xTick) * xTick : 0
    const band = useBand
      ? growthStandards.bandSeries(measure, 'boy', 0, Math.min(growthStandards.MAX_MONTH, xMax))
      : []
    const bandP3 = band.map(row => row.p3)
    const bandP97 = band.map(row => row.p97)
    const values = data.map(d => isWeight ? d.weight : d.height)
    const rangeValues = values.concat(bandP3, bandP97)
    const minVal = Math.min(...rangeValues)
    const maxVal = Math.max(...rangeValues)
    const valRange = maxVal - minVal || 1
    const bandTop = bandP97.length ? Math.max(...bandP97) : 0

    withChartCanvas('#growthCanvas', this.data.pixelRatio, (ctx, width, height) => {
      if (this._growthVisible === false) return
      const padding = { top: 32, right: 16, bottom: 52, left: 40 }
      const chartW = width - padding.left - padding.right
      const chartH = height - padding.top - padding.bottom

      let yMin = isWeight ? 0 : Math.max(0, minVal - valRange * 0.1)
      let yMax = isWeight ? Math.max(20, Math.ceil((bandTop + 1) / 5) * 5) : maxVal + valRange * 0.1
      const tick = isWeight ? 5 : this.niceTick((yMax - yMin) / 4)
      yMin = Math.floor(yMin / tick) * tick
      yMax = Math.ceil(yMax / tick) * tick
      if (yMax === yMin) { yMax += tick }
      const yOf = value => padding.top + chartH - ((value - yMin) / (yMax - yMin)) * chartH
      const xOfMonth = month => padding.left + (month / xMax) * chartW

      // Y 轴网格线与标签
      ctx.textAlign = 'right'
      ctx.textBaseline = 'middle'
      ctx.font = '11px sans-serif'
      ctx.fillStyle = '#7B8981'
      ctx.strokeStyle = '#EDF1ED'
      ctx.lineWidth = 1

      const ySteps = Math.round((yMax - yMin) / tick)
      for (let i = 0; i <= ySteps; i++) {
        const yVal = yMin + tick * i
        const y = yOf(yVal)
        ctx.fillText(String(Math.round(yVal * 100) / 100), padding.left - 8, y)
        ctx.beginPath()
        ctx.moveTo(padding.left, y)
        ctx.lineTo(padding.left + chartW, y)
        ctx.stroke()
      }

      // 月龄刻度独立于记录数量，密集测量也不会堆出一排日期。
      if (useBand) {
        ctx.textAlign = 'center'
        ctx.textBaseline = 'top'
        for (let month = 0; month <= xMax; month += xTick) {
          const x = xOfMonth(month)
          ctx.fillText(String(month), x, padding.top + chartH + 10)
          ctx.beginPath()
          ctx.strokeStyle = '#F3F5F2'
          ctx.moveTo(x, padding.top)
          ctx.lineTo(x, padding.top + chartH)
          ctx.stroke()
        }
      }

      // 淡色参考带及边界线，P50 用虚线，与宝宝的实线分开。
      if (band.length > 1) {
        ctx.beginPath()
        band.forEach((row, index) => {
          const x = xOfMonth(row.month)
          const y = yOf(row.p3)
          if (index === 0) ctx.moveTo(x, y)
          else ctx.lineTo(x, y)
        })
        for (let index = band.length - 1; index >= 0; index -= 1) {
          ctx.lineTo(xOfMonth(band[index].month), yOf(band[index].p97))
        }
        ctx.closePath()
        ctx.fillStyle = isWeight ? 'rgba(118, 195, 147, 0.12)' : 'rgba(125, 187, 232, 0.12)'
        ctx.fill()

        for (const key of ['p3', 'p97', 'p50']) {
          ctx.beginPath()
          band.forEach((row, index) => {
            const x = xOfMonth(row.month)
            const y = yOf(row[key])
            if (index === 0) ctx.moveTo(x, y)
            else ctx.lineTo(x, y)
          })
          if (ctx.setLineDash) ctx.setLineDash(key === 'p50' ? [5, 5] : [])
          ctx.strokeStyle = isWeight ? 'rgba(118, 195, 147, 0.65)' : 'rgba(125, 187, 232, 0.65)'
          ctx.lineWidth = key === 'p50' ? 1.5 : 1
          ctx.stroke()
        }
        if (ctx.setLineDash) ctx.setLineDash([])
      }

      // 折线
      const count = data.length
      const xStep = count > 1 ? chartW / (count - 1) : 0
      const xCenter = padding.left + chartW / 2
      const xForIndex = index => useBand
        ? xOfMonth(data[index].age)
        : (count > 1 ? padding.left + index * xStep : xCenter)

      ctx.beginPath()
      ctx.strokeStyle = isWeight ? '#2E8753' : '#2D72BF'
      ctx.lineWidth = 2.5
      ctx.lineJoin = 'round'
      ctx.lineCap = 'round'
      data.forEach((d, i) => {
        const val = isWeight ? Math.min(d.weight, yMax) : d.height
        const x = xForIndex(i)
        const y = yOf(val)
        // 仅一次测量时画短横线，避免无圆点后看不见，也不虚构一段趋势。
        if (count === 1) {
          ctx.moveTo(Math.max(padding.left, x - 4), y)
          ctx.lineTo(Math.min(padding.left + chartW, x + 4), y)
        } else if (i === 0) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
      })
      ctx.stroke()

      // 无生日时保留日期横轴，按实际像素距离为标签留白。
      const labelWidth = 56
      let lastLabelX = -Infinity

      // 只保留超出纵轴范围的三角提示，普通测量不再画圆点。
      data.forEach((d, i) => {
        const val = isWeight ? Math.min(d.weight, yMax) : d.height
        const x = xForIndex(i)
        const y = yOf(val)

        if (isWeight && d.weight > yMax) {
          // 超出纵轴的真实值保留在历史中，使用上沿三角提示。
          ctx.beginPath()
          ctx.fillStyle = '#926B50'
          ctx.moveTo(x, y - 5)
          ctx.lineTo(x + 5, y + 4)
          ctx.lineTo(x - 5, y + 4)
          ctx.closePath()
          ctx.fill()
        }

        if (useBand) return
        const isLast = i === count - 1
        if (!isLast && (x - lastLabelX < labelWidth || (count > 1 && xForIndex(count - 1) - x < labelWidth))) return
        lastLabelX = x
        ctx.fillStyle = '#7B8981'
        ctx.textAlign = count === 1 ? 'center' : i === 0 ? 'left' : isLast ? 'right' : 'center'
        ctx.textBaseline = 'top'
        ctx.font = '11px sans-serif'
        const label = d.date.substring(5)
        ctx.fillText(label, x, padding.top + chartH + 10)
      })

      // 单位单独占一行，不与首尾刻度挤在一起。
      ctx.fillStyle = '#647165'
      ctx.textAlign = 'left'
      ctx.textBaseline = 'top'
      ctx.font = '11px sans-serif'
      ctx.fillText(isWeight ? '体重（kg）' : '身高（cm）', padding.left, 4)
      ctx.textAlign = 'right'
      ctx.textBaseline = 'bottom'
      ctx.fillText(useBand ? '月龄（月）' : '测量日期', width - padding.right, height - 4)
    })
  },

  niceTick(range) {
    if (range <= 0) return 1
    const exponent = Math.floor(Math.log10(range))
    const fraction = range / Math.pow(10, exponent)
    let niceFraction
    if (fraction < 1.5) niceFraction = 1
    else if (fraction < 2.25) niceFraction = 2
    else if (fraction < 3.75) niceFraction = 2.5
    else if (fraction < 7.5) niceFraction = 5
    else niceFraction = 10
    return niceFraction * Math.pow(10, exponent)
  },

  goMilestones() {
    wx.navigateTo({ url: '/pages/milestones/milestones' })
  },

  goAdd() {
    wx.navigateTo({ url: '/pages/growthEdit/growthEdit' })
  },

  goEdit(e) {
    const id = e.currentTarget.dataset.id
    wx.navigateTo({ url: '/pages/growthEdit/growthEdit?id=' + id })
  }
})
