function normalizeMilk({ breastMilk, formula }) {
  const quantity = value => value == null || value === '' ? 0
    : typeof value === 'number' || typeof value === 'string' ? Number(value) : NaN
  const breast = quantity(breastMilk)
  const powder = quantity(formula)
  const total = breast + powder
  if (!Number.isFinite(breast) || breast < 0 || !Number.isFinite(powder) || powder < 0 || !Number.isFinite(total)) return null
  return { breastMilk: breast, formula: powder, total }
}

module.exports = { normalizeMilk }
