const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command
const dateRange = require('./dateRange.js')

const PAGE_SIZE = 100
const BEIJING_OFFSET_MS = 8 * 60 * 60 * 1000

async function fetchAll(conditions) {
  const records = []
  let skip = 0
  while (true) {
    const res = await db.collection('feeding_records')
      .where(conditions)
      .orderBy('date', 'desc')
      .orderBy('time', 'desc')
      .skip(skip)
      .limit(PAGE_SIZE)
      .get()
    const batch = res.data || []
    records.push(...batch)
    if (batch.length < PAGE_SIZE) break
    skip += PAGE_SIZE
    if (skip > 50000) break
  }
  return records
}

exports.main = async (event) => {
  const { familyCode, range } = event

  if (!familyCode) {
    return { success: false, error: 'familyCode required', stats: empty(), dailyStats: [] }
  }

  try {
    const conditions = { familyCode }

    if (range !== 'all') {
      const bounds = dateRange.getCompletedDayRange(range, formatBeijingDate(new Date()))
      if (!bounds) {
        return { success: false, error: 'invalid range', stats: empty(), dailyStats: [] }
      }
      conditions.date = _.gte(bounds.startDate).and(_.lt(bounds.endDateExclusive))
    }

    const list = await fetchAll(conditions)

    const dayMap = {}
    let totalCount = 0
    let totalMilk = 0
    let totalBreast = 0
    let totalStool = 0
    let totalSolid = 0
    let totalSolidGrams = 0

    list.forEach(item => {
      const d = item.date
      if (!dayMap[d]) {
        dayMap[d] = { date: d, count: 0, feedingCount: 0, breast: 0, formula: 0, total: 0, stool: 0, stoolCount: 0, solidCount: 0, solidGrams: 0 }
      }
      const breastMilk = Number(item.breastMilk) || 0
      const formulaMilk = Number(item.formula) || 0
      const milkTotal = breastMilk + formulaMilk
      const hasFeeding = breastMilk > 0 || formulaMilk > 0
      if (hasFeeding) {
        dayMap[d].count += 1
        dayMap[d].feedingCount += 1
      }
      dayMap[d].breast += breastMilk
      dayMap[d].formula += formulaMilk
      dayMap[d].total += milkTotal
      if (item.stool) {
        dayMap[d].stool += 1
        dayMap[d].stoolCount += 1
      }
      if (item.solidFood) {
        const grams = Number(item.solidFoodGrams) || 0
        dayMap[d].solidCount += 1
        dayMap[d].solidGrams += grams
        totalSolid += 1
        totalSolidGrams += grams
      }

      if (hasFeeding) totalCount += 1
      totalMilk += milkTotal
      totalBreast += breastMilk
      if (item.stool) totalStool += 1
    })

    const dailyStats = Object.values(dayMap).sort((a, b) => b.date.localeCompare(a.date))
    dailyStats.forEach(d => {
      d.ratio = d.total === 0 ? '0%' : (d.breast / d.total * 100).toFixed(1) + '%'
    })

    const ratio = totalMilk === 0 ? '0%' : (totalBreast / totalMilk * 100).toFixed(1) + '%'

    return {
      success: true,
      stats: { totalCount, totalMilk, totalBreast, totalStool, totalSolid, totalSolidGrams, ratio },
      dailyStats
    }
  } catch (err) {
    console.error(err)
    return { success: false, error: err.message, stats: empty(), dailyStats: [] }
  }
}

function empty() {
  return { totalCount: 0, totalMilk: 0, totalBreast: 0, totalStool: 0, totalSolid: 0, totalSolidGrams: 0, ratio: '0%' }
}

function pad(n) {
  return String(n).padStart(2, '0')
}

function formatBeijingDate(date) {
  const bj = new Date(date.getTime() + BEIJING_OFFSET_MS)
  return `${bj.getUTCFullYear()}-${pad(bj.getUTCMonth() + 1)}-${pad(bj.getUTCDate())}`
}
