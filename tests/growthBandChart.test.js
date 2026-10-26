// 男宝参考带、真实月龄排布，以及密集记录下的坐标与纯线条展示。
const assert = require('assert')
const standards = require('../utils/growthStandards.js')
const dateUtil = require('../utils/date.js')

let config
global.Page = value => { config = value }
require('../pages/growth/growth.js')

function makePage(overrides, width = 315) {
  const drawing = { strokes: [], fills: [], labels: [], arcs: 0, clears: 0 }
  let points = []
  const ctx = {
    scale() {}, closePath() {},
    clearRect() { drawing.clears += 1 },
    arc() { drawing.arcs += 1 },
    setLineDash() {},
    beginPath() { points = [] },
    moveTo(x, y) { points.push({ x, y }) },
    lineTo(x, y) { points.push({ x, y }) },
    stroke() { drawing.strokes.push({ color: this.strokeStyle, points: points.slice() }) },
    fill() { drawing.fills.push({ color: this.fillStyle, points: points.slice() }) },
    fillText(text, x, y) { drawing.labels.push({ text, x, y, align: this.textAlign }) }
  }
  global.wx = {
    getStorageSync(key) { return key === 'babyBirthDate' ? '2026-02-24' : 'girl' },
    createSelectorQuery() {
      return {
        select() { return this },
        fields() { return this },
        exec(callback) { callback([{ node: { getContext: () => ctx }, width, height: 300 }]) }
      }
    }
  }
  const page = {
    ...config,
    data: { ...JSON.parse(JSON.stringify(config.data)), babyBirthDate: '2026-02-24', ...overrides },
    setData(patch, callback) { Object.assign(this.data, patch); if (callback) callback() }
  }
  return { page, drawing }
}

let failures = 0
function test(name, fn) {
  try { fn(); console.log('ok - ' + name) }
  catch (err) { failures += 1; console.error('not ok - ' + name); console.error(err.message) }
}

// 三次测量的月龄间距故意不等。
const records = [
  { _id: 'a', date: '2026-04-24', weight: 5.9, height: 61 },
  { _id: 'b', date: '2026-06-24', weight: 7.2, height: 66 },
  { _id: 'c', date: '2026-12-24', weight: 9.6, height: 74 }
]

test('boys reference band uses real ages without a sex setting', () => {
  const { page, drawing } = makePage()
  page.drawChart(records)
  assert.ok(drawing.fills.some(fill => fill.points.length > 20), 'WHO reference band should be drawn')
  const curve = drawing.strokes.find(stroke => stroke.color === '#2E8753')
  assert.ok(curve && curve.points.length === records.length)
  const xs = curve.points.map(point => point.x)
  assert.ok(xs[0] < xs[1] && xs[1] < xs[2])
  assert.ok(Math.abs((xs[1] - xs[0]) - (xs[2] - xs[1])) > 1, 'spacing must follow true age')
  assert.strictEqual(drawing.arcs, 0, 'measurements should be a line without circular markers')
})

test('stored sex never changes the boys standard or percentile', () => {
  const { page } = makePage({ babySex: 'girl' })
  page.loadRecords = () => {}
  page.onShow()
  const age = dateUtil.ageInMonths('2026-02-24', records[2].date)
  const expected = String(Math.round(standards.percentileOf('weight', 'boy', age, records[2].weight)))
  assert.strictEqual(page.percentileFor('weight', records[2]), expected)
  const { page: boy, drawing: boyDrawing } = makePage()
  boy.drawChart(records)
  const { page: staleGirl, drawing: staleGirlDrawing } = makePage({ babySex: 'girl' })
  staleGirl.drawChart(records)
  assert.deepStrictEqual(staleGirlDrawing.fills, boyDrawing.fills)
})

test('missing birthday keeps date labels and leaves the percentile unset', () => {
  const { page, drawing } = makePage({ babyBirthDate: '' })
  page.drawChart(records)
  assert.strictEqual(drawing.fills.filter(fill => fill.points.length > 20).length, 0)
  assert.strictEqual(page.percentileFor('weight', records[2]), '-')
  assert.ok(drawing.labels.some(label => label.text === '04-24'))
  assert.ok(drawing.labels.some(label => label.text === '12-24'))
})

