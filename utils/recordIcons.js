function recordIcons(record) {
  const icons = []
  if ((Number(record.breastMilk) || 0) + (Number(record.formula) || 0) > 0) icons.push('🍼')
  if (record.solidFood) icons.push('🍚')
  if (record.stool) icons.push('💩')
  return icons.length ? icons : ['📝']
}

module.exports = { recordIcons }
