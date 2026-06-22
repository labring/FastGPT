---
capability_label: "评测数据集"
doc_type: "12"
doc_label: "API索引"
generated_at: "2026-06-18T10:31:09Z"
parent_module: "评测首页"
roles: ["团队成员"]
router_paths:
  - "/dashboard/evaluation?evaluationTab=datasets"
  - "/dashboard/evaluation/dataset/detail"
  - "/dashboard/evaluation/dataset/fileImport"
---

# 评测数据集 — API索引

> API 定义文件：`projects/app/src/web/core/evaluation/dataset.ts`

## 数据集集合管理

| API 路径 | 方法 | 用途 | 调用位置 | 调用场景 |
|---------|------|------|---------|---------|
| `/core/evaluation/dataset/collection/list` | POST | 分页查询数据集列表 | `web/core/evaluation/dataset.ts:37` → `pages/dashboard/evaluation/dataset/index.tsx:98` | 评测数据集→列表页→加载时调用；评测数据集→列表页→搜索/翻页时调用 |
| `/core/evaluation/dataset/collection/listv2` | POST | 查询数据集列表（轻量版） | `web/core/evaluation/dataset.ts:44` | 评测任务创建→选择数据集→加载时调用；对话评价数据集选择器→加载时调用 |
| `/core/evaluation/dataset/collection/create` | POST | 创建新数据集 | `web/core/evaluation/dataset.ts:33` → `pages/dashboard/evaluation/dataset/fileImport.tsx:128` | 评测数据集→文件导入→提交前自动创建数据集 |
| `/core/evaluation/dataset/collection/update` | POST | 更新数据集名称 | `web/core/evaluation/dataset.ts:52` → `pages/dashboard/evaluation/dataset/index.tsx:139`；`pageComponents/dashboard/evaluation/dataset/detail/DataListModals.tsx` | 评测数据集→列表页→重命名时调用；数据集详情→设置弹窗→修改名称时调用 |
| `/core/evaluation/dataset/collection/delete` | DELETE | 删除数据集 | `web/core/evaluation/dataset.ts:48` → `pages/dashboard/evaluation/dataset/index.tsx:186` | 评测数据集→列表页→确认删除时调用 |
| `/core/evaluation/dataset/collection/detail` | GET | 获取数据集详情 | `web/core/evaluation/dataset.ts:111` → `pageComponents/dashboard/evaluation/dataset/detail` | 数据集详情→页面初始化时调用 |
| `/core/evaluation/dataset/collection/qualityAssessmentBatch` | POST | 批量质量评估 | `web/core/evaluation/dataset.ts:91` | 数据集详情→数据列表→触发批量质量评测时调用 |

## 数据集数据管理

| API 路径 | 方法 | 用途 | 调用位置 | 调用场景 |
|---------|------|------|---------|---------|
| `/core/evaluation/dataset/data/list` | POST | 分页查询数据集内的数据条目 | `web/core/evaluation/dataset.ts:64` → `pageComponents/dashboard/evaluation/dataset/detail/DataList.tsx` | 数据集详情→数据列表→加载时调用；数据集详情→数据列表→搜索/筛选/翻页/滚动时调用 |
| `/core/evaluation/dataset/data/create` | POST | 手动新增数据条目 | `web/core/evaluation/dataset.ts:68` | 数据集详情→手动新增→提交时调用 |
| `/core/evaluation/dataset/data/smartGenerate` | POST | 智能生成数据集数据 | `web/core/evaluation/dataset.ts:29` → `pageComponents/dashboard/evaluation/dataset/IntelligentGeneration.tsx:141`；`pageComponents/dashboard/evaluation/task/CreateModal.tsx`；`pageComponents/dashboard/evaluation/dataset/detail/DataListModals.tsx`；`components/core/chat/ChatContainer/ChatBox/components/EvaluationDatasetSelector.tsx` | 评测数据集→列表页→智能生成弹窗→提交时调用；评测任务创建→新建/导入数据集→智能生成时调用；数据集详情→追加数据→智能生成时调用；对话中→加入评测数据集→创建数据集时调用 |
| `/core/evaluation/dataset/data/create/smartGenerate` | POST | 从知识库智能生成追加数据 | `web/core/evaluation/dataset.ts:72` | 数据集详情→追加数据→智能生成追加时调用 |
| `/core/evaluation/dataset/data/create/localFile` | POST | 从文件导入追加数据 | `web/core/evaluation/dataset.ts:76` | 数据集详情→追加数据→文件导入追加时调用 |
| `/core/evaluation/dataset/data/update` | POST | 编辑数据条目 | `web/core/evaluation/dataset.ts:80` | 数据集详情→编辑数据→保存时调用 |
| `/core/evaluation/dataset/data/delete` | DELETE | 删除数据条目 | `web/core/evaluation/dataset.ts:84` | 数据集详情→数据列表→删除数据时调用 |
| `/core/evaluation/dataset/data/qualityAssessment` | POST | 单项数据质量评估 | `web/core/evaluation/dataset.ts:88` | 数据集详情→数据列表→对单条数据发起质量评测时调用 |
| `/core/evaluation/dataset/data/import` | POST | 文件导入数据 | `web/core/evaluation/dataset.ts:154` → `pages/dashboard/evaluation/dataset/fileImport.tsx:135` | 评测数据集→文件导入页→提交确认时调用 |
| `/core/evaluation/dataset/data/detail` | GET | 获取数据条目详情 | `web/core/evaluation/dataset.ts:117` | 数据集详情→查看数据详情时调用 |
| `/core/evaluation/dataset/data/fileId` | POST | 通过文件ID导入数据 | `web/core/evaluation/dataset.ts:55` | 数据集详情→通过已上传文件导入数据时调用 |

