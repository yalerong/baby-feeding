function previousDay(date) {
  const value = new Date(`${date}T00:00:00Z`)
  value.setUTCDate(value.getUTCDate() - 1)
  return value.toISOString().slice(0, 10)
}

function getUndoTrialState(trial, date) {
  if (!trial || trial.lastTriedDate !== date) return null
  const trialCount = Number(trial.trialCount) || 0
  // 第一天撤销回到 0 天而不是删档：自定义食材要留在解锁页里
  if (trialCount <= 1) return { action: 'reset', trialCount: 0, status: 'tracking', lastTriedDate: '' }
  return {
    action: 'update',
    trialCount: trialCount - 1,
    status: 'tracking',
    lastTriedDate: previousDay(date)
  }
}

module.exports = { getUndoTrialState }
