const assert = require('assert')
const fs = require('fs')
const path = require('path')
const milestones = require('../utils/developmentMilestones.js')
const dateUtil = require('../utils/date.js')

const six = milestones.buildChecklist(6, [])
const nine = milestones.buildChecklist(9, [])
assert.strictEqual(six.total, 12)
assert.strictEqual(nine.total, 13)
const allItems = six.groups.concat(nine.groups).flatMap(group => group.items)
assert.strictEqual(new Set(allItems.map(item => item.id)).size, 25)
assert.ok(allItems.every(item => item.status === '' && item.statusLabel === '未记录'))
assert.strictEqual(six.recordedCount, 0)
console.log('ok - CDC six/nine month checklists contain 25 unique items with no prefilled observations')

const observed = milestones.buildChecklist(6, [
  { milestoneId: '6-cognitive-2', status: 'yes', observedDate: '2026-10-14', note: '主动抓摇铃' },
  { milestoneId: '6-language-1', status: 'unsure', observedDate: '2026-10-14', note: '有发声，还需观察是否轮流' },
  { milestoneId: '6-motor-3', status: 'notYet', observedDate: '2026-10-14' },
  { milestoneId: '9-motor-4', status: 'yes', observedDate: '2026-10-14' },
  { milestoneId: '6-social-1', status: 'invalid', note: '无效数据不算已记录' }
])
assert.strictEqual(observed.recordedCount, 3)
const grab = observed.groups.flatMap(group => group.items).find(item => item.id === '6-cognitive-2')
assert.strictEqual(grab.note, '主动抓摇铃')
assert.strictEqual(grab.observedDate, '2026-10-14')
assert.strictEqual(six.recordedCount, 0)
assert.strictEqual(milestones.CHECKLISTS[6][2].items[1].status, undefined)
console.log('ok - progress counts recorded observations of all statuses, scopes by stage and preserves the source catalog')

assert.strictEqual(milestones.getReferenceMonth(dateUtil.monthsBetween('2026-02-24', '2026-10-14')), 6)
assert.strictEqual(milestones.getReferenceMonth(dateUtil.monthsBetween('2026-02-24', '2026-11-23')), 6)
assert.strictEqual(milestones.getReferenceMonth(dateUtil.monthsBetween('2026-02-24', '2026-11-24')), 9)
assert.strictEqual(milestones.getReferenceMonth(null), 6)
console.log('ok - seven/eight month babies review the six month stage and switch at nine completed months')

assert.deepStrictEqual(milestones.getActivities(7, 9, []), [])
assert.deepStrictEqual(milestones.getActivities(5, 6, []), [])
assert.deepStrictEqual(milestones.getActivities(12, 9, []), [])
assert.deepStrictEqual(milestones.getActivities(null, 6, []), [])
const activities = milestones.getActivities(7, 6, [
  { milestoneId: '6-language-1', status: 'yes' },
  { milestoneId: '6-motor-1', status: 'yes' },
  { milestoneId: '6-cognitive-2', status: 'unsure' }
])
assert.strictEqual(activities.length, 2)
assert.strictEqual(activities[0].milestoneId, '6-cognitive-2')
assert.match(activities[0].reason, /不确定/)
assert.ok(milestones.getActivities(9, 9, []).every(activity => activity.milestoneId.startsWith('9-')))
console.log('ok - activity matching responds to observations and never recommends next-stage play during a preview')

const summary = milestones.buildObservationSummary(6, [
  { milestoneId: '6-language-1', status: 'unsure', note: '只听到一次', observedDate: '2026-10-14' }
], { today: '2026-10-14', ageText: '7个月', stageHint: '当前参考6个月' })
assert.match(summary, /已记录 1\/12 项/)
assert.match(summary, /和你轮流发声音：不确定（观察日期 2026-10-14）/)
assert.match(summary, /认出熟悉的人：未记录/)
assert.match(summary, /备注：只听到一次/)
assert.match(summary, /6-months\.html/)
assert.doesNotMatch(summary, /首次达成|发育年龄/)
console.log('ok - care-visit summaries preserve uncertainty, missing observations, dates, notes and sources')

let page
global.Page = config => { page = config }
require('../pages/milestones/milestones.js')
const wxml = fs.readFileSync(path.join(__dirname, '../pages/milestones/milestones.wxml'), 'utf8')
const handlers = [...wxml.matchAll(/(?:bind|catch)(?:tap|input|change)="([A-Za-z]+)"/g)].map(match => match[1])
handlers.forEach(name => assert.strictEqual(typeof page[name], 'function', `missing handler ${name}`))
const app = JSON.parse(fs.readFileSync(path.join(__dirname, '../app.json'), 'utf8'))
assert.ok(app.pages.includes('pages/milestones/milestones'))
assert.strictEqual(app.tabBar.list.length, 5)
console.log('ok - milestone route and all page event handlers are wired without adding a sixth tab')
