const PAGE_SIZE = 100

async function fetchAllRecords(collection, conditions) {
  const records = []
  let skip = 0
  while (true) {
    const res = await collection
      .where(conditions)
      .orderBy('date', 'asc')
      .orderBy('time', 'asc')
      .skip(skip)
      .limit(PAGE_SIZE)
      .get()
    const batch = res.data || []
    records.push(...batch)
    if (batch.length < PAGE_SIZE) return records
    skip += PAGE_SIZE
  }
}

module.exports = { fetchAllRecords }
