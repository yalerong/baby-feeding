const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const { normalizeSolidFood } = require('./validation.js')

exports.main = async (event) => {
  const { familyCode, date, time, breastMilk, formula, total, stool, stoolDesc, solidFood, solidFoodDishId, solidFoodDishName, solidFoodGrams, solidFoodFoods } = event
  const { OPENID } = cloud.getWXContext()

  if (!familyCode || !date || !time) {
    return { success: false, error: 'familyCode/date/time required' }
  }
  const normalizedSolidFood = normalizeSolidFood({ solidFood, solidFoodDishId, solidFoodDishName, solidFoodGrams, solidFoodFoods })
  if (!normalizedSolidFood) return { success: false, error: 'valid solid food name and grams required' }

  try {
    const res = await db.collection('feeding_records').add({
      data: {
        familyCode,
        date,
        time,
        breastMilk: Number(breastMilk) || 0,
        formula: Number(formula) || 0,
        total: Number(total) || 0,
        stool: Boolean(stool),
        stoolDesc: stoolDesc || '',
        ...normalizedSolidFood,
        createBy: OPENID || '',
        createTime: db.serverDate()
      }
    })
    return { success: true, _id: res._id }
  } catch (err) {
    console.error(err)
    return { success: false, error: err.message }
  }
}
