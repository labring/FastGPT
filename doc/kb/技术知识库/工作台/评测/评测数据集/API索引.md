---
capability_label: "评测数据集"
doc_type: "12"
doc_label: "API索引"
generated_at: "2026-06-18T10:30:00.000Z"
parent_module: "评测"
roles: ["团队成员"]
router_paths: []
---

# 评测数据集 — API索引

## 数据集管理

| API 路径 | 方法 | 用途 | 调用位置 | 调用场景 |
|---------|------|------|---------|---------|
| `/core/evaluation/dataset/collection/create` | POST | 创建评测数据集 | `src/web/core/evaluation/dataset.ts:32` → `src/pages/dashboard/evaluation/dataset/fileImport.tsx:128` | 评测数据集→文件导入→提交表单时调用（无 collectionId 时先创建） |
| `/core/evaluation/dataset/collection/list` | POST | 获取评测数据集分页列表 | `src/web/core/evaluation/dataset.ts:37` → `src/pages/dashboard/evaluation/dataset/index.tsx:99` | 评测数据集→数据集列表→加载时调用；搜索/分页时调用 |
| `/core/evaluation/dataset/collection/listv2` | POST | 获取评测数据集轻量列表 | `src/web/core/evaluation/dataset.ts:43` | 评测数据集→需要简化列表数据的场景 |
| `/core/evaluation/dataset/collection/update` | POST | 更新数据集名称 | `src/web/core/evaluation/dataset.ts:51` → `src/pages/dashboard/evaluation/dataset/index.tsx:139`<br>`src/pageComponents/dashboard/evaluation/dataset/detail/DataListModals.tsx` | 评测数据集→列表页→重命名时调用；评测数据集→详情页→设置时调用 |
| `/core/evaluation/dataset/collection/delete` | DELETE | 删除评测数据集 | `src/web/core/evaluation/dataset.ts:47` → `src/pages/dashboard/evaluation/dataset/index.tsx:186` | 评测数据集→列表页→确认删除时调用 |
| `/core/evaluation/dataset/collection/detail` | GET | 获取数据集详情 | `src/web/core/evaluation/dataset.ts:110` | 评测数据集→获取数据集元信息时调用 |

## 数据导入

| API 路径 | 方法 | 用途 | 调用位置 | 调用场景 |
|---------|------|------|---------|---------|
| `/core/evaluation/dataset/data/import` | POST | 上传文件批量导入数据 | `src/web/core/evaluation/dataset.ts:124` → `src/pages/dashboard/evaluation/dataset/fileImport.tsx:135` | 评测数据集→文件导入→提交文件上传时调用（含进度回调） |
| `/core/evaluation/dataset/data/smartGenerate` | POST | 智能生成评测数据集 | `src/web/core/evaluation/dataset.ts:28` → `src/pageComponents/dashboard/evaluation/dataset/IntelligentGeneration.tsx:141` | 评测数据集→列表页/详情页→智能生成弹窗→确认时调用 |
| `/core/evaluation/dataset/data/fileId` | POST | 通过文件 ID 导入数据 | `src/web/core/evaluation/dataset.ts:55` | 评测数据集→文件已上传后通过 fileId 关联导入 |

## 数据条目管理

| API 路径 | 方法 | 用途 | 调用位置 | 调用场景 |
|---------|------|------|---------|---------|
| `/core/evaluation/dataset/data/list` | POST | 获取数据集数据分页列表 | `src/web/core/evaluation/dataset.ts:63` → `src/pageComponents/dashboard/evaluation/dataset/detail/DataList.tsx:121` | 评测数据集→详情页→数据列表→滚动加载时调用；筛选/搜索时调用 |
| `/core/evaluation/dataset/data/create` | POST | 手动新增数据条目 | `src/web/core/evaluation/dataset.ts:67` | 评测数据集→详情页→手动添加弹窗→提交时调用 |
| `/core/evaluation/dataset/data/create/smartGenerate` | POST | 智能生成追加数据 | `src/web/core/evaluation/dataset.ts:71` | 评测数据集→详情页→智能生成追加→确认时调用 |
| `/core/evaluation/dataset/data/create/localFile` | POST | 文件导入追加数据 | `src/web/core/evaluation/dataset.ts:75` | 评测数据集→详情页→文件导入追加→提交时调用 |
| `/core/evaluation/dataset/data/update` | POST | 编辑数据条目 | `src/web/core/evaluation/dataset.ts:79` | 评测数据集→详情页→编辑数据弹窗→保存时调用 |
| `/core/evaluation/dataset/data/delete` | DELETE | 删除数据条目 | `src/web/core/evaluation/dataset.ts:83` → `src/pageComponents/dashboard/evaluation/dataset/detail/DataList.tsx:92` | 评测数据集→详情页→数据卡片→确认删除时调用 |
| `/core/evaluation/dataset/data/detail` | GET | 获取单条数据详情 | `src/web/core/evaluation/dataset.ts:116` | 评测数据集→查看单条数据详细信息时调用 |

## 质量评估

| API 路径 | 方法 | 用途 | 调用位置 | 调用场景 |
|---------|------|------|---------|---------|
| `/core/evaluation/dataset/data/qualityAssessment` | POST | 单项数据质量评估 | `src/web/core/evaluation/dataset.ts:87` | 评测数据集→详情页→对单条数据执行质量评估时调用 |
| `/core/evaluation/dataset/collection/qualityAssessmentBatch` | POST | 批量数据质量评估 | `src/web/core/evaluation/dataset.ts:91` | 评测数据集→详情页→批量质量评估按钮→确认时调用 |

## 异常任务管理

| API 路径 | 方法 | 用途 | 调用位置 | 调用场景 |
|---------|------|------|---------|---------|
| `/core/evaluation/dataset/collection/failedTasks` | POST | 获取异常任务列表 | `src/web/core/evaluation/dataset.ts:98` → `src/pageComponents/dashboard/evaluation/dataset/errorModal.tsx` | 评测数据集→列表页/详情页→查看异常任务详情时调用 |
| `/core/evaluation/dataset/collection/retryTask` | POST | 重试单个异常任务 | `src/web/core/evaluation/dataset.ts:102` | 评测数据集→异常任务弹窗→重试单个任务时调用 |
| `/core/evaluation/dataset/collection/retryAllTask` | POST | 批量重试所有异常任务 | `src/web/core/evaluation/dataset.ts:120` | 评测数据集→异常任务弹窗→全部重试时调用 |
| `/core/evaluation/dataset/collection/deleteTask` | POST | 删除单个异常任务 | `src/web/core/evaluation/dataset.ts:106` | 评测数据集→异常任务弹窗→删除单个任务时调用 |
