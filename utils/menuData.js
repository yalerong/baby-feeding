const dateUtil = require('./date.js')

const MEAL_TYPES = ['breakfast', 'lunch', 'dinner', 'snack']

// 辅食尝试期：满 6 月龄起前 14 天只安排高铁米粉糊，每天一餐
const TRIAL_PERIOD_DAYS = 14
const IRON_CEREAL_ID = 'iron-rice-cereal'

const MEAL_LABELS = {
  breakfast: '早餐',
  lunch: '午餐',
  dinner: '晚餐',
  snack: '加餐'
}

const AGE_MEAL_TYPES = [
  { min: 6, max: 6, meals: ['lunch', 'dinner'] },
  { min: 7, max: 8, meals: ['breakfast', 'lunch', 'dinner'] },
  { min: 9, max: 24, meals: ['breakfast', 'lunch', 'dinner', 'snack'] }
]

const AGE_STAGES = [
  {
    min: 0,
    max: 5,
    title: '暂未开始辅食',
    texture: '以奶为主',
    summary: '未满 6 月龄时通常不安排辅食菜单，继续按需喂奶，是否提前添加需听医生建议。',
    cautions: ['不急于添加辅食', '不要喂蜂蜜、果汁、成人调味食物', '早产、过敏或发育问题请先咨询医生']
  },
  {
    min: 6,
    max: 6,
    title: '6 月龄尝试期',
    texture: '细腻泥糊',
    summary: '从少量、单一食材开始，优先安排富铁食物；菜单只安排少量辅食餐位，仍以奶为主要营养来源。',
    cautions: ['每次只引入少量新食材', '不加盐糖', '食物要细腻顺滑，避免颗粒噎呛', '不要因为排了菜单就强迫吃完，按宝宝接受度调整']
  },
  {
    min: 7,
    max: 8,
    title: '7-8 月龄丰富期',
    texture: '泥糊到细颗粒',
    summary: '继续保证奶量，逐步增加蔬菜、水果、肉蛋鱼等种类，练习吞咽和初步咀嚼；可从 2 餐逐步过渡到 3 餐。',
    cautions: ['新食材继续单独观察', '鱼虾蛋等易敏食材少量尝试', '颗粒要细小软烂', '餐次和量要循序渐进']
  },
  {
    min: 9,
    max: 11,
    title: '9-11 月龄咀嚼练习期',
    texture: '软烂小颗粒',
    summary: '可以安排更多组合餐和手指食物，帮助练习抓握、咀嚼和自主进食。',
    cautions: ['食材切小煮软', '整颗坚果、葡萄、蓝莓等需压碎或切开', '进食时必须看护']
  },
  {
    min: 12,
    max: 24,
    title: '12-24 月龄幼儿餐过渡期',
    texture: '软烂家庭餐',
    summary: '逐步接近家庭餐，保持少盐少糖、食物多样和规律进餐。',
    cautions: ['仍要少盐少糖', '避免整颗坚果和硬块食物', '不要用零食替代正餐']
  }
]

const BASE_CAUTIONS = [
  '菜单仅作家庭参考，不是医疗处方；宝宝生病、过敏、早产、贫血或生长异常时请按医生建议调整。',
  '首次添加新食材要少量尝试并观察皮疹、呕吐、腹泻等反应。',
  '1 岁内不加盐糖，不喂蜂蜜；所有食物都要按月龄处理到合适软硬度。'
]

const SERVING_BY_AGE = {
  '6': '尝试量 5-30g；从 1-2 小勺开始，能接受再慢慢增加',
  '7-8': '约 30-60g/餐；按宝宝食欲调整，不影响奶量',
  '9-11': '约 50-100g/餐；加餐少量即可，避免影响正餐',
  '12+': '约 80-150g/餐；以宝宝饥饱信号为准'
}

