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

function daysBetween(startStr, endStr) {
  if (!startStr) return 0
  const s = new Date(startStr)
  const e = endStr ? new Date(endStr) : new Date()
  s.setHours(0, 0, 0, 0)
  e.setHours(0, 0, 0, 0)
  return Math.max(0, Math.round((e - s) / 86400000))
}

function ageText(birthStr, refStr) {
  if (!birthStr) return ''
  const b = new Date(birthStr)
  const t = refStr ? new Date(refStr) : new Date()
  let years = t.getFullYear() - b.getFullYear()
  let months = t.getMonth() - b.getMonth()
  let days = t.getDate() - b.getDate()
  if (days < 0) {
    months -= 1
    const prev = new Date(t.getFullYear(), t.getMonth(), 0)
    days += prev.getDate()
  }
  if (months < 0) {
    years -= 1
    months += 12
  }
  const totalMonths = years * 12 + months
  if (totalMonths < 1) return `${daysBetween(birthStr, refStr)} 天`
  if (years >= 1 && months === 0) return `${years} 岁`
  if (years >= 1) return `${years} 岁 ${months} 个月`
  return `${months} 个月 ${days} 天`
}

const MILESTONES = {
  1: '欢迎来到这个世界 🎉',
  7: '出生满一周啦 🎈',
  30: '满月快乐 🌙',
  50: '50 天小宝贝 ✨',
  100: '百天快乐 🎂',
  180: '半岁啦 🌟',
  200: '200 天纪念 💫',
  365: '一岁生日快乐 🎂',
  500: '500 天陪伴 💝',
  730: '两岁生日快乐 🎂',
  1095: '三岁啦 🎂'
}

function milestone(days) {
  return MILESTONES[days] || ''
}

module.exports = {
  formatDate,
  formatTime,
  todayStr,
  nowTimeStr,
  daysBetween,
  ageText,
  milestone
}
