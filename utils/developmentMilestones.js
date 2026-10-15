// CDC 清单中文整理，核对于 2026-10-14。id 用于保存记录，请保持稳定。
const CHECKLISTS = {
  6: [
    { id: 'social', title: '社交与情绪', items: [
      { id: '6-social-1', title: '认出熟悉的人', tip: '看到熟悉的照顾者时，留意宝宝的表情和反应。' },
      { id: '6-social-2', title: '喜欢看镜子里的自己', tip: '陪宝宝看安全的婴儿镜，观察是否感兴趣。' },
      { id: '6-social-3', title: '会笑出声', tip: '在宝宝喜欢的互动中，留意是否有笑声。' }
    ] },
    { id: 'language', title: '语言与交流', items: [
      { id: '6-language-1', title: '和你轮流发声音', tip: '模仿宝宝的声音后停一下，观察宝宝是否接着发声。' },
      { id: '6-language-2', title: '会吐舌头吹气、发出噗噗声', tip: '留意自然玩耍时的吐舌吹气声。' },
      { id: '6-language-3', title: '会发出尖亮的声音', tip: '留意兴奋玩耍时的高音发声。' }
    ] },
    { id: 'cognitive', title: '认知与探索', items: [
      { id: '6-cognitive-1', title: '把东西放进嘴里探索', tip: '使用适龄、无小零件的安全玩具，在成人看护下观察。' },
      { id: '6-cognitive-2', title: '伸手抓想要的玩具', tip: '把喜欢的玩具放在容易够到的位置。' },
      { id: '6-cognitive-3', title: '不想继续吃时会闭嘴', tip: '自然进食时观察，不为检查而多喂或强喂。' }
    ] },
    { id: 'motor', title: '动作发展', items: [
      { id: '6-motor-1', title: '从趴着翻成仰卧', tip: '在安全地垫上看护，留意翻身的具体方向。' },
      { id: '6-motor-2', title: '趴着时能伸直手臂撑起身体', tip: '宝宝清醒、舒服时，在地垫上观察。' },
      { id: '6-motor-3', title: '坐着时用手撑住身体', tip: '成人近身扶护，留意宝宝是否用手支撑；疲倦就换姿势。' }
    ] }
  ],
  9: [
    { id: 'social', title: '社交与情绪', items: [
      { id: '9-social-1', title: '遇到陌生人时害羞、黏人或害怕', tip: '留意自然见面时的反应，不刻意让宝宝受惊。' },
      { id: '9-social-2', title: '有多种面部表情', tip: '例如高兴、难过、生气或惊讶时的表情。' },
      { id: '9-social-3', title: '叫名字时会看过来', tip: '在安静环境、宝宝没专注别的事时，轻声叫名字。' },
      { id: '9-social-4', title: '你离开时会有反应', tip: '例如看着你、伸手或哭；留意日常情境即可。' },
      { id: '9-social-5', title: '玩躲猫猫时会微笑或笑出声', tip: '用自己的脸和手互动，留意宝宝是否享受。' }
    ] },
    { id: 'language', title: '语言与交流', items: [
      { id: '9-language-1', title: '发出多种连续声音', tip: '例如 mamamama、babababa；此处不要求有意义地叫爸妈。' },
      { id: '9-language-2', title: '抬起双臂表示想被抱', tip: '在自然抱起前，留意宝宝是否主动伸出双臂。' }
    ] },
    { id: 'cognitive', title: '认知与探索', items: [
      { id: '9-cognitive-1', title: '寻找掉到视线外的东西', tip: '例如玩具掉下后，会往掉落方向寻找。' },
      { id: '9-cognitive-2', title: '把两个东西相互敲击', tip: '提供轻便、适龄的安全玩具，在看护下观察。' }
    ] },
    { id: 'motor', title: '动作发展', items: [
      { id: '9-motor-1', title: '自己变换到坐姿', tip: '观察宝宝是否自己进入坐姿，成人放好坐姿属于不同情况。' },
      { id: '9-motor-2', title: '把东西从一只手换到另一只手', tip: '递一个轻便玩具，留意玩耍中是否自然换手。' },
      { id: '9-motor-3', title: '用手指耙拢食物', tip: '仅在适龄安全食物、坐姿有支撑和成人全程看护的进食中观察。' },
      { id: '9-motor-4', title: '无需支撑也能坐着', tip: '在地面近身保护，留意是否需要手或成人持续支撑。' }
    ] }
  ]
}

const STATUS_OPTIONS = [
  { value: 'yes', label: '已观察到' },
  { value: 'notYet', label: '还没观察到' },
  { value: 'unsure', label: '不确定' }
]