const DISHES = [
  {
    id: 'iron-rice-cereal',
    name: '铁强化米粉糊',
    ageMinMonth: 6,
    ageMaxMonth: 8,
    mealTypes: ['breakfast', 'lunch', 'dinner', 'snack'],
    nutritionTags: ['富铁', '主食'],
    foodGroups: ['谷薯'],
    texture: '细腻泥糊',
    imageEmoji: '🥣',
    color: '#FFF3D6',
    ingredients: ['铁强化婴儿米粉', '温水或平时喝的奶'],
    steps: ['按包装比例冲调成顺滑糊状', '从 1-2 小勺开始，接受后逐步增加', '温度合适后再喂'],
    cautions: ['不要加糖', '冲调后尽快食用', '首次添加先单独观察耐受']
  },
  {
    id: 'pork-potato-puree',
    name: '猪肉土豆泥',
    ageMinMonth: 6,
    ageMaxMonth: 8,
    mealTypes: ['lunch', 'dinner'],
    nutritionTags: ['富铁', '蛋白', '主食'],
    foodGroups: ['肉禽鱼蛋', '谷薯'],
    texture: '细腻泥糊',
    imageEmoji: '🥔',
    color: '#FBE7C6',
    ingredients: ['瘦猪肉', '土豆', '温水'],
    steps: ['猪肉煮熟后打成肉泥', '土豆蒸熟压泥', '两者混合并加温水调到顺滑'],
    cautions: ['肉类必须彻底煮熟', '不加盐和酱油', '刚开始肉泥比例少一些']
  },
  {
    id: 'pumpkin-rice-puree',
    name: '南瓜米糊',
    ageMinMonth: 6,
    ageMaxMonth: 9,
    mealTypes: ['breakfast', 'dinner', 'snack'],
    nutritionTags: ['主食', '蔬菜'],
    foodGroups: ['谷薯', '蔬菜'],
    texture: '细腻泥糊',
    imageEmoji: '🎃',
    color: '#FFE1B8',
    ingredients: ['南瓜', '米粉或软米粥'],
    steps: ['南瓜蒸熟压泥', '加入米粉或软米粥搅匀', '调成宝宝能吞咽的稠度'],
    cautions: ['不要额外加糖', '南瓜偏甜，不要长期单一安排']
  },
  {
    id: 'carrot-beef-puree',
    name: '胡萝卜牛肉泥',
    ageMinMonth: 7,
    ageMaxMonth: 10,
    mealTypes: ['lunch', 'dinner'],
    nutritionTags: ['富铁', '蛋白', '蔬菜'],
    foodGroups: ['肉禽鱼蛋', '蔬菜'],
    texture: '泥糊到细颗粒',
    imageEmoji: '🥕',
    color: '#FFE2D2',
    ingredients: ['牛肉', '胡萝卜'],
    steps: ['牛肉煮熟打泥', '胡萝卜蒸软压泥', '混合后加少量温水调整口感'],
    cautions: ['牛肉纤维要打细', '观察是否便秘，必要时搭配绿叶菜泥']
  },
  {
    id: 'egg-yolk-spinach-congee',
    name: '蛋黄菠菜粥',
    ageMinMonth: 7,
    ageMaxMonth: 11,
    mealTypes: ['breakfast', 'lunch', 'dinner'],
    nutritionTags: ['蛋白', '蔬菜', '主食'],
    foodGroups: ['肉禽鱼蛋', '蔬菜', '谷薯'],
    texture: '细颗粒软粥',
    imageEmoji: '🥚',
    color: '#E8F5D8',
    ingredients: ['熟蛋黄', '菠菜叶', '软米粥'],
    steps: ['菠菜焯熟后切碎或打泥', '蛋黄压碎', '加入软米粥中煮匀'],
    cautions: ['鸡蛋首次添加要少量观察', '菠菜要充分煮熟并切细']
  },
  {
    id: 'apple-oat-paste',
    name: '苹果燕麦糊',
    ageMinMonth: 7,
    ageMaxMonth: 12,
    mealTypes: ['breakfast', 'snack'],
    nutritionTags: ['水果', '主食'],
    foodGroups: ['水果', '谷薯'],
    texture: '泥糊',
    imageEmoji: '🍎',
    color: '#FFE1E6',
    ingredients: ['苹果', '婴儿燕麦', '温水'],
    steps: ['苹果蒸软压泥', '燕麦煮软', '混合后搅成细腻糊状'],
    cautions: ['不要用果汁代替水果泥', '水果加餐量不宜影响正餐']
  },
  {
    id: 'chicken-broccoli-noodle',
    name: '鸡肉西兰花碎面',
    ageMinMonth: 8,
    ageMaxMonth: 14,
    mealTypes: ['lunch', 'dinner'],
    nutritionTags: ['蛋白', '蔬菜', '主食'],
    foodGroups: ['肉禽鱼蛋', '蔬菜', '谷薯'],
    texture: '软烂细碎',
    imageEmoji: '🍜',
    color: '#DDF4E7',
    ingredients: ['鸡胸肉', '西兰花', '宝宝面'],
    steps: ['鸡肉煮熟撕碎再切细', '西兰花煮软切碎', '宝宝面煮软后混合'],
    cautions: ['西兰花花蕾要切碎', '面条长度适合宝宝吞咽']
  },
  {
    id: 'salmon-sweet-potato-mash',
    name: '三文鱼红薯泥',
    ageMinMonth: 8,
    ageMaxMonth: 14,
    mealTypes: ['lunch', 'dinner'],
    nutritionTags: ['蛋白', '主食'],
    foodGroups: ['肉禽鱼蛋', '谷薯'],
    texture: '软烂细碎',
    imageEmoji: '🍠',
    color: '#FFE3CA',
    ingredients: ['三文鱼', '红薯'],
    steps: ['三文鱼蒸熟并仔细去刺', '红薯蒸熟压泥', '混合后压成细碎泥状'],
    cautions: ['鱼肉必须确认无刺', '鱼类首次添加要少量观察过敏']
  },
  {
    id: 'tofu-tomato-rice',
    name: '豆腐番茄软饭',
    ageMinMonth: 9,
    ageMaxMonth: 18,
    mealTypes: ['lunch', 'dinner'],
    nutritionTags: ['蛋白', '蔬菜', '主食'],
    foodGroups: ['豆制品', '蔬菜', '谷薯'],
    texture: '软烂小颗粒',
    imageEmoji: '🍅',
    color: '#FFE4DE',
    ingredients: ['嫩豆腐', '番茄', '软米饭'],
    steps: ['番茄去皮切碎煮软', '豆腐切小块煮透', '加入软米饭拌匀'],
    cautions: ['豆腐块要小且软', '不加盐，番茄自然调味即可']
  },
  {
    id: 'banana-yogurt-bowl',
    name: '香蕉酸奶小碗',
    ageMinMonth: 9,
    ageMaxMonth: 24,
    mealTypes: ['snack', 'breakfast'],
    nutritionTags: ['水果', '奶类'],
    foodGroups: ['水果', '奶类'],
    texture: '软泥',
    imageEmoji: '🍌',
    color: '#FFF1A8',
    ingredients: ['香蕉', '原味无糖酸奶'],
    steps: ['香蕉压成泥', '加入少量原味无糖酸奶拌匀'],
    cautions: ['选择原味无糖酸奶', '乳制品不耐受时不要安排']
  },
  {
    id: 'beef-vegetable-risotto',
    name: '牛肉蔬菜烩饭',
    ageMinMonth: 10,
    ageMaxMonth: 24,
    mealTypes: ['lunch', 'dinner'],
    nutritionTags: ['富铁', '蛋白', '蔬菜', '主食'],
    foodGroups: ['肉禽鱼蛋', '蔬菜', '谷薯'],
    texture: '软烂小颗粒',
    imageEmoji: '🍚',
    color: '#E6F2D9',
    ingredients: ['牛肉末', '胡萝卜', '青菜', '软米饭'],
    steps: ['牛肉末煮熟打散', '蔬菜煮软切碎', '加入软饭小火烩到湿润软烂'],
    cautions: ['牛肉末不能成硬块', '青菜纤维要切短']
  },
  {
    id: 'shrimp-egg-custard',
    name: '虾仁蒸蛋羹',
    ageMinMonth: 10,
    ageMaxMonth: 24,
    mealTypes: ['lunch', 'dinner'],
    nutritionTags: ['蛋白'],
    foodGroups: ['肉禽鱼蛋'],
    texture: '嫩滑细碎',
    imageEmoji: '🍤',
    color: '#FFE8DC',
    ingredients: ['鸡蛋', '虾仁', '温水'],
    steps: ['虾仁煮熟切成细碎', '蛋液加温水过滤', '加入虾碎蒸至凝固'],
    cautions: ['虾和鸡蛋都属于常见过敏食材，首次少量观察', '虾仁必须切碎']
  },
  {
    id: 'soft-vegetable-pancake',
    name: '软蔬菜小饼',
    ageMinMonth: 11,
    ageMaxMonth: 24,
    mealTypes: ['breakfast', 'snack'],
    nutritionTags: ['蔬菜', '主食'],
    foodGroups: ['蔬菜', '谷薯'],
    texture: '柔软手指食物',
    imageEmoji: '🥞',
    color: '#FFF0C9',
    ingredients: ['面粉', '鸡蛋', '西葫芦或胡萝卜碎'],
    steps: ['蔬菜擦细丝后切短', '与面粉鸡蛋调成稠糊', '少油或不放油煎成柔软小饼'],
    cautions: ['小饼要足够软', '切成宝宝能抓握的小条，进食时看护']
  },
  {
    id: 'pork-cabbage-dumpling',
    name: '猪肉白菜小馄饨',
    ageMinMonth: 12,
    ageMaxMonth: 24,
    mealTypes: ['lunch', 'dinner'],
    nutritionTags: ['蛋白', '蔬菜', '主食'],
    foodGroups: ['肉禽鱼蛋', '蔬菜', '谷薯'],
    texture: '软烂家庭餐',
    imageEmoji: '🥟',
    color: '#EAF0FF',
    ingredients: ['瘦猪肉末', '白菜碎', '小馄饨皮'],
    steps: ['肉末和白菜碎拌匀，不额外加盐', '包成小馄饨', '煮到皮软馅熟后剪小'],
    cautions: ['馄饨要彻底煮熟', '汤不要太烫，馅料不能成大硬块']
  },
  {
    id: 'avocado-egg-toast',
    name: '牛油果鸡蛋软吐司',
    ageMinMonth: 12,
    ageMaxMonth: 24,
    mealTypes: ['breakfast', 'snack'],
    nutritionTags: ['蛋白', '主食'],
    foodGroups: ['肉禽鱼蛋', '谷薯', '水果'],
    texture: '软烂小块',
    imageEmoji: '🥑',
    color: '#E1F2D1',
    ingredients: ['牛油果', '熟鸡蛋', '软吐司'],
    steps: ['牛油果压泥', '熟鸡蛋切碎', '涂在去边软吐司上并切小块'],
    cautions: ['吐司块不要过大', '鸡蛋过敏宝宝不安排']
  },
  {
    id: 'chicken-rice-puree',
    name: '鸡肉米糊',
    ageMinMonth: 6,
    ageMaxMonth: 8,
    mealTypes: ['lunch', 'dinner'],
    nutritionTags: ['蛋白', '主食'],
    foodGroups: ['肉禽鱼蛋', '谷薯'],
    texture: '细腻泥糊',
    imageEmoji: '🍗',
    color: '#F8E7D3',
    ingredients: ['鸡胸肉', '铁强化米粉或软米粥', '温水'],
    steps: ['鸡胸肉煮熟后打成细泥', '米粉冲调或软粥打细', '少量鸡肉泥加入米糊中搅匀'],
    cautions: ['鸡肉必须彻底煮熟', '首次吃鸡肉时先少量单独观察', '不加盐和调味料']
  },
  {
    id: 'beef-rice-cereal',
    name: '牛肉米粉糊',
    ageMinMonth: 6,
    ageMaxMonth: 8,
    mealTypes: ['lunch', 'dinner'],
    nutritionTags: ['富铁', '蛋白', '主食'],
    foodGroups: ['肉禽鱼蛋', '谷薯'],
    texture: '细腻泥糊',
    imageEmoji: '🥩',
    color: '#F6D7C8',
    ingredients: ['牛肉', '铁强化婴儿米粉', '温水'],
    steps: ['牛肉煮熟后打成非常细的肉泥', '米粉调成顺滑糊状', '加入少量牛肉泥充分搅匀'],
    cautions: ['牛肉纤维要打细', '先确认米粉已耐受', '刚开始肉泥比例少一些']
  },
  {
    id: 'pea-puree',
    name: '豌豆泥',
    ageMinMonth: 6,
    ageMaxMonth: 8,
    mealTypes: ['lunch', 'dinner'],
    nutritionTags: ['蔬菜'],
    foodGroups: ['蔬菜'],
    texture: '细腻泥糊',
    imageEmoji: '🫛',
    color: '#DFF3C9',
    ingredients: ['新鲜豌豆', '温水'],
    steps: ['豌豆煮到软烂', '去皮或充分打细', '加温水调成细腻泥状'],
    cautions: ['必须处理到顺滑，避免豆皮颗粒', '首次添加少量观察胀气或不适']
  },
  {
    id: 'apple-puree',
    name: '蒸苹果泥',
    ageMinMonth: 6,
    ageMaxMonth: 8,
    mealTypes: ['breakfast', 'snack'],
    nutritionTags: ['水果'],
    foodGroups: ['水果'],
    texture: '细腻果泥',
    imageEmoji: '🍎',
    color: '#FFE1E6',
    ingredients: ['苹果'],
    steps: ['苹果去皮切块蒸软', '压泥或打成细腻果泥', '放到温热后少量尝试'],
    cautions: ['不要用果汁代替果泥', '水果量少一些，避免影响正餐和奶量']
  },
  {
    id: 'yam-puree',
    name: '山药泥',
    ageMinMonth: 6,
    ageMaxMonth: 9,
    mealTypes: ['breakfast', 'lunch', 'dinner'],
    nutritionTags: ['主食'],
    foodGroups: ['谷薯'],
    texture: '细腻泥糊',
    imageEmoji: '🍠',
    color: '#F0E4FF',
    ingredients: ['山药', '温水或奶'],
    steps: ['山药蒸熟', '压泥后加少量温水调顺滑', '单独或搭配已耐受米糊食用'],
    cautions: ['处理山药时注意皮肤刺激', '质地要顺滑，不能有硬块']
  },
  {
    id: 'pear-puree',
    name: '蒸梨泥',
    ageMinMonth: 7,
    ageMaxMonth: 10,
    mealTypes: ['breakfast', 'snack'],
    nutritionTags: ['水果'],
    foodGroups: ['水果'],
    texture: '细腻果泥',
    imageEmoji: '🍐',
    color: '#F4F3C2',
    ingredients: ['梨'],
    steps: ['梨去皮去核切块', '蒸软后压泥', '温热时少量食用'],
    cautions: ['不要直接给硬块梨', '腹泻时谨慎安排水果泥']
  },
  {
    id: 'cod-carrot-porridge',
    name: '鳕鱼胡萝卜粥',
    ageMinMonth: 8,
    ageMaxMonth: 14,
    mealTypes: ['lunch', 'dinner'],
    nutritionTags: ['蛋白', '蔬菜', '主食'],
    foodGroups: ['肉禽鱼蛋', '蔬菜', '谷薯'],
    texture: '软烂细碎',
    imageEmoji: '🐟',
    color: '#E1F4FF',
    ingredients: ['鳕鱼', '胡萝卜', '软米粥'],
    steps: ['鳕鱼蒸熟并仔细去刺', '胡萝卜蒸软切细', '加入软米粥煮匀'],
    cautions: ['鱼肉必须确认无刺', '鱼类首次添加要少量观察过敏']
  },
  {
    id: 'lentil-rice-paste',
    name: '红扁豆米糊',
    ageMinMonth: 8,
    ageMaxMonth: 12,
    mealTypes: ['lunch', 'dinner'],
    nutritionTags: ['蛋白', '主食'],
    foodGroups: ['豆制品', '谷薯'],
    texture: '软烂泥糊',
    imageEmoji: '🥣',
    color: '#F7D9B7',
    ingredients: ['红扁豆', '软米粥'],
    steps: ['红扁豆充分煮烂', '和软米粥一起打细或压泥', '调到湿润软糊状态'],
    cautions: ['豆类容易胀气，首次少量', '必须煮到非常软烂']
  },
  {
    id: 'mini-vegetable-omelet',
    name: '蔬菜嫩蛋碎',
    ageMinMonth: 9,
    ageMaxMonth: 18,
    mealTypes: ['breakfast', 'lunch', 'dinner'],
    nutritionTags: ['蛋白', '蔬菜'],
    foodGroups: ['肉禽鱼蛋', '蔬菜'],
    texture: '嫩软小碎块',
    imageEmoji: '🍳',
    color: '#FFF0B8',
    ingredients: ['鸡蛋', '菠菜或西葫芦碎'],
    steps: ['蔬菜煮软切碎', '蛋液加少量水蒸或小火炒嫩', '出锅后剪成小碎块'],
    cautions: ['鸡蛋需已单独耐受', '不要煎硬，避免大块']
  },
  {
    id: 'chicken-pumpkin-risotto',
    name: '鸡肉南瓜烩饭',
    ageMinMonth: 10,
    ageMaxMonth: 24,
    mealTypes: ['lunch', 'dinner'],
    nutritionTags: ['蛋白', '蔬菜', '主食'],
    foodGroups: ['肉禽鱼蛋', '蔬菜', '谷薯'],
    texture: '软烂小颗粒',
    imageEmoji: '🎃',
    color: '#FFE0B5',
    ingredients: ['鸡肉末', '南瓜', '软米饭'],
    steps: ['鸡肉末煮熟打散', '南瓜蒸软压泥', '和软米饭一起小火烩软'],
    cautions: ['米饭要足够软', '鸡肉末不能成硬块']
  },
  {
    id: 'vegetable-fish-ball-soup',
    name: '蔬菜鱼肉小丸汤',
    ageMinMonth: 12,
    ageMaxMonth: 24,
    mealTypes: ['lunch', 'dinner'],
    nutritionTags: ['蛋白', '蔬菜'],
    foodGroups: ['肉禽鱼蛋', '蔬菜'],
    texture: '软烂小块',
    imageEmoji: '🍲',
    color: '#DFF6F0',
    ingredients: ['无刺鱼肉泥', '青菜碎', '少量淀粉'],
    steps: ['鱼肉确认无刺后打泥', '加少量淀粉做成很小的软丸', '和青菜碎一起煮熟'],
    cautions: ['鱼丸要小且软', '必须确认无刺，进食时看护']
  },
  {
    id: 'tomato-beef-pasta',
    name: '番茄牛肉软意面',
    ageMinMonth: 12,
    ageMaxMonth: 24,
    mealTypes: ['lunch', 'dinner'],
    nutritionTags: ['富铁', '蛋白', '主食', '蔬菜'],
    foodGroups: ['肉禽鱼蛋', '谷薯', '蔬菜'],
    texture: '软烂短面',
    imageEmoji: '🍝',
    color: '#FFE0D6',
    ingredients: ['牛肉末', '番茄', '短意面'],
    steps: ['短意面煮到软烂', '番茄去皮煮成泥', '加入熟牛肉末拌匀'],
    cautions: ['意面剪短', '不加盐和番茄酱，牛肉末要细']
  }
]

