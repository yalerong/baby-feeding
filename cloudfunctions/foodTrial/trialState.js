function previousDay(date) {
  const value = new Date(`${date}T00:00:00Z`)
  value.setUTCDate(value.getUTCDate() - 1)
  return value.toISOString().slice(0, 10)
}

// logSources：{ 'YYYY-MM-DD': recordId } 记录 streak 里每一天是哪条喂养记录自动打的卡；手动打卡不记
function withLogSource(logSources, date, recordId) {
  const next = { ...(logSources || {}) }
  const id = String(recordId || '')
  if (id) next[date] = id
  else delete next[date]
  return next
}

function getUndoTrialState(trial, date) {
  if (!trial || trial.lastTriedDate !== date) return null
  const trialCount = Number(trial.trialCount) || 0
  const logSources = withLogSource(trial.logSources, date, '')
  // 第一天撤销回到 0 天而不是删档：自定义食材要留在解锁页里
  if (trialCount <= 1) return { action: 'reset', trialCount: 0, status: 'tracking', lastTriedDate: '', logSources: {}, lastLogRecordId: '' }
  const prev = previousDay(date)
  return {
    action: 'update',
    trialCount: trialCount - 1,
    status: 'tracking',
    lastTriedDate: prev,
    logSources,
    lastLogRecordId: logSources[prev] || ''
  }
}

module.exports = { getUndoTrialState, withLogSource }
