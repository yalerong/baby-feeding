// 疫苗计划表：vaccine 与 vaccineEdit 两页共用，改动只需改这里
const VACCINE_SCHEDULES = [
  { name: '乙肝疫苗', category: '一类', doses: [{ dose: 1, minAgeMonth: 0, intervalDays: 0 }, { dose: 2, minAgeMonth: 1, intervalDays: 28 }, { dose: 3, minAgeMonth: 6, intervalDays: 60 }] },
  { name: '卡介苗', category: '一类', doses: [{ dose: 1, minAgeMonth: 0, intervalDays: 0 }] },
  { name: '脊灰灭活疫苗(IPV)', category: '一类', doses: [{ dose: 1, minAgeMonth: 2, intervalDays: 0 }, { dose: 2, minAgeMonth: 3, intervalDays: 28 }] },
  { name: '百白破疫苗', category: '一类', doses: [{ dose: 1, minAgeMonth: 3, intervalDays: 0 }, { dose: 2, minAgeMonth: 4, intervalDays: 28 }, { dose: 3, minAgeMonth: 5, intervalDays: 28 }, { dose: 4, minAgeMonth: 18, intervalDays: 180 }] },
  { name: '麻腮风疫苗', category: '一类', doses: [{ dose: 1, minAgeMonth: 8, intervalDays: 0 }, { dose: 2, minAgeMonth: 18, intervalDays: 180 }] },
  { name: '乙脑减毒活疫苗', category: '一类', doses: [{ dose: 1, minAgeMonth: 8, intervalDays: 0 }, { dose: 2, minAgeMonth: 24, intervalDays: 365 }] },
  { name: '甲肝灭活疫苗', category: '一类', doses: [{ dose: 1, minAgeMonth: 18, intervalDays: 0 }, { dose: 2, minAgeMonth: 24, intervalDays: 180 }] },
  { name: '五联疫苗', category: '二类', doses: [{ dose: 1, minAgeMonth: 2, intervalDays: 0 }, { dose: 2, minAgeMonth: 3, intervalDays: 28 }, { dose: 3, minAgeMonth: 4, intervalDays: 28 }, { dose: 4, minAgeMonth: 18, intervalDays: 180 }] },
  { name: '13价肺炎疫苗', category: '二类', doses: [{ dose: 1, minAgeMonth: 2, intervalDays: 0 }, { dose: 2, minAgeMonth: 4, intervalDays: 56 }, { dose: 3, minAgeMonth: 6, intervalDays: 56 }, { dose: 4, minAgeMonth: 12, intervalDays: 180 }] },
  { name: '轮状病毒疫苗', category: '二类', doses: [{ dose: 1, minAgeMonth: 2, intervalDays: 0 }, { dose: 2, minAgeMonth: 4, intervalDays: 28 }, { dose: 3, minAgeMonth: 6, intervalDays: 28 }] },
  { name: '水痘疫苗', category: '二类', doses: [{ dose: 1, minAgeMonth: 12, intervalDays: 0 }, { dose: 2, minAgeMonth: 48, intervalDays: 90 }] },
  { name: '流感疫苗', category: '二类', doses: [{ dose: 1, minAgeMonth: 6, intervalDays: 0 }, { dose: 2, minAgeMonth: 7, intervalDays: 28 }] },
  { name: '手足口疫苗(EV71)', category: '二类', doses: [{ dose: 1, minAgeMonth: 6, intervalDays: 0 }, { dose: 2, minAgeMonth: 7, intervalDays: 28 }] },
  { name: '流脑AC结合疫苗', category: '二类', doses: [{ dose: 1, minAgeMonth: 6, intervalDays: 0 }, { dose: 2, minAgeMonth: 9, intervalDays: 90 }] },
  { name: 'Hib疫苗', category: '二类', doses: [{ dose: 1, minAgeMonth: 2, intervalDays: 0 }, { dose: 2, minAgeMonth: 3, intervalDays: 28 }, { dose: 3, minAgeMonth: 4, intervalDays: 28 }, { dose: 4, minAgeMonth: 18, intervalDays: 180 }] }
]

module.exports = VACCINE_SCHEDULES