test('dense daily records use evenly spaced month ticks on narrow screens', () => {
  const dense = Array.from({ length: 20 }, (_, i) => ({
    date: '2026-10-' + String(i + 1).padStart(2, '0'), weight: 8 + i * 0.01
  }))
  for (const width of [240, 270, 315, 380]) {
    const { page, drawing } = makePage({}, width)
    page.drawChart(dense)
    const labels = drawing.labels.filter(label => label.y > 250 && /^\d+$/.test(label.text))
    assert.ok(labels.length >= 3 && labels.length <= 6, 'label count must not grow with record count')
    for (let i = 1; i < labels.length; i += 1) {
      assert.ok(labels[i].x - labels[i - 1].x >= 40, 'month labels must not overlap')
    }
    assert.ok(!drawing.labels.some(label => /^\d{2}-\d{2}$/.test(label.text)), 'WHO axis should show months, not dates')
    assert.ok(drawing.labels.some(label => label.text === '月龄（月）'))
    assert.strictEqual(drawing.arcs, 0)
  }
})

test('height uses readable ticks and keeps every measurement inside the plot', () => {
  for (const birth of ['2026-02-24', '2021-12-24', '']) {
    const { page, drawing } = makePage({ viewMode: 'height', babyBirthDate: birth })
    page.drawChart(records)
    const ticks = drawing.labels.filter(label => label.align === 'right' && /^\d+(\.\d+)?$/.test(label.text))
    assert.ok(ticks.length >= 4 && ticks.length <= 7, 'height needs more detail than one huge interval')
    for (let i = 1; i < ticks.length; i += 1) {
      assert.ok(Math.abs(ticks[i].y - ticks[i - 1].y) >= 24, 'vertical labels must have room')
    }
    const curve = drawing.strokes.find(stroke => stroke.color === '#2D72BF')
    assert.ok(curve.points.every(point => point.y >= 32 && point.y <= 248))
  }
})

test('date labels leave space for aligned endpoints when the birthday is missing', () => {
  const dense = Array.from({ length: 20 }, (_, i) => ({
    date: '2026-10-' + String(i + 1).padStart(2, '0'), weight: 8 + i * 0.01
  }))
  for (const width of [240, 270, 315, 380]) {
    const { page, drawing } = makePage({ babyBirthDate: '' }, width)
    page.drawChart(dense)
    const labels = drawing.labels.filter(label => /^\d{2}-\d{2}$/.test(label.text))
    assert.strictEqual(labels[0].text, '10-01')
    assert.strictEqual(labels[labels.length - 1].text, '10-20')
    for (let i = 1; i < labels.length; i += 1) {
      assert.ok(labels[i].x - labels[i - 1].x >= 56, 'aligned endpoint dates need extra horizontal space')
    }
  }
})

test('a single measurement is a short line with a hint, without inventing a trend', () => {
  const { page, drawing } = makePage()
  page.drawChart([records[0]])
  const curve = drawing.strokes.find(stroke => stroke.color === '#2E8753')
  assert.ok(curve && curve.points.length === 2)
  assert.strictEqual(curve.points[0].y, curve.points[1].y)
  assert.ok(curve.points[1].x - curve.points[0].x <= 8)
  assert.strictEqual(page.data.chartRecordCount, 1)
  assert.strictEqual(drawing.arcs, 0)
})

test('a mode with no measurements clears the old curve', () => {
  const { page, drawing } = makePage()
  page.renderRecords([{ date: '2026-10-01', weight: 8 }])
  const clears = drawing.clears
  page.switchMode({ currentTarget: { dataset: { mode: 'height' } } })
  assert.strictEqual(page.data.chartRecordCount, 0)
  assert.ok(drawing.clears > clears, 'the previous metric must not remain on the canvas')
})

process.exitCode = failures ? 1 : 0
