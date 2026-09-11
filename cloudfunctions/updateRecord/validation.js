// solidFoodFoods：自定义菜保存时带上的规范食材名（如 ['胡萝卜','土豆']），供试吃打卡与回退使用；菜库菜不需要
function normalizeFoods(foods) {
  if (!Array.isArray(foods)) return []
  const result = []
  foods.forEach(item => {
    const name = String(item || '').trim()
    if (name && !result.includes(name) && result.length < 10) result.push(name)
  })
  return result
}

function normalizeSolidFood({ solidFood, solidFoodDishId, solidFoodDishName, solidFoodGrams, solidFoodFoods }) {
  if (!solidFood) {
    return { solidFood: false, solidFoodDishId: '', solidFoodDishName: '', solidFoodGrams: 0, solidFoodFoods: [] }
  }
  const amount = Number(solidFoodGrams)
  const name = String(solidFoodDishName || '').trim()
  if (!name || !Number.isFinite(amount) || amount <= 0) return null
  return {
    solidFood: true,
    solidFoodDishId: String(solidFoodDishId || '').trim(),
    solidFoodDishName: name,
    solidFoodGrams: amount,
    solidFoodFoods: normalizeFoods(solidFoodFoods)
  }
}

module.exports = { normalizeSolidFood }
