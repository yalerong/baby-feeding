// 统计页柱状图的行为测试：走真实 drawChart，断言画布缩放、图例、命中区域与空数据回退。
// 图表绘制抽出 utils/chartCanvas.js 后，这条测试同时守住两个页面共用的画布初始化。
const assert = require('assert')

let config
global.Page = value => { config = value }
require('../pages/stats/stats.js')

function makePage(overrides) {
  const drawing = { labels: [], fills: [], rects: [] }
  let canvasNode = null
  const ctx = {
    scale() {}, clearRect() {}, closePath() {}, beginPath() {}, arc() {},
    moveTo() {}, lineTo() {}, quadraticCurveTo() {}, stroke() {},
    fill() { drawing.fills.push({ color: this.fillStyle }) },
    fillRect(x, y, width, height) { drawing.rects.push({ x, y, width, height, color: this.fillStyle }) },
    fillText(value) { drawing.labels.push(String(value)) }
  }
  global.wx = {
    createSelectorQuery() {
      return {
        select() { return this },
        fields() { return this },
        exec(callback) {
          canvasNode = { width: 0, height: 0, getContext: () => ctx }
          callback([{ node: canvasNode, width: 345, height: 260 }])
        }
      }
    }
  }
  const page = {
    ...config,
    data: { ...JSON.parse(JSON.stringify(config.data)), pixelRatio: 2, ...overrides },
    setData(patch) { Object.assign(this.data, patch) }
  }
  return { page, drawing, canvas: () => canvasNode }
}

const days = [
  { date: '2026-10-01', breast: 120, formula: 0, total: 120 },
  { date: '2026-10-02', breast: 0, formula: 150, total: 150 },
  { date: '2026-10-03', breast: 60, formula: 90, total: 150 }
]

const { page, drawing, canvas } = makePage()
page.drawChart(days)

// 画布按设备像素比放大，避免高清屏发虚
assert.strictEqual(canvas().width, 345 * 2, 'canvas width must be scaled by pixelRatio')
assert.strictEqual(canvas().height, 260 * 2, 'canvas height must be scaled by pixelRatio')

// 三个数据点各有一个点击命中区，主体类型按母乳/奶粉较大者判定
assert.strictEqual(page.data.chartHitAreas.length, 3)
assert.deepStrictEqual(page.data.chartHitAreas.map(area => area.data.date),
  ['2026-10-01', '2026-10-02', '2026-10-03'])
assert.strictEqual(page.data.chartHitAreas[0].data.type, 'breast')
assert.strictEqual(page.data.chartHitAreas[1].data.type, 'formula')
assert.strictEqual(page.data.chartHitAreas[2].data.type, 'formula')

// 柱体与图例都画出来了
assert.ok(drawing.fills.length >= 4, 'each day draws a stacked bar')
assert.ok(drawing.labels.includes('母乳') && drawing.labels.includes('奶粉'), 'legend labels are drawn')
assert.ok(drawing.labels.includes('0'), 'y axis starts at zero')
console.log('ok - stats chart scales the canvas, draws legend and bars, and maps hit areas')

// 空数据要清掉上一次的命中区与选中项，避免图表空了还能点出 tooltip
const { page: emptyPage } = makePage()
emptyPage.data.chartHitAreas = [{ x: 1, y: 1 }]
emptyPage.data.selectedChartItem = { date: '2026-10-01' }
emptyPage.drawChart([])
assert.deepStrictEqual(emptyPage.data.chartHitAreas, [])
assert.strictEqual(emptyPage.data.selectedChartItem, null)
console.log('ok - empty stats clear hit areas and the selected point')
