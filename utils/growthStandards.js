// WHO 儿童生长标准的百分位计算。用 LMS 参数可以算任意百分位的数值，
// 也能反过来按测量值估算百分位。原始参数见 growthStandardsData.js。
const data = require('./growthStandardsData.js')

const MAX_MONTH = 60
// 正态分布下 P3 / P97 对应的 z 值，也是参考带的上下边界
const Z_P3 = -1.880794
const Z_P97 = 1.880794

function seriesFor(measure, sex) {
  const boy = sex !== 'girl'
  if (measure === 'weight') return boy ? data.WEIGHT_BOY : data.WEIGHT_GIRL
  return boy ? data.HEIGHT_BOY : data.HEIGHT_GIRL
}

function clampMonth(month) {
  const value = Number(month)
  if (!Number.isFinite(value)) return 0
  return Math.min(MAX_MONTH, Math.max(0, value))
}

// 月龄带小数时，在相邻两个月之间线性插值 L/M/S
function lmsAt(measure, sex, month) {
  const series = seriesFor(measure, sex)
  const value = clampMonth(month)
  const lower = Math.floor(value)
  const upper = Math.min(MAX_MONTH, lower + 1)
  const t = value - lower
  const a = series[lower]
  const b = series[upper]
  return {
    L: a[1] + (b[1] - a[1]) * t,
    M: a[2] + (b[2] - a[2]) * t,
    S: a[3] + (b[3] - a[3]) * t
  }
}

function valueAtZ(lms, z) {
  if (Math.abs(lms.L) < 1e-9) return lms.M * Math.exp(lms.S * z)
  return lms.M * Math.pow(1 + lms.L * lms.S * z, 1 / lms.L)
}

function zAtValue(lms, value) {
  if (!(value > 0)) return null
  if (Math.abs(lms.L) < 1e-9) return Math.log(value / lms.M) / lms.S
  return (Math.pow(value / lms.M, lms.L) - 1) / (lms.L * lms.S)
}

// 标准正态分布累积概率，Abramowitz & Stegun 7.1.26，绝对误差 < 1e-7
function normalCdf(z) {
  const t = 1 / (1 + 0.2316419 * Math.abs(z))
  const density = 0.3989422804014327 * Math.exp(-z * z / 2)
  const tail = density * t *
    (0.319381530 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))))
  return z >= 0 ? 1 - tail : tail
}

function valueAtPercentile(measure, sex, month, percentile) {
  const z = inverseNormal(Number(percentile) / 100)
  if (!Number.isFinite(z)) return null
  return valueAtZ(lmsAt(measure, sex, month), z)
}

// 二分法反解正态分布分位数，够用且没有额外依赖
function inverseNormal(p) {
  if (!(p > 0) || !(p < 1)) return null
  let low = -8
  let high = 8
  for (let i = 0; i < 80; i += 1) {
    const mid = (low + high) / 2
    if (normalCdf(mid) < p) low = mid
    else high = mid
  }
  return (low + high) / 2
}

// 返回 0–100 的百分位，保留一位小数；数值异常时返回 null
function percentileOf(measure, sex, month, value) {
  const z = zAtValue(lmsAt(measure, sex, month), value)
  if (z === null || !Number.isFinite(z)) return null
  return Math.round(normalCdf(z) * 1000) / 10
}

// 按月取参考带：p3 / p50 / p97，供画图使用
function bandSeries(measure, sex, fromMonth, toMonth) {
  const from = Math.max(0, Math.ceil(Number(fromMonth) || 0))
  const to = Math.min(MAX_MONTH, Math.floor(Number(toMonth) || 0))
  const rows = []
  for (let month = from; month <= to; month += 1) {
    const lms = lmsAt(measure, sex, month)
    rows.push({
      month,
      p3: valueAtZ(lms, Z_P3),
      p50: lms.M,
      p97: valueAtZ(lms, Z_P97)
    })
  }
  return rows
}

module.exports = {
  MAX_MONTH,
  Z_P3,
  Z_P97,
  lmsAt,
  valueAtPercentile,
  percentileOf,
  bandSeries,
  normalCdf
}
