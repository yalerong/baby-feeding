const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

exports.main = async (event, context) => {
  const { familyCode, range } = event

  try {
    const conditions = { familyCode }

    if (range !== 'all') {
      const days = parseInt(range)
      const now = new Date()
      const start = new Date(now.getTime() - days * 24 * 60 * 60 * 1000)
      const startStr = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}-${String(start.getDate()).padStart(2, '0')}`
      conditions.date = _.gte(startStr)
    }

    const res = await db.collection('feeding_records').where(conditions).orderBy('date', 'desc').orderBy('time', 'desc').limit(500).get()
    const list = res.data || []

    // 按日期分组聚合
    const dayMap = {}
    let totalCount = 0
    let totalMilk = 0
    let totalBreast = 0
    let totalStool = 0

    list.forEach(item => {
      const d = item.date
      if (!dayMap[d]) {
        dayMap[d] = { date: d, count: 0, feedingCount: 0, breast: 0, formula: 0, total: 0, stool: 0, stoolCount: 0 }
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
      stats: {
        totalCount,
        totalMilk,
        totalBreast,
        totalStool,
        ratio
      },
      dailyStats
    }
  } catch (err) {
    console.error(err)
    return { success: false, error: err.message, stats: { totalCount: 0, totalMilk: 0, totalBreast: 0, totalStool: 0, ratio: '0%' }, dailyStats: [] }
  }
}