// 配料名 → 规范试吃食材名。[] 表示水、淀粉等辅料，不作为试吃食物；
// 未列出的配料默认自身就是规范名。试吃清单、过敏排除、过敏原标注都按规范名走。
const INGREDIENT_FOODS = {
  '铁强化婴儿米粉': ['米粉'],
  '铁强化米粉或软米粥': ['米粉'],
  '米粉或软米粥': ['米粉'],
  '温水或平时喝的奶': [],
  '温水或奶': [],
  '温水': [],
  '少量淀粉': [],
  '瘦猪肉': ['猪肉'],
  '瘦猪肉末': ['猪肉'],
  '牛肉末': ['牛肉'],
  '鸡胸肉': ['鸡肉'],
  '鸡肉末': ['鸡肉'],
  '熟蛋黄': ['鸡蛋'],
  '熟鸡蛋': ['鸡蛋'],
  '菠菜叶': ['菠菜'],
  '菠菜或西葫芦碎': ['菠菜', '西葫芦'],
  '西葫芦或胡萝卜碎': ['西葫芦', '胡萝卜'],
  '软米粥': ['大米'],
  '软米饭': ['大米'],
  '婴儿燕麦': ['燕麦'],
  '嫩豆腐': ['豆腐'],
  '原味无糖酸奶': ['酸奶'],
  '新鲜豌豆': ['豌豆'],
  '青菜碎': ['青菜'],
  '白菜碎': ['白菜'],
  '虾仁': ['虾'],
  '无刺鱼肉泥': ['鱼肉'],
  '宝宝面': ['小麦面食'],
  '面粉': ['小麦面食'],
  '小馄饨皮': ['小麦面食'],
  '软吐司': ['小麦面食'],
  '短意面': ['小麦面食']
}

