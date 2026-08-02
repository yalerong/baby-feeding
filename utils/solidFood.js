const menuData = require('./menuData.js')

function normalize({ enabled, dishId, customName, grams }) {
  if (!enabled) {
    return {
      solidFood: false,
      solidFoodDishId: '',
      solidFoodDishName: '',
      solidFoodGrams: 0
    }
  }

  const amount = Number(grams)
  if (!Number.isFinite(amount) || amount <= 0) return null

  const dish = menuData.getDishById(dishId)
  const name = dish ? dish.name : String(customName || '').trim()
  if (!name) return null

  return {
    solidFood: true,
    solidFoodDishId: dish ? dish.id : '',
    solidFoodDishName: name,
    solidFoodGrams: amount
  }
}

function restoreLastSelection(selection) {
  if (!selection) return null
  const normalized = normalize({
    enabled: true,
    dishId: selection.dishId,
    customName: selection.name,
    grams: selection.grams
  })
  return normalized && normalized.solidFood ? normalized : null
}

function getFrequentDishes(ageMonth) {
  return menuData.getDishCatalog({ ageMonth }).slice(0, 6)
}

module.exports = {
  normalize,
  restoreLastSelection,
  getFrequentDishes
}
