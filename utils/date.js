function pad(n) {
  return String(n).padStart(2, '0')
}

function formatDate(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function formatTime(d) {
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function todayStr() {
  return formatDate(new Date())
}

function nowTimeStr() {
  return formatTime(new Date())
}

module.exports = { formatDate, formatTime, todayStr, nowTimeStr }