function getIngredientFoods(name) {
  const mapped = INGREDIENT_FOODS[name]
  return mapped ? mapped.slice() : [name]
}

// 手填菜名里的常见写法 → 规范食材名。只收明确无歧义的别名："米糊""米粥"这类会被"小米粥""玉米糊"包含的不收
const FOOD_ALIASES = {
  '米粉糊': '米粉',
  '大米粥': '大米',
  '白米粥': '大米',
  '大米糊': '大米',
  '蛋黄': '鸡蛋',
  '番薯': '红薯',
  '地瓜': '红薯',
  '西红柿': '番茄',
  '红萝卜': '胡萝卜',
  '洋芋': '土豆',
  '马铃薯': '土豆',
  '花椰菜': '西兰花',
  '面条': '小麦面食',
  '面片': '小麦面食',
  '馒头': '小麦面食'
}

// 菜库里出现过的全部规范食材名
function getKnownFoodNames() {
  const names = []
  DISHES.forEach(dish => {
    getDishFoods(dish).forEach(food => {
      if (!names.includes(food)) names.push(food)
    })
  })
  return names
}

// 从手填菜名里识别规范食材："胡萝卜泥"→['胡萝卜']，"苹果燕麦糊"→['苹果','燕麦']。
// 长名优先、位置不重叠（"三文鱼肉泥"只识别三文鱼，不再把"鱼肉"算一次）。
// extraFoods 用来带上家庭自定义的试吃食材名。识别不到返回 []。
function matchFoodsInName(name, extraFoods) {
  const text = String(name || '').trim()
  if (!text) return []
  const dict = {}
  getKnownFoodNames().forEach(food => { dict[food] = food })
  ;(extraFoods || []).forEach(food => {
    const key = String(food || '').trim()
    if (key) dict[key] = key
  })
  Object.keys(FOOD_ALIASES).forEach(alias => {
    if (!dict[alias]) dict[alias] = FOOD_ALIASES[alias]
  })
  const keys = Object.keys(dict).sort((left, right) => right.length - left.length)
  const masked = new Array(text.length).fill(false)
  const hits = []
  keys.forEach(key => {
    let from = 0
    while (from <= text.length - key.length) {
      const index = text.indexOf(key, from)
      if (index < 0) break
      from = index + 1
      let free = true
      for (let i = index; i < index + key.length; i++) {
        if (masked[i]) { free = false; break }
      }
      if (!free) continue
      for (let i = index; i < index + key.length; i++) masked[i] = true
      hits.push({ index, food: dict[key] })
    }
  })
  const foods = []
  hits.sort((left, right) => left.index - right.index).forEach(hit => {
    if (!foods.includes(hit.food)) foods.push(hit.food)
  })
  return foods
}

