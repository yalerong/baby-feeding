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

// 升级前的文档没有 logDates；那时只有严格模式，按"最近 trialCount 天连续"反推出来
function seedLogDates(trial) {
  if (!trial) return []
  if (Array.isArray(trial.logDates)) return trial.logDates.slice()
  const count = Number(trial.trialCount) || 0
  if (!trial.lastTriedDate || count <= 0) return []
  const dates = []
  let cursor = trial.lastTriedDate
  for (let i = 0; i < count; i++) {
    dates.unshift(cursor)
    cursor = previousDay(cursor)
  }
  return dates
}

// logDates：这一轮试吃打过卡的日期列表（升序）。严格模式是连续日期，宽松模式可以有间隔
function nextLogDates(existing, date, consecutive) {
  const base = consecutive ? seedLogDates(existing) : []
  return base.filter(item => item !== date).concat(date).sort()
}

function getUndoTrialState(trial, date) {
  if (!trial || trial.lastTriedDate !== date) return null
  const trialCount = Number(trial.trialCount) || 0
  const logSources = withLogSource(trial.logSources, date, '')
  // 第一天撤销回到 0 天而不是删档：自定义食材要留在解锁页里
  if (trialCount <= 1) return { action: 'reset', trialCount: 0, status: 'tracking', lastTriedDate: '', logSources: {}, logDates: [], lastLogRecordId: '' }
  // 有日期列表就回到列表里的上一天（宽松模式可能不是昨天）；老文档没有列表时按连续假设退一天
  const logDates = seedLogDates(trial).filter(item => item !== date)
  const prev = logDates.length ? logDates[logDates.length - 1] : previousDay(date)
  return {
    action: 'update',
    trialCount: trialCount - 1,
    status: 'tracking',
    lastTriedDate: prev,
    logSources,
    logDates,
    lastLogRecordId: logSources[prev] || ''
  }
}

module.exports = { getUndoTrialState, withLogSource, nextLogDates, seedLogDates }
