async function removeAllForFamily(collection, familyCode, pageSize) {
  let count = 0
  while (true) {
    const res = await collection.where({ familyCode }).limit(pageSize).get()
    const list = res.data || []
    if (list.length === 0) return count
    await Promise.all(list.map(r => collection.doc(r._id).remove()))
    count += list.length
    if (list.length < pageSize) return count
  }
}

module.exports = {
  removeAllForFamily
}