// 依据 CDC 同月龄的亲子活动建议，匹配规则只使用月龄和观察状态。
const ACTIVITIES = {
  6: [
    { id: 'sounds', milestoneId: '6-language-1', title: '表情和声音接龙', text: '面对面回应宝宝的笑和声音，模仿后停一下，等宝宝用目光、表情或声音接着回应。' },
    { id: 'rolling', milestoneId: '6-motor-1', title: '地垫上找玩具', text: '宝宝清醒舒服时，在地面活动垫上把玩具放在身体侧边、接近能拿到的位置，近身看护，让宝宝自由尝试转身。' },
    { id: 'reaching', milestoneId: '6-cognitive-2', title: '伸手拿喜欢的玩具', text: '宝宝仰卧或趴着时，递一个轻便、适龄且无小零件的玩具，观察他如何伸手和抓握。' }
  ],
  9: [
    { id: 'sounds', milestoneId: '9-language-1', title: '你说一句，我接一句', text: '模仿宝宝自然发出的连续声音，再说简单的话，留出等待和回应的时间。' },
    { id: 'peekaboo', milestoneId: '9-social-5', title: '面对面躲猫猫', text: '用自己的双手遮住自己的脸，再露出来和宝宝互动，观察宝宝的表情和声音。' },
    { id: 'passing', milestoneId: '9-motor-2', title: '轮流传玩具', text: '在安全地垫上和宝宝来回递轻便、无小零件的玩具，留意玩耍中是否出现换手。坐着玩时按需扶护。' }
  ]
}

function getReferenceMonth(ageMonths) {
  return ageMonths >= 9 ? 9 : 6
}

function buildChecklist(month, records) {
  const groups = (CHECKLISTS[month] || []).map(group => ({
    ...group,
    items: group.items.map(item => {
      const record = (records || []).find(row => row.milestoneId === item.id)
      const option = record && STATUS_OPTIONS.find(value => value.value === record.status)
      return {
        ...item,
        status: option ? option.value : '',
        statusLabel: option ? option.label : '未记录',
        note: option ? record.note || '' : '',
        observedDate: option ? record.observedDate || '' : ''
      }
    })
  }))
  const items = groups.reduce((all, group) => all.concat(group.items), [])
  return { groups, total: items.length, recordedCount: items.filter(item => item.status).length }
}

function getActivities(ageMonths, month, records) {
  if (ageMonths === null || ageMonths < 6 || ageMonths >= 12 || month !== getReferenceMonth(ageMonths)) return []
  const items = buildChecklist(month, records).groups.reduce((all, group) => all.concat(group.items), [])
  const priority = { unsure: 0, notYet: 0, '': 1, yes: 2 }
  return ACTIVITIES[month].map((activity, index) => {
    const item = items.find(row => row.id === activity.milestoneId)
    const reason = item.status === 'yes' ? '已观察到这项表现，可以继续玩熟悉的游戏。'
      : item.status === 'unsure' ? '这项还不确定，可以在自然互动中继续观察。'
        : item.status === 'notYet' ? '这项尚未观察到，可在陪玩中留意，并和儿保医生沟通。'
          : '这项还未记录，可以从宝宝感兴趣的互动开始观察。'
    return { ...activity, targetTitle: item.title, reason, priority: priority[item.status], order: index }
  }).sort((a, b) => a.priority - b.priority || a.order - b.order).slice(0, 2)
}

function buildObservationSummary(month, records, options) {
  const checklist = buildChecklist(month, records)
  const lines = [
    '宝宝发育观察摘要（家长记录）',
    `整理日期：${options.today}`, `宝宝月龄：${options.ageText || '未设置生日'}`,
    `参考清单：${month}个月 · 已记录 ${checklist.recordedCount}/${checklist.total} 项`,
    options.stageHint, ''
  ]
  checklist.groups.forEach(group => {
    lines.push(`【${group.title}】`)
    group.items.forEach(item => {
      lines.push(`- ${item.title}：${item.statusLabel}${item.observedDate ? '（观察日期 ' + item.observedDate + '）' : ''}`)
      if (item.note) lines.push(`  备注：${item.note}`)
    })
    lines.push('')
  })
  lines.push('本摘要用于儿保沟通，不能替代专业发育筛查。',
    `来源：https://www.cdc.gov/act-early/digital-online-checklist/${month}-months.html`)
  return lines.join('\n')
}

module.exports = { CHECKLISTS, STATUS_OPTIONS, getReferenceMonth, buildChecklist, getActivities, buildObservationSummary }
