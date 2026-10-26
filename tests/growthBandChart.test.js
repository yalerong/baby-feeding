// 参考带的绘制行为：有性别和生日时才叠 WHO 带，横轴按真实月龄排布
const assert = require('assert')

let config
global.Page = value => { config = value }
require('../pages/growth/growth.js')

function makePage(overrides) {
  const drawing = { strokes: [], fills: [] }
  let points = []
  const ctx = {
    scale() {}, clearRect() {}, closePath() {}, arc() {},
    setLineDash() {},
    beginPath() { points = [] },
    moveTo(x, y) { points.push({ x, y }) },
    lineTo(x, y) { points.push({ x, y }) },
    stroke() { drawing.strokes.push({ color: this.strokeStyle, points: points.slice() }) },
    fill() { drawing.fills.push({ color: this.fillStyle, points: points.slice() }) },
    fillText() {}
  }
  global.wx = {
    getStorageSync() { return '' },
    createSelectorQuery() {
      return {
        select() { return this },
        fields() { return this },
        exec(callback) { callback([{ node: { getContext: () => ctx }, width: 345, height: 280 }]) }
      }
    }
  }
  const page = {
    ...config,
    data: { ...JSON.parse(JSON.stringify(config.data)), ...overrides },
    setData(patch, callback) { Object.assign(this.data, patch); if (callback) callback() }
  }
  return { page, drawing }
}

// 三次测量的月龄间距故意不等（2 / 4 / 10 个月），用来区分「按月龄」和「按序号」排布
const records = [
  { _id: 'a', date: '2026-04-24', weight: 5.9, height: 61 },
  { _id: 'b', date: '2026-06-24', weight: 7.2, height: 66 },
  { _id: 'c', date: '2026-12-24', weight: 9.6, height: 74 }
]

// 有性别 + 生日：画参考带，横轴按月龄而不是按记录序号
const withBand = makePage({ babySex: 'boy', babyBirthDate: '2026-02-24' })
withBand.page.drawChart(records)
const bandFill = withBand.drawing.fills.find(fill => fill.points.length > 20)
assert.ok(bandFill, 'reference band should be filled as one polygon')
assert.ok(bandFill.color.indexOf('rgba') === 0)
const curve = withBand.drawing.strokes.find(stroke => stroke.color === '#76C393' && stroke.points.length === records.length)
assert.ok(curve, 'child curve still drawn')
const xs = curve.points.map(point => point.x)
assert.ok(xs[0] < xs[1] && xs[1] < xs[2], 'points ordered by age')
const gaps = [xs[1] - xs[0], xs[2] - xs[1]]
assert.ok(Math.abs(gaps[0] - gaps[1]) > 1, 'x spacing follows age, not equal steps')
console.log('ok - band is drawn and the x axis follows real age')

// 没有性别：不画带，保持原来的等距横轴
const withoutBand = makePage({ babySex: '', babyBirthDate: '2026-02-24' })
withoutBand.page.drawChart(records)
assert.strictEqual(withoutBand.drawing.fills.filter(fill => fill.points.length > 20).length, 0)
const plainCurve = withoutBand.drawing.strokes.find(stroke => stroke.color === '#76C393' && stroke.points.length === records.length)
const plainGaps = [plainCurve.points[1].x - plainCurve.points[0].x, plainCurve.points[2].x - plainCurve.points[1].x]
assert.ok(Math.abs(plainGaps[0] - plainGaps[1]) < 0.001, 'without band the spacing stays even')
console.log('ok - without a sex setting the chart keeps its original layout')

// 最新值百分位：缺性别时显示 '-'，有性别时给出数字
const noSex = makePage({ babySex: '', babyBirthDate: '2026-02-24' })
assert.strictEqual(noSex.page.percentileFor('weight', records[2]), '-')
const withSex = makePage({ babySex: 'boy', babyBirthDate: '2026-02-24' })
const percentile = Number(withSex.page.percentileFor('weight', records[2]))
assert.ok(percentile > 0 && percentile < 100, 'percentile should be a real number')
console.log('ok - latest value maps to a percentile only when the sex is known')
