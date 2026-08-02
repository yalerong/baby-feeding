function pad(n) {
  return String(n).padStart(2, '0')
}

function addDays(dateStr, days) {
  const parts = dateStr.split('-').map(n => parseInt(n, 10))
  const next = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2] + days))
  return `${next.getUTCFullYear()}-${pad(next.getUTCMonth() + 1)}-${pad(next.getUTCDate())}`
}

function getCompletedDayRange(range, today) {
  if (range === 'all') return null
  const days = parseInt(range, 10)
  if (isNaN(days) || days <= 0) return null
  return {
    startDate: addDays(today, -days),
    endDateExclusive: today
  }
}

module.exports = {
  getCompletedDayRange
}