// 试吃表里可当作"额外食材词典"的名字：菜库已有的、或本身能从菜库词典识别出食材的（如早期误存的"胡萝卜泥"）都剔掉，
// 否则这类名字会反过来抢走识别结果
function filterExtraFoods(names) {
  const known = getKnownFoodNames()
  return (names || []).filter(name => {
    const text = String(name || '').trim()
    if (!text || known.includes(text)) return false
    return matchFoodsInName(text).length === 0
  })
}

// 家长手写的配料行 → 规范食材：先查配料映射表，再按词典/别名识别（蛋黄→鸡蛋、番薯→红薯），都认不出就原样保留
function canonicalizeIngredient(name) {
  const text = String(name || '').trim()
  if (!text) return []
  if (Object.prototype.hasOwnProperty.call(INGREDIENT_FOODS, text)) return INGREDIENT_FOODS[text].slice()
  const matched = matchFoodsInName(text)
  return matched.length > 0 ? matched : [text]
}

// 自定义食材输入归一：恰好识别出一种已知食材就用规范名（"胡萝卜泥"→"胡萝卜"），否则用去空格后的原文
function resolveFoodName(input, extraFoods) {
  const text = String(input || '').trim()
  if (!text) return ''
  const matched = matchFoodsInName(text, extraFoods)
  return matched.length === 1 ? matched[0] : text
}

