// 对照 WHO 官方百分位表核对计算是否正确（官方值取 12 月龄的 P3/P50/P97）
const assert = require('assert')
const standards = require('../utils/growthStandards.js')
const dateUtil = require('../utils/date.js')

function near(actual, expected, tolerance) {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} should be within ${tolerance} of ${expected}`)
}

// 12 月龄：男宝体重 7.8/9.6/11.8，女宝 7.1/8.9/11.3；男宝身长 71.3/75.7/80.2，女宝 69.2/74.0/78.9
near(standards.valueAtPercentile('weight', 'boy', 12, 3), 7.8, 0.15)
near(standards.valueAtPercentile('weight', 'boy', 12, 50), 9.6, 0.15)
near(standards.valueAtPercentile('weight', 'boy', 12, 97), 11.8, 0.15)
near(standards.valueAtPercentile('weight', 'girl', 12, 50), 8.9, 0.15)
near(standards.valueAtPercentile('height', 'boy', 12, 50), 75.7, 0.15)
near(standards.valueAtPercentile('height', 'girl', 12, 3), 69.2, 0.15)
console.log('ok - percentile values match the official WHO table at 12 months')

// 中位值反查应当回到第 50 百分位
const medianBoy = standards.valueAtPercentile('weight', 'boy', 8, 50)
near(standards.percentileOf('weight', 'boy', 8, medianBoy), 50, 0.5)
assert.ok(standards.percentileOf('weight', 'boy', 8, medianBoy - 1) < 50)
assert.ok(standards.percentileOf('weight', 'boy', 8, medianBoy + 1) > 50)
assert.strictEqual(standards.percentileOf('weight', 'boy', 8, 0), null)
console.log('ok - percentileOf inverts the median and rejects invalid values')

// 参考带按月递增，且 P3 < P50 < P97
const band = standards.bandSeries('weight', 'boy', 0, 24)
assert.strictEqual(band.length, 25)
band.forEach(row => {
  assert.ok(row.p3 < row.p50 && row.p50 < row.p97, `bad band at month ${row.month}`)
  assert.ok(row.p3 > 0)
})
assert.ok(band[24].p50 > band[0].p50)
console.log('ok - band series grows monotonically with ordered percentiles')

// 超出 0–60 月要夹住，避免读到表外数据
const clamped = standards.bandSeries('height', 'girl', -5, 99)
assert.strictEqual(clamped[0].month, 0)
assert.strictEqual(clamped[clamped.length - 1].month, standards.MAX_MONTH)
console.log('ok - band series clamps to 0-60 months')

// 月龄换算：出生当天 0，满 6 个整月约等于 6
assert.strictEqual(dateUtil.ageInMonths('2026-02-24', '2026-02-24'), 0)
near(dateUtil.ageInMonths('2026-02-24', '2026-08-24'), 6, 0.1)
assert.strictEqual(dateUtil.ageInMonths('', '2026-08-24'), null)
console.log('ok - ageInMonths keeps fractional months and rejects bad input')
