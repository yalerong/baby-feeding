# 宝宝喂养记录

一个基于微信云开发的家庭宝宝记录小程序。用于记录喝奶、大便和辅食，并提供成长、疫苗、菜单与统计功能。

> 本项目用于家庭记录与辅助整理，不替代医生、营养师或儿保机构的建议。

## 当前功能

- 喝奶记录：母乳/奶粉、快速录入、历史补录、编辑与删除。
- 防漏记与防重复：1 小时内再次记录喝奶时提醒确认；次日可一次性审查前一天的疑似重复记录。
- 喂养间隔参考：基于过去 30 个完整自然日的真实喝奶间隔，分别计算白天与夜间建议；按整段间隔的中点归类，首页当天缓存以减少重复查询。
- 大便与辅食：可同条记录保存大便详情，或保存辅食名称、克数和关联菜品。
- 辅食菜单：按月龄生成周/月菜单；可替换菜品；疑似过敏食材会从生成和替换候选中排除。
- 食材试吃：一次追踪一种新食材，连续 3 天记录后解锁；可标记疑似过敏。
- 统计：近 7 天、近 30 天与全部记录；近 7 天统计使用过去 7 个完整日，不包含今天。
- 成长与疫苗：身高体重趋势、疫苗计划与接种记录。
- 家庭共享：使用同一 `familyCode` 的家庭成员共享数据。

## 快速开始

1. 用微信开发者工具导入本目录。
2. 在开发者工具的云开发控制台创建并选择一个云环境。
3. 在 `project.config.json` 的 `cloudfunctionRoot` 下选择该云环境；否则部署云函数时会提示“请选择一个云环境”。
4. 复制 `config.local.example.js` 为 `config.local.js`，填写家庭码和可选的哭声提醒模板 ID。`config.local.js` 不会提交到 Git。
5. 在微信开发者工具中逐个右键以下目录，选择“创建并部署：云端安装依赖”：

```text
addRecord          updateRecord        deleteRecord
getRecords         getStats            batchFeeding
growthRecord       batchVaccine        weeklyMenu
foodTrial          supplement
```

如需使用哭声订阅提醒，再部署 `cryAlertSubscription` 和 `cryAlertWebhook`，并按各自的 `config.js.example` 配置密钥与模板。

## 云数据库集合

核心集合如下：

| 集合 | 用途 |
| --- | --- |
| `feeding_records` | 喝奶、大便、辅食记录 |
| `food_trials` | 新食材连续试吃、解锁与疑似过敏状态 |
| `weekly_menus` | 家庭周菜单 |
| `growth_records` | 身高、体重记录 |
| `vaccine_records` | 疫苗计划与接种记录 |
| `supplement_records` | 营养补充剂记录（如启用） |

`feeding_records` 的辅食字段为：`solidFood`、`solidFoodDishId`、`solidFoodDishName`、`solidFoodGrams`。云函数会拒绝“已勾选辅食但名称为空或克数不大于 0”的记录。

## 数据与隐私

- `familyCode` 是家庭数据分组标识。请使用不易猜测的随机字符串，不要使用默认值或公开信息。
- 云函数会按 `familyCode` 查询和写入数据；为防止串号，家庭成员应使用同一个家庭码。
- 疑似过敏标记只是记录和菜单过滤工具；若出现不适或疑似过敏反应，请及时咨询专业医疗人员。

## 开发校验

项目使用无依赖的 Node.js 测试脚本：

```powershell
Get-ChildItem tests -Filter '*.test.js' | ForEach-Object { node $_.FullName }
```

修改云函数后，请在微信开发者工具中重新部署相应云函数；修改前端后重新编译小程序。

## 项目结构

```text
pages/           小程序页面
utils/           日期、菜单、间隔审查与缓存等通用逻辑
cloudfunctions/  微信云函数
tests/           Node.js 回归测试
```

## GitHub

仓库地址：[yalerong/baby-feeding](https://github.com/yalerong/baby-feeding)
