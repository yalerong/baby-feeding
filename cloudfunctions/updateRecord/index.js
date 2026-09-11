const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const { normalizeSolidFood, normalizeImages } = require('./validation.js')

exports.main = async (event) => {
  const { _id, familyCode, date, time, breastMilk, formula, total, stool, stoolDesc, solidFood, solidFoodDishId, solidFoodDishName, solidFoodGrams, solidFoodFoods, images } = event
  const { OPENID } = cloud.getWXContext()

  if (!_id || !familyCode) {
    return { success: false, error: '_id/familyCode required' }
  }
  const normalizedSolidFood = normalizeSolidFood({ solidFood, solidFoodDishId, solidFoodDishName, solidFoodGrams, solidFoodFoods })
  if (!normalizedSolidFood) return { success: false, error: 'valid solid food name and grams required' }

  try {
    const existing = await db.collection('feeding_records').doc(_id).get().catch(() => null)
    if (!existing || !existing.data) {
      return { success: false, error: 'record not found' }
    }
    if (existing.data.familyCode !== familyCode) {
      return { success: false, error: 'familyCode mismatch' }
    }

    const res = await db.collection('feeding_records').doc(_id).update({
      data: {
        date,
        time,
        breastMilk: Number(breastMilk) || 0,
        formula: Number(formula) || 0,
        total: Number(total) || 0,
        stool: Boolean(stool),
        stoolDesc: stoolDesc || '',
        ...normalizedSolidFood,
        images: normalizeImages(images),
        updateBy: OPENID || '',
        updateTime: db.serverDate()
      }
    })
    return { success: true, stats: res.stats }
  } catch (err) {
    console.error(err)
    return { success: false, error: err.message }
  }
}
