function normalizeSolidFood({ solidFood, solidFoodDishId, solidFoodDishName, solidFoodGrams }) {
  if (!solidFood) {
    return { solidFood: false, solidFoodDishId: '', solidFoodDishName: '', solidFoodGrams: 0 }
  }
  const amount = Number(solidFoodGrams)
  const name = String(solidFoodDishName || '').trim()
  if (!name || !Number.isFinite(amount) || amount <= 0) return null
  return {
    solidFood: true,
    solidFoodDishId: String(solidFoodDishId || '').trim(),
    solidFoodDishName: name,
    solidFoodGrams: amount
  }
}

module.exports = { normalizeSolidFood }