## 异常任务管理

| API 路径 | 方法 | 用途 | 调用位置 | 调用场景 |
|---------|------|------|---------|---------|
| `/core/evaluation/dataset/collection/failedTasks` | POST | 获取数据集失败任务列表 | `web/core/evaluation/dataset.ts:99` → `pageComponents/dashboard/evaluation/dataset/errorModal.tsx:48` | 评测数据集→列表页→异常详情弹窗→打开时调用 |
| `/core/evaluation/dataset/collection/retryTask` | POST | 重试单个失败任务 | `web/core/evaluation/dataset.ts:103` → `pageComponents/dashboard/evaluation/dataset/errorModal.tsx:80` | 评测数据集→异常详情弹窗→点击单任务"重试"时调用 |
| `/core/evaluation/dataset/collection/deleteTask` | POST | 删除单个失败任务 | `web/core/evaluation/dataset.ts:107` → `pageComponents/dashboard/evaluation/dataset/errorModal.tsx:91` | 评测数据集→异常详情弹窗→点击单任务"删除"时调用 |
| `/core/evaluation/dataset/collection/retryAllTask` | POST | 批量重试所有失败任务 | `web/core/evaluation/dataset.ts:121` → `pageComponents/dashboard/evaluation/dataset/errorModal.tsx:102` | 评测数据集→异常详情弹窗→点击"全部重试"时调用 |

---

## API 调用链追踪

### `POST /core/evaluation/dataset/collection/list` 调用链

```
EvaluationDatasets (列表页)
  ├── 触发: 页面加载 / 搜索防抖触发 / 翻页
  ├── 参数: { pageNum, pageSize, searchKey }
  ├── 并行: 无，独立请求
  └── 响应处理: 更新 Pagination hook 的 data 和 total，渲染表格行

用途: 分页获取数据集列表，支持名称搜索
依赖页: 评测首页 (评价Tab) 中的 评测数据集 Tab
```

### `POST /core/evaluation/dataset/data/smartGenerate` 调用链

```
IntelligentGeneration (智能生成弹窗)
  ├── 触发: 用户填写表单后点击"确认"
  ├── 参数: { name, count, kbDatasetIds, intelligentGenerationModelId }
  ├── 并行: 无，独立请求
  └── 响应处理: 返回 collectionId，关闭弹窗，通知父组件刷新列表

CreateModal (评测任务创建弹窗)
  ├── 触发: 创建任务时新建/导入数据集
  ├── 参数: 同上（可能含 collectionId 追加模式）
  └── 响应处理: 返回 collectionId，更新任务创建表单的数据集选择

EvaluationDatasetSelector (对话中评价数据集选择器)
  ├── 触发: 对话中评价结果时自动选择或创建数据集
  ├── 参数: 同上
  └── 响应处理: 返回 collectionId 用于关联数据集
```

### `DELETE /core/evaluation/dataset/collection/delete` 调用链

```
EvaluationDatasets (列表页)
  ├── 触发: 用户在确认弹窗中点击"删除"
  ├── 参数: { collectionId }
  ├── 前置: 弹出确认对话框"确认删除该数据集？"
  ├── 并行: 无，独立请求
  └── 响应处理: 成功则 toast "删除成功"，刷新列表；失败则 toast "删除数据集异常"
```

### `POST /core/evaluation/dataset/data/import` 调用链

```
FileImport (文件导入页)
  ├── 触发: 用户选择文件后点击"确认"
  ├── 参数: FormData { file[], data: { name?, collectionId, enableQualityEvaluation, evaluationModelId? } }
  ├── 前置可能: 如无 collectionId 则先调用 POST /core/evaluation/dataset/collection/create
  ├── 并行: 无，串行（创建数据集→上传文件）
  ├── 超时: 600000ms (10分钟)
  ├── 进度: 通过 onUploadProgress 回调实时更新百分比
  └── 响应处理: 成功则跳转到对应页面（列表或详情），失败则 toast 错误信息
```

### `POST /core/evaluation/dataset/collection/failedTasks` 调用链

```
ErrorModal (异常详情弹窗)
  ├── 触发: 弹窗打开时自动发起
  ├── 参数: { collectionId }
  ├── 并行: 无，独立请求
  └── 响应处理: 更新 errorList，渲染失败任务表格（知识库、分块、错误信息、操作列）
```

### `POST /core/evaluation/dataset/collection/retryTask` 调用链

```
ErrorModal (异常详情弹窗)
  ├── 触发: 用户点击单个失败任务的"重试"按钮
  ├── 参数: { jobId, collectionId }
  ├── 并行: 与 deleteTask 互斥（同时只能执行一个操作）
  └── 响应处理: 成功则 toast "重试成功"，刷新失败任务列表
```

### `POST /core/evaluation/dataset/collection/retryAllTask` 调用链

```
ErrorModal (异常详情弹窗)
  ├── 触发: 用户点击"全部重试"按钮
  ├── 参数: { collectionId }
  ├── 禁用条件: 无失败任务或正在执行其他操作时按钮不可用
  └── 响应处理: 成功则 toast "重试成功"，刷新失败任务列表
```
