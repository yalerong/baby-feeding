const dateUtil = require('./date.js')

// 相比保存菜单时的解锁快照，现在多解锁了哪些食材。快照为空/缺失（老数据）就不提示
function getNewlyUnlockedFoods(currentUnlocked, snapshot) {
  if (!Array.isArray(currentUnlocked) || !Array.isArray(snapshot)) return []
  return currentUnlocked.filter(food => !snapshot.includes(food))
}

// 保存过的一周里，只把今天之后的常规餐位换成按最新解锁状态生成的，过去和今天的安排不动
function refreshFutureDays({ plan, generated, today }) {
  if (!plan || !generated || !Array.isArray(plan.days) || !Array.isArray(generated.days)) return { plan, changedDates: [] }
  const changedDates = []
  const days = plan.days.map((day, index) => {
    const fresh = generated.days[index]
    if (!fresh || !day || day.date !== fresh.date) return day
    if (dateUtil.compareDates(day.date, today) <= 0) return day
    if (day.phase !== 'regular' || fresh.phase !== 'regular') return day
    changedDates.push(day.date)
    return fresh
  })
  return {
    plan: { ...plan, days, nutritionSummary: summarize(days) },
    changedDates
  }
}

function summarize(days) {
  const summary = {}
  days.forEach(day => {
    Object.keys(day.meals || {}).forEach(type => {
      ;(day.meals[type] || []).forEach(dish => {
        ;(dish.nutritionTags || []).forEach(tag => { summary[tag] = (summary[tag] || 0) + 1 })
      })
    })
  })
  return summary
}

module.exports = { getNewlyUnlockedFoods, refreshFutureDays }
