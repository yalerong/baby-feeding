// 离线修复导出数据；仅生成选中食材的修复文件，不连接或写入云数据库。
const fs = require('fs')
const path = require('path')
const dateUtil = require('../utils/date.js')
const solidFood = require('../utils/solidFood.js')
const { seedLogDates } = require('../cloudfunctions/foodTrial/trialState.js')

function repairTrials(records, trials, foodNames, alreadyUnlocked = [], registrationDate = dateUtil.todayStr()) {
  const selected = new Set(foodNames.concat(alreadyUnlocked))
  const keys = new Set()
  const repaired = []
  const extraFoods = trials.map(trial => trial.foodName)
  trials.filter(trial => selected.has(trial.foodName)).forEach(trial => {
    if (!trial._id || !trial.familyCode) throw new Error('修复条目缺少 _id 或 familyCode')
    const key = JSON.stringify([trial.familyCode, trial.foodName])
    if (keys.has(key)) throw new Error(`重复试吃文档：${trial.foodName}`)
    keys.add(key)
    if (trial.status === 'allergic') {
      if (alreadyUnlocked.includes(trial.foodName)) throw new Error(`${trial.foodName} 已标记疑似过敏，不能补登记解锁`)
      return
    }
    if (Number(trial.trialCount) >= 3 || trial.status === 'unlocked') return
    if (alreadyUnlocked.includes(trial.foodName)) {
      repaired.push({ ...trial, trialCount: 3, status: 'unlocked', manuallyUnlocked: true, unlockedDate: registrationDate })
      return
    }
    if (!trial.lastTriedDate) return
    const previousDates = seedLogDates(trial)
    const sources = { ...(trial.logSources || {}) }
    if (trial.lastLogRecordId && !sources[trial.lastTriedDate]) sources[trial.lastTriedDate] = trial.lastLogRecordId
    const dates = new Set(previousDates)
    records.forEach(record => {
      if (!record.solidFood || !record._id || record.familyCode !== trial.familyCode || record.date > trial.lastTriedDate) return
      const foods = solidFood.getCanonicalFoods({
        dishId: record.solidFoodDishId, name: record.solidFoodDishName, foods: record.solidFoodFoods, extraFoods
      })
      if (!foods.includes(trial.foodName)) return
      dates.add(record.date)
      // 已有手动打卡继续保持手动来源；只给新补回的日期挂喂养记录。
      if (!previousDates.includes(record.date) && !sources[record.date]) sources[record.date] = record._id
    })
    const logDates = []
    let cursor = trial.lastTriedDate
    while (dates.has(cursor) && logDates.length < 3) {
      logDates.unshift(cursor)
      cursor = dateUtil.addDays(cursor, -1)
    }
    if (logDates.length <= Number(trial.trialCount)) return
    const logSources = {}
    logDates.forEach(day => { if (sources[day]) logSources[day] = sources[day] })
    repaired.push({
      ...trial, trialCount: logDates.length, status: logDates.length >= 3 ? 'unlocked' : 'tracking',
      logDates, logSources, lastLogRecordId: logSources[trial.lastTriedDate] || ''
    })
  })
  selected.forEach(name => {
    if (!trials.some(trial => trial.foodName === name)) throw new Error(`导出数据中没有食材：${name}`)
  })
  return repaired
}

function readExport(file) {
  const text = fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '').trim()
  if (!text) return []
  const rows = text.startsWith('[') ? JSON.parse(text) : text.split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line))
  if (!Array.isArray(rows)) throw new Error('导出数据须为 JSON 数组或每行一个文档的 JSONL')
  return rows
}

if (require.main === module) {
  try {
    const [recordsFile, trialsFile, outputDir, ...args] = process.argv.slice(2)
    if (!recordsFile || !trialsFile || !outputDir || !args.length) throw new Error('用法：node scripts/repairFoodTrials.js 喂养导出 试吃导出 输出目录 --food 食材 --unlocked 已试吃通过的食材')
    const foodNames = [], alreadyUnlocked = []
    for (let i = 0; i < args.length; i += 2) {
      if (!['--food', '--unlocked'].includes(args[i]) || !args[i + 1] || args[i + 1].startsWith('--')) throw new Error('仅支持成对的 --food 食材 / --unlocked 食材')
      ;(args[i] === '--food' ? foodNames : alreadyUnlocked).push(args[i + 1])
    }
    const trials = readExport(trialsFile)
    const repaired = repairTrials(readExport(recordsFile), trials, foodNames, alreadyUnlocked)
    const originals = trials.filter(trial => repaired.some(next => next._id === trial._id))
    const files = {
      'food_trials-repaired.jsonl': repaired.map(row => JSON.stringify(row)).join('\n') + '\n',
      'food_trials-original.jsonl': originals.map(row => JSON.stringify(row)).join('\n') + '\n',
      'food_trials-repair-plan.json': JSON.stringify(repaired.map(next => ({
        _id: next._id, foodName: next.foodName,
        before: originals.find(trial => trial._id === next._id), after: next
      })), null, 2) + '\n'
    }
    if (Object.keys(files).some(name => fs.existsSync(path.join(outputDir, name)))) throw new Error('输出文件已存在，请使用新的输出目录')
    fs.mkdirSync(outputDir, { recursive: true })
    Object.entries(files).forEach(([name, text]) => fs.writeFileSync(path.join(outputDir, name), text, { flag: 'wx' }))
    console.log(`已生成 ${repaired.length} 项修复和原始备份；未写入云数据库。`)
    repaired.forEach(trial => console.log(`${trial.foodName}：${trial.trialCount}/3，${trial.status}`))
  } catch (err) {
    console.error(err.message)
    process.exitCode = 1
  }
}

module.exports = { repairTrials, readExport }
