const cloud = require('wx-server-sdk')
const crypto = require('crypto')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

// 同一家庭同名菜固定一个 _id，两位家长同时新建同名菜时后到的会撞主键，然后改走更新
function dishDocumentId(familyCode, name) {
  return `dish_${crypto.createHash('sha256').update(`${familyCode}\u0000${name}`).digest('hex')}`
}

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
      if (existing && existing.name !== dish.name) {
        // 按 _id 改名：目标名字已经是另一道菜就拒绝，保持"同一家庭菜名唯一"
        const clash = await db.collection('custom_dishes').where({ familyCode, name: dish.name }).limit(1).get()
        if (clash.data && clash.data[0] && clash.data[0]._id !== existing._id) {
          return { success: false, error: `菜谱库里已经有一道“${dish.name}”，换个名字` }
        }
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
      const documentId = dishDocumentId(familyCode, dish.name)
      try {
        await db.collection('custom_dishes').add({ data: { _id: documentId, ...payload, createBy: OPENID || '', createTime: db.serverDate() } })
        return { success: true, _id: documentId }
      } catch (err) {
        const raced = await db.collection('custom_dishes').where({ _id: documentId, familyCode }).limit(1).get()
        const doc = raced.data && raced.data[0]
        if (!doc) throw err
        if (doc.name === dish.name) {
          // 主键冲突且同名：别人刚建了同名菜，在它之上更新
          await db.collection('custom_dishes').doc(documentId).update({ data: payload })
          return { success: true, _id: documentId }
        }
        // 占着这个 _id 的是一道改过名的菜：另起随机 _id，不能覆盖它
        const res = await db.collection('custom_dishes').add({ data: { ...payload, createBy: OPENID || '', createTime: db.serverDate() } })
        return { success: true, _id: res._id }
      }
    }

    if (action === 'remove') {
      if (!_id) return { success: false, error: '_id required' }
      // 用 where 查：不存在返回空数组，真正的查询错误会抛到外层
      const res = await db.collection('custom_dishes').where({ _id }).limit(1).get()
      const doc = res.data && res.data[0]
      if (!doc) return { success: true, missing: true }
      if (doc.familyCode !== familyCode) return { success: false, error: 'familyCode mismatch' }
      await db.collection('custom_dishes').doc(_id).remove()
      return { success: true }
    }

    return { success: false, error: 'unknown action' }
  } catch (err) {
    console.error(err)
    return { success: false, error: err.message }
  }
}
