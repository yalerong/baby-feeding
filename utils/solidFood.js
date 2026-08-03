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

// 按历史辅食记录出现次数排序（含自定义辅食），不足 6 个再用该月龄菜品目录补齐
function rankFrequentDishes({ records, ageMonth, limit }) {
  const max = limit || 6
  const counts = {}
  const order = []
  ;(records || []).forEach(record => {
    if (!record || !record.solidFood || !record.solidFoodDishName) return
    const key = record.solidFoodDishId || `custom:${record.solidFoodDishName}`
    if (!counts[key]) {
      counts[key] = { id: record.solidFoodDishId || '', name: record.solidFoodDishName, count: 0 }
      order.push(key)
    }
    counts[key].count += 1
  })
  const result = order
    .map(key => counts[key])
    .sort((left, right) => right.count - left.count)
    .slice(0, max)
    .map(item => {
      const dish = item.id ? menuData.getDishById(item.id) : null
      return { id: item.id, name: item.name, imageEmoji: dish ? dish.imageEmoji : '🍚' }
    })
  if (result.length < max) {
    menuData.getDishCatalog({ ageMonth }).forEach(dish => {
      if (result.length >= max) return
      if (result.some(item => item.id === dish.id || item.name === dish.name)) return
      result.push({ id: dish.id, name: dish.name, imageEmoji: dish.imageEmoji })
    })
  }
  return result
}

module.exports = {
  normalize,
  restoreLastSelection,
  getFrequentDishes,
  rankFrequentDishes
}
