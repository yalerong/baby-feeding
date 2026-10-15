const assert = require('assert')
const fs = require('fs')
const path = require('path')

let config
global.Page = value => { config = value }
require('../pages/growth/growth.js')

function makePage(mode) {
  const drawing = { labels: [], strokes: [], fills: [] }
  let points = []
  const ctx = {
    scale() {}, clearRect() {}, closePath() {}, arc() {},
    beginPath() { points = [] },
    moveTo(x, y) { points.push({ x, y }) },
    lineTo(x, y) { points.push({ x, y }) },
    stroke() { drawing.strokes.push({ color: this.strokeStyle, points: points.slice() }) },
    fill() { drawing.fills.push(points.slice()) },
    fillText(value) { if (this.textAlign === 'right') drawing.labels.push(value) }
  }
  global.wx = {
    createSelectorQuery() {
      return {
        select() { return this }, fields() { return this },
        exec(callback) { callback([{ node: { getContext: () => ctx }, width: 345, height: 280 }]) }
      }
    }
  }
  const page = {
    ...config,
    data: { ...JSON.parse(JSON.stringify(config.data)), viewMode: mode || 'weight' },
    setData(patch, callback) { Object.assign(this.data, patch); if (callback) callback() }
  }
  return { page, drawing }
}

let failures = 0
function test(name, fn) {
  try { fn(); console.log('ok - ' + name) }
  catch (err) { failures += 1; console.error('not ok - ' + name); console.error(err.message) }
}

test('milestone navigation appears before the unbounded history rows', () => {
  const template = fs.readFileSync(path.join(__dirname, '../pages/growth/growth.wxml'), 'utf8')
  const entry = template.indexOf('bindtap="goMilestones"')
  const history = template.indexOf('class="card history-card"')
  assert.ok(entry >= 0 && history >= 0 && entry < history,
    'expanded growth history must not push the only milestone entry below its records')
})

const records = [
  { date: '2026-07-01', weight: 8, height: 60 },
  { date: '2026-08-01', weight: 20, height: 65 },
  { date: '2026-09-01', weight: 25, height: 70 },
  { date: '2026-10-01', weight: 40, height: 75 }
]

test('weights above 20 stay inside the fixed plot and get distinct overflow markers', () => {
  const { page, drawing } = makePage()
  const original = JSON.stringify(records)
  page.renderRecords(records)
  assert.deepStrictEqual(drawing.labels, ['0', '5', '10', '15', '20'])
  const curve = drawing.strokes.find(stroke => stroke.color === '#3F7B60' && stroke.points.length === records.length)
  assert.ok(curve)
  assert.ok(curve.points.every(point => point.y >= 35 && point.y <= 230),
    'all weight values must map inside the plotting area')
  assert.strictEqual(drawing.fills.filter(points => points.length === 3).length, 2,
    'out-of-range values must be visibly different from actual 20kg measurements')
  assert.strictEqual(page.data.weightOverflowCount, 2)
  assert.strictEqual(page.data.weightOverflowMax, 40)
  assert.strictEqual(JSON.stringify(records), original)
})

test('the ceiling itself is a normal measurement and stale overflow notices clear', () => {
  const { page, drawing } = makePage()
  page.renderRecords([records[1]])
  assert.strictEqual(page.data.weightOverflowCount, 0)
  assert.strictEqual(drawing.fills.filter(points => points.length === 3).length, 0)
  page.renderRecords([records[3]])
  assert.strictEqual(page.data.weightOverflowCount, 1)
  page.renderRecords([])
  assert.strictEqual(page.data.weightOverflowCount, 0)
  assert.strictEqual(page.data.weightOverflowMax, 0)
})

test('height data keeps its automatic range and never uses weight overflow markers', () => {
  const { page, drawing } = makePage('height')
  page.renderRecords(records)
  const curve = drawing.strokes.find(stroke => stroke.color === '#527A94' && stroke.points.length === records.length)
  assert.ok(curve && curve.points.every(point => point.y >= 35 && point.y <= 230))
  assert.strictEqual(drawing.fills.filter(points => points.length === 3).length, 0)
  assert.notDeepStrictEqual(drawing.labels, ['0', '5', '10', '15', '20'])
})

process.exitCode = failures ? 1 : 0
