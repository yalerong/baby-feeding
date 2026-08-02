function pad(n) {
  return String(n).padStart(2, '0')
}

const BEIJING_OFFSET_MS = 8 * 60 * 60 * 1000
const DAY_MS = 24 * 60 * 60 * 1000

function partsToDateStr(parts) {
  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}`
}

function beijingPartsFromDate(d) {
  const bj = new Date(d.getTime() + BEIJING_OFFSET_MS)
  return {
    year: bj.getUTCFullYear(),
    month: bj.getUTCMonth() + 1,
    day: bj.getUTCDate(),
    hour: bj.getUTCHours(),
    minute: bj.getUTCMinutes()
  }
}

function parseDateParts(value) {
  if (value instanceof Date) return beijingPartsFromDate(value)
  if (typeof value !== 'string') return null
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!match) return null
  return {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3])
  }
}

function calendarPartsFromMs(ms) {
  const d = new Date(ms)
  return {
    year: d.getUTCFullYear(),
    month: d.getUTCMonth() + 1,
    day: d.getUTCDate()
  }
}

function dateValueMs(value) {
  const parts = parseDateParts(value)
  if (!parts) return null
  return Date.UTC(parts.year, parts.month - 1, parts.day)
}

function formatDate(d) {
  const parts = parseDateParts(d)
  return parts ? partsToDateStr(parts) : ''
}

function formatTime(d) {
  const parts = d instanceof Date ? beijingPartsFromDate(d) : null
  return parts ? `${pad(parts.hour)}:${pad(parts.minute)}` : ''
}

function todayStr() {
  return formatDate(new Date())
}

function nowTimeStr() {
  return formatTime(new Date())
}

function nowBeijingTimestamp(now) {
  const instant = now instanceof Date ? now : new Date()
  const parts = beijingPartsFromDate(instant)
  return Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, instant.getUTCSeconds(), instant.getUTCMilliseconds()) - BEIJING_OFFSET_MS
}

function daysBetween(startStr, endStr) {
  if (!startStr) return 0
  const startMs = dateValueMs(startStr)
  const endMs = dateValueMs(endStr || new Date())
  if (startMs === null || endMs === null) return 0
  const diff = Math.round((endMs - startMs) / DAY_MS)
  return Math.max(0, diff + 1)
}

function ageText(birthStr, refStr) {
  if (!birthStr) return ''
  const b = parseDateParts(birthStr)
  const t = parseDateParts(refStr || new Date())
  if (!b || !t || compareDates(refStr || new Date(), birthStr) < 0) return '0 天'

  let years = t.year - b.year
  let months = t.month - b.month
  let days = t.day - b.day
  if (days < 0) {
    months -= 1
    days += daysInMonth(t.year, t.month - 1)
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

function daysInMonth(year, month) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

function addDays(dateStr, days) {
  const parts = parseDateParts(dateStr)
  if (!parts) return ''
  const ms = Date.UTC(parts.year, parts.month - 1, parts.day + days)
  return partsToDateStr(calendarPartsFromMs(ms))
}

function addMonths(dateStr, months) {
  const parts = parseDateParts(dateStr)
  if (!parts) return ''
  const ms = Date.UTC(parts.year, parts.month - 1 + months, parts.day)
  return partsToDateStr(calendarPartsFromMs(ms))
}

function compareDates(a, b) {
  const aMs = dateValueMs(a)
  const bMs = dateValueMs(b)
  if (aMs === null || bMs === null) return 0
  return aMs - bMs
}

function monthsBetween(startStr, endStr) {
  const s = parseDateParts(startStr)
  const e = parseDateParts(endStr || new Date())
  if (!s || !e || compareDates(endStr || new Date(), startStr) < 0) return 0
  let months = (e.year - s.year) * 12 + (e.month - s.month)
  if (e.day < s.day) months--
  return Math.max(0, months)
}

function toBeijingTimestamp(dateStr, timeStr) {
  if (!dateStr || !timeStr) return null
  const dateParts = parseDateParts(dateStr)
  const timeParts = timeStr.split(':')
  if (!dateParts || timeParts.length < 2) return null
  const hour = parseInt(timeParts[0], 10)
  const minute = parseInt(timeParts[1], 10)
  if (isNaN(hour) || isNaN(minute)) return null
  return Date.UTC(dateParts.year, dateParts.month - 1, dateParts.day, hour, minute, 0) - BEIJING_OFFSET_MS
}

function supplementReminder(birthStr, refStr) {
  const day = daysBetween(birthStr, refStr)
  if (day < 1) {
    return {
      day: 0,
      name: '',
      nextName: ''
    }
  }

  const name = day % 2 === 1 ? 'VD' : 'VAD'
  return {
    day,
    name,
    nextName: name === 'VD' ? 'VAD' : 'VD'
  }
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
  nowBeijingTimestamp,
  daysBetween,
  ageText,
  milestone,
  addDays,
  addMonths,
  compareDates,
  monthsBetween,
  toBeijingTimestamp,
  supplementReminder
}