function getDishFoods(dish) {
  const foods = []
  ;(dish.ingredients || []).forEach(name => {
    getIngredientFoods(name).forEach(food => {
      if (!foods.includes(food)) foods.push(food)
    })
  })
  return foods
}

// 排除名单同时按原始配料名和规范名匹配，兼容早期按配料名存的过敏记录
function dishContainsExcluded(dish, excluded) {
  if (!excluded || excluded.length === 0) return false
  return (dish.ingredients || []).some(name => excluded.includes(name)) ||
    getDishFoods(dish).some(food => excluded.includes(food))
}

function getAgeStage(ageMonth) {
  return AGE_STAGES.find(stage => ageMonth >= stage.min && ageMonth <= stage.max) || AGE_STAGES[AGE_STAGES.length - 1]
}

function getDishById(id) {
  return DISHES.find(dish => dish.id === id) || null
}

function getDishesFor(ageMonth, mealType, excludedIngredients) {
  const excluded = excludedIngredients || []
  return DISHES.filter(dish =>
    dish.ageMinMonth <= ageMonth &&
    dish.ageMaxMonth >= ageMonth &&
    dish.mealTypes.includes(mealType) &&
    !dishContainsExcluded(dish, excluded)
  )
}

function getMealTypesForAge(ageMonth) {
  const config = AGE_MEAL_TYPES.find(item => ageMonth >= item.min && ageMonth <= item.max)
  return config ? config.meals : []
}

