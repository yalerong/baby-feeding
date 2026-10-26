// 草稿和跳转快照共用家庭命名空间；不自动认领无法确认归属的旧格式数据。
function draftKey(familyCode, weekStart) {
  return `menuDraft:v2:${encodeURIComponent(familyCode)}:${weekStart}`
}

function planKey(familyCode, weekStart) {
  return `menuPlanCache:v2:${encodeURIComponent(familyCode)}:${weekStart}`
}

module.exports = { draftKey, planKey }
