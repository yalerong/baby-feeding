const dateUtil = require('./date.js')

const UNLOCK_DAYS = 3

function getAllergenInfo(name) {
  if (/(鸡蛋|虾|蟹|贝|鱼|奶|乳|面粉|小麦|麸质|豆腐|黄豆|大豆|豌豆|扁豆|红豆|绿豆|鹰嘴豆|芝麻|花生|坚果)/.test(name)) {
    return { level: 'common-allergen', label: '常见过敏原', hint: '单独尝试，留意反应' }
  }
  return { level: 'observe', label: '日常观察', hint: '新食材仍需单独尝试' }
}

function buildTrialSteps(trialCount, status) {
  const count = Number(trialCount) || 0
  return [1, 2, 3].map(number => ({
    number,
    done: status === 'unlocked' || count >= number,
    current: status === 'tracking' && count === number
  }))
}

function getNextTrialState(trial, date) {
  const current = trial || {}
  if (current.lastTriedDate === date) {
    return { trialCount: Number(current.trialCount) || 0, duplicate: true }
  }
  const isNextDay = current.lastTriedDate && dateUtil.addDays(current.lastTriedDate, 1) === date
  return {
    trialCount: isNextDay ? (Number(current.trialCount) || 0) + 1 : 1,
    duplicate: false
  }
}

function decorateFood(name, trial) {
  const current = trial || {}
  const trialCount = Number(current.trialCount) || 0
  const allergic = current.status === 'allergic'
  const unlocked = !allergic && trialCount >= UNLOCK_DAYS
  const status = allergic ? 'allergic' : (unlocked ? 'unlocked' : 'tracking')
  const remainingCount = Math.max(0, UNLOCK_DAYS - trialCount)
  return {
    name,
    trialCount,
    remainingCount,
    status,
    allergyNote: String(current.allergyNote || ''),
    allergyDate: String(current.allergyDate || ''),
    statusText: allergic ? '疑似过敏，已排除' : (unlocked ? '已解锁' : `再连续吃 ${remainingCount} 天解锁`)
  }
}

function isOngoingTrial(trial) {
  return trial && trial.status === 'tracking' && Number(trial.trialCount) > 0 && Number(trial.trialCount) < UNLOCK_DAYS
}

function getActiveFoodName(trials, today) {
  const yesterday = today ? dateUtil.addDays(today, -1) : ''
  const active = (trials || []).find(trial =>
    isOngoingTrial(trial) && (trial.lastTriedDate === today || trial.lastTriedDate === yesterday)
  )
  return active ? active.foodName : ''
}

// 补录某天时，别的食材在这天之后（或当天）还有进行中的连续试吃，就不能再往这天塞第二种
function hasLaterOngoingTrial(trials, date, foodName) {
  return (trials || []).some(trial =>
    trial.foodName !== foodName && isOngoingTrial(trial) && trial.lastTriedDate && trial.lastTriedDate >= date
  )
}

// 录辅食自动打卡的目标食材。返回 null=无需记录；''=多种新食材无法自动定位；其余=要打卡的食材名。
// 规则：优先推进进行中的试吃；没有进行中的且恰好只有一种新食材时才自动开新试吃。
function getAutoTrialTarget(foods, trials, date) {
  const byName = {}
  ;(trials || []).forEach(trial => { byName[trial.foodName] = trial })
  const eligible = (foods || []).filter(name => {
    const trial = byName[name]
    if (!trial) return true
    if (trial.status === 'allergic') return false
    if (trial.lastTriedDate === date) return false
    // 补录早于最近一次试吃的日期会把连续天数算乱，不自动打卡
    if (trial.lastTriedDate && trial.lastTriedDate > date) return false
    return Number(trial.trialCount) < UNLOCK_DAYS
  })
  if (eligible.length === 0) return null
  const active = getActiveFoodName(trials, date)
  if (active) return eligible.includes(active) ? active : null
  if (eligible.length === 1) return hasLaterOngoingTrial(trials, date, eligible[0]) ? null : eligible[0]
  return ''
}

function getUnlockedFoodNames(trials) {
  return (trials || [])
    .filter(trial => trial.foodName && trial.status !== 'allergic' && Number(trial.trialCount) >= UNLOCK_DAYS)
    .map(trial => trial.foodName)
}

function getExcludedIngredients(trials) {
  return (trials || [])
    .filter(trial => trial.status === 'allergic' && trial.foodName)
    .map(trial => trial.foodName)
}

function getMissingAllergicFoodNames(trials, knownFoodNames) {
  return (trials || [])
    .filter(trial => trial.status === 'allergic' && trial.foodName && !knownFoodNames[trial.foodName])
    .map(trial => trial.foodName)
}

// 有试吃记录但不在当前月龄菜库食材里的（自定义食材、早期月龄食材），解锁页也要显示
function getMissingTrialFoodNames(trials, knownFoodNames) {
  return (trials || [])
    .filter(trial => trial.foodName && !knownFoodNames[trial.foodName])
    .map(trial => trial.foodName)
}

// 某天的打卡来源（哪条喂养记录自动打的）；兼容只有 lastLogRecordId 的旧文档
function getLogSource(trial, date) {
  const sources = trial && trial.logSources
  if (sources && sources[date]) return sources[date]
  return trial && trial.lastTriedDate === date ? (trial.lastLogRecordId || '') : ''
}

// 删除/修改辅食记录后要回退的试吃食材：那天的卡是这条记录自动打的、且这天没有别的记录再吃它。
// 手动在解锁页打的卡（没有来源）不回退。只有 streak 最后一天能真正撤销，中间某天由云函数拒绝。
// lastDayOnly=true（默认，用于撤销）只认 streak 最后一天；来源移交传 false，任何一天都可以
function getTrialRevertFoods({ foods, otherFoods, trials, date, recordId, lastDayOnly }) {
  const byName = {}
  ;(trials || []).forEach(trial => { byName[trial.foodName] = trial })
  const covered = otherFoods || []
  const onlyLast = lastDayOnly !== false
  return (foods || []).filter(name => {
    const trial = byName[name]
    if (!trial || trial.status === 'allergic' || Number(trial.trialCount) <= 0) return false
    if (onlyLast && trial.lastTriedDate !== date) return false
    if (!recordId || getLogSource(trial, date) !== recordId) return false
    return !covered.includes(name)
  })
}

function orderTrialFoods(foods) {
  return (foods || []).slice().sort((left, right) => {
    return Number(left.status === 'allergic') - Number(right.status === 'allergic')
  })
}

module.exports = {
  UNLOCK_DAYS,
  getNextTrialState,
  decorateFood,
  buildTrialSteps,
  getAllergenInfo,
  getActiveFoodName,
  hasLaterOngoingTrial,
  getAutoTrialTarget,
  getUnlockedFoodNames,
  getExcludedIngredients,
  getMissingAllergicFoodNames,
  getMissingTrialFoodNames,
  getLogSource,
  getTrialRevertFoods,
  orderTrialFoods
}
