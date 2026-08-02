const dateUtil = require('./date.js')

const UNLOCK_DAYS = 3

function getAllergenInfo(name) {
  if (/(鸡蛋|虾|蟹|贝|鱼|奶|乳|面粉|小麦|麸质|豆腐|黄豆|大豆|豆类|芝麻|花生|坚果)/.test(name)) {
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
    statusText: allergic ? '疑似过敏，已排除' : (unlocked ? '已解锁' : `再连续吃 ${remainingCount} 天解锁`)
  }
}

function getActiveFoodName(trials, today) {
  const yesterday = today ? dateUtil.addDays(today, -1) : ''
  const active = (trials || []).find(trial =>
    trial.status === 'tracking' &&
    Number(trial.trialCount) > 0 &&
    Number(trial.trialCount) < UNLOCK_DAYS &&
    (trial.lastTriedDate === today || trial.lastTriedDate === yesterday)
  )
  return active ? active.foodName : ''
}

function getExcludedIngredients(trials) {
  return (trials || [])
    .filter(trial => trial.status === 'allergic' && trial.foodName)
    .map(trial => trial.foodName)
}

module.exports = {
  UNLOCK_DAYS,
  getNextTrialState,
  decorateFood,
  buildTrialSteps,
  getAllergenInfo,
  getActiveFoodName,
  getExcludedIngredients
}