function cloneDish(dish) {
  return JSON.parse(JSON.stringify(dish))
}

function decorateDish(dish) {
  const servingByAge = dish.servingByAge || SERVING_BY_AGE
  return {
    ...cloneDish(dish),
    servingByAge,
    servingLabel: Object.keys(servingByAge).map(age => `${age}月龄：${servingByAge[age]}`).join('；'),
    ageLabel: `${dish.ageMinMonth}-${dish.ageMaxMonth} 月龄`,
    mealLabel: dish.mealTypes.map(type => MEAL_LABELS[type]).join('、'),
    nutritionLabel: dish.nutritionTags.join('、'),
    ingredientsLabel: dish.ingredients.join('、'),
    stepsPreview: dish.steps[0] || '',
    cautionsPreview: dish.cautions[0] || ''
  }
}

function matchesAgeRange(dish, ageRange) {
  if (!ageRange || ageRange === 'all') return true
  if (ageRange === '6') return dish.ageMinMonth <= 6 && dish.ageMaxMonth >= 6
  if (ageRange === '7-8') return dish.ageMinMonth <= 8 && dish.ageMaxMonth >= 7
  if (ageRange === '9-11') return dish.ageMinMonth <= 11 && dish.ageMaxMonth >= 9
  if (ageRange === '12+') return dish.ageMaxMonth >= 12
  return true
}

function getDishCatalog(filters) {
  const options = typeof filters === 'number' ? { ageMonth: filters } : (filters || {})
  const dishes = DISHES.filter(dish => {
    const ageMatch = typeof options.ageMonth === 'number'
      ? dish.ageMinMonth <= options.ageMonth && dish.ageMaxMonth >= options.ageMonth
      : matchesAgeRange(dish, options.ageRange)
    const mealMatch = !options.mealType || options.mealType === 'all' || dish.mealTypes.includes(options.mealType)
    const nutritionMatch = !options.nutritionTag || options.nutritionTag === 'all' || dish.nutritionTags.includes(options.nutritionTag)
    return ageMatch && mealMatch && nutritionMatch
  })
  return dishes.map(decorateDish)
}

// unlockedFoods 为 null 表示不启用解锁限制（试吃数据不可用时优雅降级）；米粉作为起步食物始终可用
function toUnlockedMap(unlockedFoods) {
  if (!unlockedFoods) return null
  const map = {}
  unlockedFoods.forEach(name => { map[name] = true })
  return map
}

function dishAllowedByUnlocked(dish, unlockedFoods) {
  const map = Array.isArray(unlockedFoods) ? toUnlockedMap(unlockedFoods) : unlockedFoods
  if (!map) return true
  return getDishFoods(dish).every(food => food === '米粉' || map[food])
}

function pickDish(ageMonth, mealType, seed, usedIds, excludedIngredients, unlockedMap) {
  const excluded = excludedIngredients || []
  const base = getDishesFor(ageMonth, mealType)
    .filter(dish => !dishContainsExcluded(dish, excluded))
  const candidates = base.filter(dish => dishAllowedByUnlocked(dish, unlockedMap))
  if (candidates.length === 0) {
    // 解锁食材太少排不出菜时，用高铁米粉糊兜底而不是留空
    if (unlockedMap) {
      const fallback = getDishById(IRON_CEREAL_ID)
      if (fallback && !dishContainsExcluded(fallback, excluded)) {
        const dish = cloneDish(fallback)
        dish.lockedFallback = true
        return dish
      }
    }
    return null
  }
  const fresh = candidates.filter(dish => !usedIds[dish.id])
  const pool = fresh.length > 0 ? fresh : candidates
  const selected = pool[seed % pool.length]
  usedIds[selected.id] = (usedIds[selected.id] || 0) + 1
  const dish = cloneDish(selected)
  if (unlockedMap && selected.id === IRON_CEREAL_ID && candidates.length < base.length) {
    dish.lockedFallback = true
  }
  return dish
}

function pickReplacementDish({ ageMonth, mealType, currentDishId }) {
  const candidates = getDishesFor(ageMonth, mealType).filter(dish => dish.id !== currentDishId)
  if (candidates.length === 0) return null
  return cloneDish(candidates[0])
}

