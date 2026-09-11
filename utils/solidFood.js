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
  if (!normalized || !normalized.solidFood) return null
  const foods = Array.isArray(selection.solidFoodFoods) ? selection.solidFoodFoods.slice() : []
  return { ...normalized, solidFoodFoods: normalized.solidFoodDishId ? [] : foods }
}

function getFrequentDishes(ageMonth) {
  return menuData.getDishCatalog({ ageMonth }).slice(0, 6)
}

// 与云函数 validation.normalizeFoods 同口径：去空、去重、最多 10 个
function normalizeFoods(foods) {
  if (!Array.isArray(foods)) return []
  const result = []
  foods.forEach(item => {
    const name = String(item || '').trim()
    if (name && !result.includes(name) && result.length < 10) result.push(name)
  })
  return result
}

// 一条辅食记录对应的规范试吃食材：菜库菜→配料表；自定义菜→保存时带的食材；手填名→按名字识别
function getCanonicalFoods({ dishId, name, foods, extraFoods }) {
  if (dishId) {
    const dish = menuData.getDishById(dishId)
    if (dish) return menuData.getDishFoods(dish)
  }
  if (Array.isArray(foods) && foods.length > 0) return foods.slice()
  return menuData.matchFoodsInName(name, extraFoods)
}

// 菜谱库文档 → 录入页可选项
function libraryDishesFromDocs(docs) {
  return (docs || []).filter(doc => doc && doc.name).map(doc => ({
    id: '',
    name: doc.name,
    imageEmoji: doc.imageEmoji || '🍱',
    foods: Array.isArray(doc.foods) && doc.foods.length ? doc.foods.slice() : (doc.ingredients || []).reduce((acc, ingredient) => {
      menuData.canonicalizeIngredient(ingredient).forEach(food => { if (!acc.includes(food)) acc.push(food) })
      return acc
    }, [])
  }))
}

// 本周菜单里家长自己写的菜，供录入页直接选
function customDishesFromPlan(plan) {
  const result = []
  ;((plan && plan.days) || []).forEach(day => {
    Object.keys(day.meals || {}).forEach(type => {
      ;(day.meals[type] || []).forEach(dish => {
        if (!dish || !dish.isCustom || !dish.name) return
        if (result.some(item => item.name === dish.name)) return
        const foods = []
        ;(dish.ingredients || []).forEach(ingredient => {
          menuData.canonicalizeIngredient(ingredient).forEach(food => {
            if (!foods.includes(food)) foods.push(food)
          })
        })
        result.push({ id: '', name: dish.name, imageEmoji: dish.imageEmoji || '🍱', foods })
      })
    })
  })
  return result
}

// 常吃列表：历史辅食按出现次数排序；本周自定义菜一定在列表里（同名历史条目沿用其排名、食材以本周为准），
// 不足 limit 个再用该月龄菜品目录补齐
function rankFrequentDishes({ records, ageMonth, limit, customDishes, libraryDishes }) {
  const max = limit || 6
  const counts = {}
  const order = []
  ;(records || []).forEach(record => {
    if (!record || !record.solidFood || !record.solidFoodDishName) return
    const key = record.solidFoodDishId || `custom:${record.solidFoodDishName}`
    if (!counts[key]) {
      counts[key] = { id: record.solidFoodDishId || '', name: record.solidFoodDishName, count: 0, foods: [], pinned: false }
      order.push(key)
    }
    counts[key].count += 1
    // 记录按时间升序，同名菜以最近一次的食材为准（菜谱改过名字没改时不沿用旧食材）
    if (Array.isArray(record.solidFoodFoods) && record.solidFoodFoods.length > 0) counts[key].foods = record.solidFoodFoods.slice()
  })
  ;(customDishes || []).forEach(dish => {
    if (!dish || !dish.name) return
    const key = `custom:${dish.name}`
    if (!counts[key]) {
      counts[key] = { id: '', name: dish.name, count: 0, foods: [], pinned: false }
      order.push(key)
    }
    counts[key].pinned = true
    counts[key].foods = (dish.foods || []).slice()
    counts[key].customEmoji = dish.imageEmoji || '🍱'
  })
  const entries = order.map(key => counts[key]).sort((left, right) => right.count - left.count)
  const pinned = entries.filter(item => item.pinned)
  const others = entries.filter(item => !item.pinned).slice(0, Math.max(0, max - Math.min(pinned.length, max)))
  const result = entries
    .filter(item => item.pinned || others.includes(item))
    .slice(0, max)
    .map(item => {
      const dish = item.id ? menuData.getDishById(item.id) : null
      return { id: item.id, name: item.name, imageEmoji: dish ? dish.imageEmoji : (item.customEmoji || '🍚'), foods: item.foods }
    })
  // 家庭菜谱库里的菜：历史和本周菜单里没出现过的，补在菜库菜之前
  ;(libraryDishes || []).forEach(dish => {
    if (!dish || !dish.name) return
    const same = result.find(item => item.name === dish.name)
    if (same) {
      // 同名历史条目（老记录可能没存食材）先回填，再考虑名额
      if (!same.foods || same.foods.length === 0) same.foods = (dish.foods || []).slice()
      return
    }
    if (result.length >= max) return
    result.push({ id: '', name: dish.name, imageEmoji: dish.imageEmoji || '🍱', foods: (dish.foods || []).slice() })
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
  rankFrequentDishes,
  getCanonicalFoods,
  customDishesFromPlan,
  libraryDishesFromDocs,
  normalizeFoods
}
