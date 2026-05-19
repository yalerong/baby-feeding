Page({
  data: {
    range: '7',
    stats: {
      totalCount: 0,
      totalMilk: 0,
      totalBreast: 0,
      totalStool: 0,
      ratio: '0%'
    },
    avgStats: {
      days: 0,
      milk: 0,
      breast: 0,
      formula: 0
    },
    dailyStats: [],
    displayDailyStats: [],
    allDailyStats: [],
    viewMode: 'chart',
    selectedMonth: '',
    monthList: [],
    canvasWidth: 345,
    canvasHeight: 260,
    selectedChartItem: null,
    chartHitAreas: [],
    pixelRatio: 1
  },

  onLoad() {
    const sys = wx.getSystemInfoSync()
    this.setData({
      canvasWidth: sys.windowWidth - 30,
      canvasHeight: 260,
      pixelRatio: sys.pixelRatio || 1
    })
    this.loadStats()
  },

  switchRange(e) {
    const range = e.currentTarget.dataset.range
    this.setData({ range, selectedChartItem: null, chartHitAreas: [], displayDailyStats: [] })
    this.loadStats()
  },

  loadStats() {
    const familyCode = wx.getStorageSync('familyCode')
    if (!familyCode) {
      wx.showToast({ title: '缺少家庭码', icon: 'none' })
      return
    }

    wx.showLoading({ title: '加载中...' })

    wx.cloud.callFunction({
      name: 'getStats',
      data: {
        familyCode,
        range: this.data.range
      }
    }).then(res => {
      wx.hideLoading()
      const dailyStats = this.normalizeDailyStats(((res.result || {}).dailyStats) || [])
      const stats = this.calculateStatsFromDaily(dailyStats)
      const avgStats = this.calculateAverageStats(dailyStats)

      if (this.data.range === 'all') {
        const monthList = this.generateMonthList(dailyStats)
        this.setData({
          stats,
          avgStats,
          dailyStats,
          displayDailyStats: dailyStats,
          allDailyStats: dailyStats,
          monthList,
          viewMode: 'monthList',
          selectedMonth: '',
          selectedChartItem: null,
          chartHitAreas: []
        })
      } else {
        this.setData({
          stats,
          avgStats,
          dailyStats,
          displayDailyStats: dailyStats,
          allDailyStats: dailyStats,
          viewMode: 'chart',
          selectedMonth: '',
          monthList: [],
          selectedChartItem: null,
          chartHitAreas: []
        }, () => this.drawChart(dailyStats))
      }
    }).catch(err => {
      wx.hideLoading()
      console.error(err)
      wx.showToast({ title: '加载失败', icon: 'none' })
    })
  },

  calculateStatsFromDaily(dailyStats) {
    const totalCount = dailyStats.reduce((sum, item) => sum + this.getFeedingCount(item), 0)
    const totalMilk = dailyStats.reduce((sum, item) => sum + (item.total || 0), 0)
    const totalBreast = dailyStats.reduce((sum, item) => sum + (item.breast || 0), 0)
    const totalStool = dailyStats.reduce((sum, item) => sum + this.getStoolCount(item), 0)
    const ratio = totalMilk === 0 ? '0%' : (totalBreast / totalMilk * 100).toFixed(1) + '%'
    return { totalCount, totalMilk, totalBreast, totalStool, ratio }
  },

  normalizeDailyStats(dailyStats) {
    return dailyStats.map(item => {
      const feedingCount = this.getFeedingCount(item)
      const stoolCount = this.getStoolCount(item)
      return {
        ...item,
        count: feedingCount,
        feedingCount,
        stool: stoolCount,
        stoolCount
      }
    }).filter(item => this.hasDailyRecord(item))
  },

  hasDailyRecord(item) {
    return this.getFeedingCount(item) > 0 || this.getStoolCount(item) > 0 || (Number(item.total) || 0) > 0
  },

  getFeedingCount(item) {
    return item.feedingCount !== undefined ? item.feedingCount : (item.count || 0)
  },

  getStoolCount(item) {
    return item.stoolCount !== undefined ? item.stoolCount : (item.stool || 0)
  },

  calculateAverageStats(dailyStats) {
    const milkDays = dailyStats.filter(item => (item.total || 0) > 0).length
    const totalMilk = dailyStats.reduce((sum, item) => sum + (item.total || 0), 0)
    const totalBreast = dailyStats.reduce((sum, item) => sum + (item.breast || 0), 0)
    const totalFormula = dailyStats.reduce((sum, item) => sum + (item.formula || 0), 0)
    if (milkDays === 0) return { days: 0, milk: 0, breast: 0, formula: 0 }
    return {
      days: milkDays,
      milk: Math.round(totalMilk / milkDays),
      breast: Math.round(totalBreast / milkDays),
      formula: Math.round(totalFormula / milkDays)
    }
  },

  generateMonthList(dailyStats) {
    const monthMap = {}
    dailyStats.forEach(item => {
      if (!this.hasDailyRecord(item)) return
      const month = item.date.substring(0, 7)
      if (!monthMap[month]) {
        monthMap[month] = { month, monthLabel: this.formatMonthLabel(month), count: 0, breast: 0, formula: 0, total: 0, stool: 0, days: 0 }
      }
      monthMap[month].count += this.getFeedingCount(item)
      monthMap[month].breast += item.breast
      monthMap[month].formula += item.formula
      monthMap[month].total += item.total
      monthMap[month].stool += this.getStoolCount(item)
      monthMap[month].days += 1
    })
    const list = Object.values(monthMap).sort((a, b) => b.month.localeCompare(a.month))
    list.forEach(m => {
      m.ratio = m.total === 0 ? '0%' : (m.breast / m.total * 100).toFixed(1) + '%'
    })
    return list
  },

  formatMonthLabel(monthStr) {
    const parts = monthStr.split('-')
    if (parts.length === 2) {
      return `${parts[0]}年${parseInt(parts[1])}月`
    }
    return monthStr
  },

  onMonthTap(e) {
    const month = e.currentTarget.dataset.month
    const monthData = this.data.allDailyStats
      .filter(d => d.date.startsWith(month))
      .filter(d => this.hasDailyRecord(d))
      .sort((a, b) => a.date.localeCompare(b.date))
    this.setData({
      selectedMonth: this.formatMonthLabel(month),
      viewMode: 'monthDetail',
      stats: this.calculateStatsFromDaily(monthData),
      avgStats: this.calculateAverageStats(monthData),
      dailyStats: monthData,
      displayDailyStats: monthData,
      selectedChartItem: null,
      chartHitAreas: []
    }, () => this.drawChart(monthData))
  },

  backToMonthList() {
    this.setData({
      selectedMonth: '',
      viewMode: 'monthList',
      stats: this.calculateStatsFromDaily(this.data.allDailyStats),
      avgStats: this.calculateAverageStats(this.data.allDailyStats),
      dailyStats: this.data.allDailyStats,
      displayDailyStats: this.data.allDailyStats,
      selectedChartItem: null,
      chartHitAreas: []
    })
  },

  drawChart(dailyStats) {
    if (!dailyStats || dailyStats.length === 0) {
      this.setData({ chartHitAreas: [], selectedChartItem: null })
      return
    }
    const data = [...dailyStats].sort((a, b) => a.date.localeCompare(b.date))
    const dpr = this.data.pixelRatio

    const query = wx.createSelectorQuery()
    query.select('#chartCanvas').fields({ node: true, size: true }).exec((res) => {
      if (!res || !res[0]) return
      const canvas = res[0].node
      const ctx = canvas.getContext('2d')
      const width = res[0].width
      const height = res[0].height
      canvas.width = width * dpr
      canvas.height = height * dpr
      ctx.scale(dpr, dpr)
      ctx.clearRect(0, 0, width, height)

      const padding = { top: 30, right: 15, bottom: 50, left: 45 }
      const chartW = width - padding.left - padding.right
      const chartH = height - padding.top - padding.bottom

      const maxTotal = Math.max(...data.map(d => d.total), 1)
      const yMax = Math.ceil(maxTotal * 1.1 / 50) * 50

      const ySteps = 5
      ctx.textAlign = 'right'
      ctx.textBaseline = 'middle'
      ctx.font = '10px sans-serif'
      ctx.fillStyle = '#999'
      ctx.strokeStyle = '#eee'
      ctx.lineWidth = 1

      for (let i = 0; i <= ySteps; i++) {
        const yVal = (yMax / ySteps) * i
        const y = padding.top + chartH - (yVal / yMax) * chartH
        ctx.fillText(String(Math.round(yVal)), padding.left - 6, y)
        if (i > 0) {
          ctx.beginPath()
          ctx.moveTo(padding.left, y)
          ctx.lineTo(padding.left + chartW, y)
          ctx.stroke()
        }
      }

      const barCount = data.length
      const slotWidth = chartW / barCount
      const barWidth = Math.min(slotWidth * 0.65, 28)
      const barOffset = (slotWidth - barWidth) / 2
      const hitAreas = []

      data.forEach((d, i) => {
        const x = padding.left + i * slotWidth + barOffset
        const slotX = padding.left + i * slotWidth
        const breastH = (d.breast / yMax) * chartH
        const formulaH = (d.formula / yMax) * chartH
        const isSelected = this.data.selectedChartItem && this.data.selectedChartItem.date === d.date
        hitAreas.push(this.createHitArea(slotX, padding.top, slotWidth, chartH + padding.bottom, d))

        if (d.breast > 0) {
          ctx.fillStyle = isSelected ? '#FFC940' : '#8AD8AE'
          const y = padding.top + chartH - breastH
          this.roundRect(ctx, x, y, barWidth, breastH, { tl: 3, tr: 3, bl: 0, br: 0 }, true)
        }

        if (d.formula > 0) {
          ctx.fillStyle = isSelected ? '#FFBA33' : '#7DBBE8'
          const y = padding.top + chartH - breastH - formulaH
          const r = d.breast > 0 ? { tl: 0, tr: 0, bl: 3, br: 3 } : { tl: 3, tr: 3, bl: 3, br: 3 }
          this.roundRect(ctx, x, y, barWidth, formulaH, r, true)
        }

        const dateLabel = this.getXAxisLabel(d, i, barCount)
        if (dateLabel) {
          ctx.fillStyle = '#666'
          ctx.textAlign = 'center'
          ctx.textBaseline = 'top'
          ctx.font = '10px sans-serif'
          ctx.fillText(dateLabel, x + barWidth / 2, padding.top + chartH + 6)
        }
      })

      const legendY = 8
      ctx.fillStyle = '#8AD8AE'
      ctx.fillRect(width - 115, legendY, 12, 12)
      ctx.fillStyle = '#666'
      ctx.textAlign = 'left'
      ctx.textBaseline = 'middle'
      ctx.font = '11px sans-serif'
      ctx.fillText('母乳', width - 99, legendY + 6)

      ctx.fillStyle = '#7DBBE8'
      ctx.fillRect(width - 55, legendY, 12, 12)
      ctx.fillStyle = '#666'
      ctx.fillText('奶粉', width - 39, legendY + 6)
      this.setData({ chartHitAreas: hitAreas })
    })
  },

  createHitArea(x, y, width, height, item) {
    return {
      x,
      y,
      width,
      height,
      data: this.createSelectedChartItem(item)
    }
  },

  createSelectedChartItem(item) {
    const breast = item.breast || 0
    const formula = item.formula || 0
    const type = formula > breast ? 'formula' : 'breast'
    return {
      date: item.date,
      type,
      typeLabel: type === 'breast' ? '母乳' : '奶粉',
      value: type === 'breast' ? breast : formula,
      breast,
      formula,
      total: item.total || 0,
      ratio: item.ratio,
      count: this.getFeedingCount(item),
      feedingCount: this.getFeedingCount(item),
      stool: this.getStoolCount(item),
      stoolCount: this.getStoolCount(item)
    }
  },

  onChartTap(e) {
    const point = this.getChartTapPoint(e)
    this.selectChartItemByPoint(point)
  },

  onChartTouch(e) {
    const point = this.getChartTapPoint(e)
    this.selectChartItemByPoint(point)
  },

  selectChartItemByPoint(point) {
    const x = point.x
    const y = point.y
    if (x === null || y === null) return

    const hit = this.data.chartHitAreas
      .slice()
      .reverse()
      .find(area => x >= area.x && x <= area.x + area.width && y >= area.y && y <= area.y + area.height)

    if (hit) {
      if (this.data.selectedChartItem && this.data.selectedChartItem.date === hit.data.date) return
      const selectedDay = this.data.dailyStats.find(item => item.date === hit.data.date)
      this.setData({
        selectedChartItem: hit.data,
        stats: this.calculateStatsFromDaily(selectedDay ? [selectedDay] : []),
        avgStats: this.calculateAverageStats(selectedDay ? [selectedDay] : []),
        displayDailyStats: selectedDay ? [selectedDay] : []
      }, () => this.drawChart(this.data.dailyStats))
    }
  },

  getChartTapPoint(e) {
    const detail = e.detail || {}
    const touch = e.touches && e.touches[0] ? e.touches[0] : (e.changedTouches && e.changedTouches[0] ? e.changedTouches[0] : null)
    return {
      x: touch && typeof touch.x === 'number' ? touch.x : (typeof detail.x === 'number' ? detail.x : null),
      y: touch && typeof touch.y === 'number' ? touch.y : (typeof detail.y === 'number' ? detail.y : null)
    }
  },

  getXAxisLabel(item, index, barCount) {
    if (this.data.viewMode === 'monthDetail' && barCount > 10) {
      const step = barCount > 25 ? 6 : 5
      const isEdge = index === 0 || index === barCount - 1
      return isEdge || index % step === 0 ? item.date.substring(5) : ''
    }
    if (barCount > 14) {
      const step = barCount > 60 ? 14 : (barCount > 30 ? 7 : 5)
      const dayIndex = index + 1
      return dayIndex % step === 0 ? item.date.substring(5) : ''
    }
    return item.date.substring(5)
  },

  roundRect(ctx, x, y, w, h, r, fill) {
    if (typeof r === 'number') r = { tl: r, tr: r, br: r, bl: r }
    ctx.beginPath()
    ctx.moveTo(x + r.tl, y)
    ctx.lineTo(x + w - r.tr, y)
    ctx.quadraticCurveTo(x + w, y, x + w, y + r.tr)
    ctx.lineTo(x + w, y + h - r.br)
    ctx.quadraticCurveTo(x + w, y + h, x + w - r.br, y + h)
    ctx.lineTo(x + r.bl, y + h)
    ctx.quadraticCurveTo(x, y + h, x, y + h - r.bl)
    ctx.lineTo(x, y + r.tl)
    ctx.quadraticCurveTo(x, y, x + r.tl, y)
    ctx.closePath()
    if (fill) ctx.fill()
  }
})