function summarizeNutrition(days) {
  const summary = {}
  days.forEach(day => {
    Object.keys(day.meals).forEach(type => {
      ;(day.meals[type] || []).forEach(dish => {
        dish.nutritionTags.forEach(tag => {
          summary[tag] = (summary[tag] || 0) + 1
        })
      })
    })
  })
  return summary
}

function buildDay(date, ageMonth, dayIndex, usedIds, excludedIngredients, unlockedMap) {
  const meals = {}
  const mealTypes = getMealTypesForAge(ageMonth)
  mealTypes.forEach((type, mealIndex) => {
    const seed = dayIndex * MEAL_TYPES.length + mealIndex
    const dish = pickDish(ageMonth, type, seed, usedIds, excludedIngredients, unlockedMap)
    meals[type] = dish ? [dish] : []
  })
  return { date, meals, phase: 'regular' }
}

function buildTrialDay(date) {
  const cereal = cloneDish(getDishById(IRON_CEREAL_ID))
  return { date, meals: { lunch: [cereal] }, phase: 'trial' }
}

function planHasLockedFallback(days) {
  return days.some(day =>
    Object.keys(day.meals).some(type =>
      (day.meals[type] || []).some(dish => dish.lockedFallback)))
}

function generateWeeklyMenu({ birthDate, weekStart, excludedIngredients, unlockedFoods }) {
  const firstFoodDate = dateUtil.addMonths(birthDate, 6)
  const weekEnd = dateUtil.addDays(weekStart, 6)

  // 整周都在满 6 月龄之前才是纯奶周
  if (dateUtil.compareDates(weekEnd, firstFoodDate) < 0) {
    const ageMonth = dateUtil.monthsBetween(birthDate, weekStart)
    const stage = getAgeStage(ageMonth)
    return {
      status: 'milk_only',
      birthDate,
      weekStart,
      ageMonth,
      stage,
      days: [],
      nutritionSummary: {},
      mealLabels: MEAL_LABELS,
      cautions: BASE_CAUTIONS.concat(stage.cautions)
    }
  }

  const ageMonth = Math.max(6, dateUtil.monthsBetween(birthDate, weekStart))
  const stage = getAgeStage(ageMonth)
  const trialEndExclusive = dateUtil.addDays(firstFoodDate, TRIAL_PERIOD_DAYS)
  const cerealUsable = !dishContainsExcluded(getDishById(IRON_CEREAL_ID), excludedIngredients || [])
  const unlockedMap = toUnlockedMap(unlockedFoods)
  const usedIds = {}
  const days = []
  for (let i = 0; i < 7; i++) {
    const date = dateUtil.addDays(weekStart, i)
    if (dateUtil.compareDates(date, firstFoodDate) < 0) {
      days.push({ date, meals: {}, phase: 'milk' })
    } else if (cerealUsable && dateUtil.compareDates(date, trialEndExclusive) < 0) {
      days.push(buildTrialDay(date))
    } else {
      const dayAge = Math.max(6, dateUtil.monthsBetween(birthDate, date))
      days.push(buildDay(date, dayAge, i, usedIds, excludedIngredients, unlockedMap))
    }
  }

  return {
    status: 'ready',
    birthDate,
    weekStart,
    ageMonth,
    stage,
    days,
    lockedFallback: planHasLockedFallback(days),
    nutritionSummary: summarizeNutrition(days),
    mealTypes: getMealTypesForAge(ageMonth),
    mealLabels: MEAL_LABELS,
    cautions: BASE_CAUTIONS.concat(stage.cautions)
  }
}

function generateMonthlyMenu({ birthDate, monthStart, excludedIngredients, unlockedFoods }) {
  const weeks = []
  for (let i = 0; i < 4; i++) {
    const weekStart = dateUtil.addDays(monthStart, i * 7)
    weeks.push(generateWeeklyMenu({ birthDate, weekStart, excludedIngredients, unlockedFoods }))
  }
  return {
    birthDate,
    monthStart,
    weeks
  }
}

function weekStartFor(dateStr) {
  const parts = dateStr.split('-').map(n => parseInt(n, 10))
  const d = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]))
  const day = d.getUTCDay() || 7
  return dateUtil.addDays(dateStr, 1 - day)
}

function getDefaultPlanningWeekStart({ birthDate, today }) {
  const firstFoodDate = dateUtil.addMonths(birthDate, 6)
  const startDate = dateUtil.compareDates(today, firstFoodDate) < 0 ? firstFoodDate : today
  return weekStartFor(startDate)
}

module.exports = {
  MEAL_TYPES,
  MEAL_LABELS,
  TRIAL_PERIOD_DAYS,
  dishAllowedByUnlocked,
  AGE_MEAL_TYPES,
  AGE_STAGES,
  DISHES,
  getIngredientFoods,
  getDishFoods,
  getKnownFoodNames,
  matchFoodsInName,
  filterExtraFoods,
  canonicalizeIngredient,
  resolveFoodName,
  getAgeStage,
  getDishById,
  getDishesFor,
  getDishCatalog,
  getMealTypesForAge,
  generateWeeklyMenu,
  generateMonthlyMenu,
  pickReplacementDish,
  getDefaultPlanningWeekStart
}
