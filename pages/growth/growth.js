Page({
  data: {
    records: [],
    viewMode: 'weight',
    latest: { weight: '-', height: '-', weightDiff: '-', heightDiff: '-' },
    canvasWidth: 345,
    canvasHeight: 280,
    pixelRatio: 1
  },

  onLoad() {
    const sys = wx.getSystemInfoSync()
    this.setData({
      canvasWidth: sys.windowWidth - 60,
      canvasHeight: 280,
      pixelRatio: sys.pixelRatio || 1
    })
  },

  onShow() {
    this.loadRecords()
  },

  loadRecords() {
    const db = wx.cloud.database()
    const familyCode = wx.getStorageSync('familyCode') || 'FAMILY'
    db.collection('growth_records')
      .where({ familyCode })
      .orderBy('date', 'desc')
      .get()
      .then(res => {
        const records = res.data || []
        this.calculateLatest(records)
        this.setData({ records }, () => {
          if (records.length > 0) this.drawChart(records)
        })
      })
      .catch(err => {
        console.error(err)
        wx.showToast({ title: '加载失败', icon: 'none' })
      })
  },

  calculateLatest(records) {
    if (records.length === 0) {
      this.setData({
        latest: { weight: '-', height: '-', weightDiff: '-', heightDiff: '-' }
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
      }
    })
  },

  switchMode(e) {
    const mode = e.currentTarget.dataset.mode
    this.setData({ viewMode: mode })
    if (this.data.records.length > 0) {
      this.drawChart(this.data.records)
    }
  },

  drawChart(records) {
    if (!records || records.length === 0) return
    const isWeight = this.data.viewMode === 'weight'
    const data = [...records]
      .sort((a, b) => a.date.localeCompare(b.date))
      .filter(d => isWeight ? d.weight > 0 : d.height > 0)
    if (data.length === 0) return
    const values = data.map(d => isWeight ? d.weight : d.height)

    const query = wx.createSelectorQuery()
    query.select('#growthCanvas').fields({ node: true, size: true }).exec((res) => {
      if (!res || !res[0]) return
      const canvas = res[0].node
      const ctx = canvas.getContext('2d')
      const width = res[0].width
      const height = res[0].height
      const dpr = this.data.pixelRatio
      canvas.width = width * dpr
      canvas.height = height * dpr
      ctx.scale(dpr, dpr)
      ctx.clearRect(0, 0, width, height)

      const padding = { top: 35, right: 20, bottom: 50, left: 55 }
      const chartW = width - padding.left - padding.right
      const chartH = height - padding.top - padding.bottom

      const minVal = Math.min(...values)
      const maxVal = Math.max(...values)
      const valRange = maxVal - minVal || 1
      let yMin = Math.max(0, minVal - valRange * 0.2)
      let yMax = maxVal + valRange * 0.2
      const tick = this.niceTick(yMax - yMin)
      yMin = Math.floor(yMin / tick) * tick
      yMax = Math.ceil(yMax / tick) * tick
      if (yMax === yMin) { yMax += tick }

      // Y 轴网格线与标签
      ctx.textAlign = 'right'
      ctx.textBaseline = 'middle'
      ctx.font = '10px sans-serif'
      ctx.fillStyle = '#999'
      ctx.strokeStyle = '#eee'
      ctx.lineWidth = 1

      const ySteps = Math.round((yMax - yMin) / tick)
      for (let i = 0; i <= ySteps; i++) {
        const yVal = yMin + tick * i
        const y = padding.top + chartH - ((yVal - yMin) / (yMax - yMin)) * chartH
        ctx.fillText(String(Math.round(yVal * 100) / 100), padding.left - 8, y)
        if (i > 0) {
          ctx.beginPath()
          ctx.moveTo(padding.left, y)
          ctx.lineTo(padding.left + chartW, y)
          ctx.stroke()
        }
      }

      // 折线
      const count = data.length
      const xStep = count > 1 ? chartW / (count - 1) : 0
      const xCenter = padding.left + chartW / 2

      ctx.beginPath()
      ctx.strokeStyle = isWeight ? '#4CAF50' : '#2196F3'
      ctx.lineWidth = 2
      ctx.lineJoin = 'round'
      ctx.lineCap = 'round'
      data.forEach((d, i) => {
        const val = isWeight ? d.weight : d.height
        const x = count > 1 ? padding.left + i * xStep : xCenter
        const y = padding.top + chartH - ((val - yMin) / (yMax - yMin)) * chartH
        if (i === 0) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
      })
      ctx.stroke()

      // 数据点与 X 轴标签
      data.forEach((d, i) => {
        const val = isWeight ? d.weight : d.height
        const x = count > 1 ? padding.left + i * xStep : xCenter
        const y = padding.top + chartH - ((val - yMin) / (yMax - yMin)) * chartH

        // 外圈白点
        ctx.beginPath()
        ctx.fillStyle = '#fff'
        ctx.arc(x, y, 5, 0, Math.PI * 2)
        ctx.fill()
        // 内圈色点
        ctx.beginPath()
        ctx.fillStyle = isWeight ? '#4CAF50' : '#2196F3'
        ctx.arc(x, y, 3.5, 0, Math.PI * 2)
        ctx.fill()

        // X 轴日期标签
        ctx.fillStyle = '#666'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'top'
        ctx.font = '10px sans-serif'
        const label = d.date.substring(5)
        ctx.fillText(label, x, padding.top + chartH + 8)
      })

      // 标题
      ctx.fillStyle = '#333'
      ctx.textAlign = 'left'
      ctx.textBaseline = 'top'
      ctx.font = 'bold 12px sans-serif'
      ctx.fillText(isWeight ? '体重趋势 (kg)' : '身高趋势 (cm)', 0, 10)
    })
  },

  niceTick(range) {
    if (range <= 0) return 1
    const exponent = Math.floor(Math.log10(range))
    const fraction = range / Math.pow(10, exponent)
    let niceFraction
    if (fraction <= 1) niceFraction = 1
    else if (fraction <= 2) niceFraction = 2
    else if (fraction <= 5) niceFraction = 5
    else niceFraction = 10
    return niceFraction * Math.pow(10, exponent)
  },

  goAdd() {
    wx.navigateTo({ url: '/pages/growthEdit/growthEdit' })
  },

  goEdit(e) {
    const id = e.currentTarget.dataset.id
    wx.navigateTo({ url: '/pages/growthEdit/growthEdit?id=' + id })
  }
})
