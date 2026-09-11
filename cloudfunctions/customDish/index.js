const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

// 家庭菜谱库：家长自己写的菜，跨周复用；周菜单、大厅、录入页常吃列表都从这里取
const MAX_ITEMS = 20

function cleanList(list, max) {
  if (!Array.isArray(list)) return []
  const result = []
  list.forEach(item => {
    const text = String(item || '').trim()
    if (text && !result.includes(text) && result.length < (max || MAX_ITEMS)) result.push(text)
  })
  return result
}

function normalizeDish(dish) {
  const source = dish || {}
  const name = String(source.name || '').trim().slice(0, 30)
  if (!name) return null
  return {
    name,
    ingredients: cleanList(source.ingredients),
    foods: cleanList(source.foods, 10),
    steps: cleanList(source.steps),
    cautions: cleanList(source.cautions),
    texture: String(source.texture || '').trim().slice(0, 30) || '按月龄处理',
    mealTypes: cleanList(source.mealTypes, 4).filter(type => ['breakfast', 'lunch', 'dinner', 'snack'].includes(type)),
    nutritionTags: cleanList(source.nutritionTags, 6),
    imageEmoji: String(source.imageEmoji || '🍱').slice(0, 4),
    color: /^#[0-9a-fA-F]{6}$/.test(String(source.color || '')) ? source.color : '#F3F0EA'
  }
}

exports.main = async event => {
  const { action, familyCode, _id } = event
  const { OPENID } = cloud.getWXContext()
  if (!familyCode) return { success: false, error: 'familyCode required' }

  try {
    if (action === 'list') {
      const res = await db.collection('custom_dishes').where({ familyCode }).orderBy('updateTime', 'desc').limit(200).get()
      return { success: true, data: res.data || [] }
    }

    if (action === 'save') {
      const dish = normalizeDish(event.dish)
      if (!dish) return { success: false, error: 'dish name required' }
      let existing = null
      if (_id) {
        const res = await db.collection('custom_dishes').doc(_id).get().catch(() => null)
        existing = res && res.data && res.data.familyCode === familyCode ? res.data : null
      }
      if (!existing) {
        const res = await db.collection('custom_dishes').where({ familyCode, name: dish.name }).limit(1).get()
        existing = res.data && res.data[0]
      }
      const payload = { ...dish, familyCode, updateBy: OPENID || '', updateTime: db.serverDate() }
      if (existing) {
        await db.collection('custom_dishes').doc(existing._id).update({ data: payload })
        return { success: true, _id: existing._id }
      }
      const res = await db.collection('custom_dishes').add({ data: { ...payload, createBy: OPENID || '', createTime: db.serverDate() } })
      return { success: true, _id: res._id }
    }

    if (action === 'remove') {
      if (!_id) return { success: false, error: '_id required' }
      const res = await db.collection('custom_dishes').doc(_id).get().catch(() => null)
      if (!res || !res.data) return { success: true }
      if (res.data.familyCode !== familyCode) return { success: false, error: 'familyCode mismatch' }
      await db.collection('custom_dishes').doc(_id).remove()
      return { success: true }
    }

    return { success: false, error: 'unknown action' }
  } catch (err) {
    console.error(err)
    return { success: false, error: err.message }
  }
}
