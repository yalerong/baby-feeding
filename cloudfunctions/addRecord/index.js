const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const { normalizeSolidFood, normalizeImages } = require('./validation.js')
const { normalizeMilk } = require('./milkValidation.js')

exports.main = async (event) => {
  const { familyCode, date, time, breastMilk, formula, stool, stoolDesc, solidFood, solidFoodDishId, solidFoodDishName, solidFoodGrams, solidFoodFoods, images } = event
  const { OPENID } = cloud.getWXContext()

  if (!familyCode || !date || !time) {
    return { success: false, error: 'familyCode/date/time required' }
  }
  const milk = normalizeMilk({ breastMilk, formula })
  if (!milk) return { success: false, error: 'finite non-negative milk quantities required' }
  const normalizedSolidFood = normalizeSolidFood({ solidFood, solidFoodDishId, solidFoodDishName, solidFoodGrams, solidFoodFoods })
  if (!normalizedSolidFood) return { success: false, error: 'valid solid food name and grams required' }

  try {
    const res = await db.collection('feeding_records').add({
      data: {
        familyCode,
        date,
        time,
        ...milk,
        stool: Boolean(stool),
        stoolDesc: stoolDesc || '',
        ...normalizedSolidFood,
        images: normalizeImages(images),
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
