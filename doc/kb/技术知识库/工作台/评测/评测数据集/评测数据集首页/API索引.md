---
capability_label: "评测数据集首页"
doc_type: "12"
doc_label: "API索引"
generated_at: "2026-06-18T12:00:00.000Z"
parent_module: "评测数据集"
roles: ["团队成员"]
router_paths: ["/dashboard/evaluation/dataset"]
---

# 评测数据集首页 — API索引

## 数据集列表

| API 路径 | 方法 | 用途 | 调用位置 | 调用场景 |
|---------|------|------|---------|---------|
| `/core/evaluation/dataset/collection/list` | POST | 获取评测数据集分页列表 | `@/web/core/evaluation/dataset.ts:36` → `index.tsx:99` | 评测数据集首页→查看数据集列表→加载时调用；评测数据集首页→搜索数据集→搜索时调用；评测数据集首页→翻页→分页时调用 |

## 数据集管理

| API 路径 | 方法 | 用途 | 调用位置 | 调用场景 |
|---------|------|------|---------|---------|
| `/core/evaluation/dataset/collection/update` | POST | 更新数据集名称 | `@/web/core/evaluation/dataset.ts:51` → `index.tsx:139` | 评测数据集首页→重命名数据集→提交新名称时调用 |
| `/core/evaluation/dataset/collection/delete` | DELETE | 删除数据集 | `@/web/core/evaluation/dataset.ts:47` → `index.tsx:186` | 评测数据集首页→删除数据集→确认删除时调用 |

## 智能生成

| API 路径 | 方法 | 用途 | 调用位置 | 调用场景 |
|---------|------|------|---------|---------|
| `/core/evaluation/dataset/data/smartGenerate` | POST | 智能生成评测数据集 | `@/web/core/evaluation/dataset.ts:28` → `IntelligentGeneration.tsx:141` | 评测数据集首页→智能生成数据集→提交生成参数时调用 |

## 异常任务处理

| API 路径 | 方法 | 用途 | 调用位置 | 调用场景 |
|---------|------|------|---------|---------|
| `/core/evaluation/dataset/collection/failedTasks` | POST | 获取异常任务详情列表 | `@/web/core/evaluation/dataset.ts:98` → `errorModal.tsx:49` | 评测数据集首页→查看异常任务→打开弹窗时调用 |
| `/core/evaluation/dataset/collection/retryTask` | POST | 重试单个失败任务 | `@/web/core/evaluation/dataset.ts:102` → `errorModal.tsx:80` | 评测数据集首页→查看异常任务→点击单任务重试时调用 |
| `/core/evaluation/dataset/collection/deleteTask` | POST | 删除单个失败任务 | `@/web/core/evaluation/dataset.ts:106` → `errorModal.tsx:91` | 评测数据集首页→查看异常任务→点击单任务删除时调用 |
| `/core/evaluation/dataset/collection/retryAllTask` | POST | 批量重试所有失败任务 | `@/web/core/evaluation/dataset.ts:120` → `errorModal.tsx:102` | 评测数据集首页→查看异常任务→点击全部重试时调用 |

## API 调用链追踪

### `/core/evaluation/dataset/collection/list` 调用链

```
EvaluationDatasets (index.tsx)
  ├── 触发: 页面加载、翻页、搜索防抖触发后
  ├── 参数: { pageNum, pageSize: 10, searchKey }
  ├── 响应处理: usePagination 管理 data/total/isLoading，渲染表格
  └── 刷新依赖: [searchValue] 变化时重新触发
```

### `/core/evaluation/dataset/collection/update` 调用链

```
EvaluationDatasets (index.tsx)
  ├── 触发: 重命名弹窗确认后
  ├── 参数: { collectionId, name }
  ├── 响应处理: 成功 toast "更新成功"，调用 fetchData() 刷新列表
  └── 错误处理: 统一错误 toast
```

### `/core/evaluation/dataset/collection/delete` 调用链

```
EvaluationDatasets (index.tsx)
  ├── 触发: 确认删除弹窗→确认
  ├── 参数: { collectionId }
  ├── 响应处理: 成功 toast "删除成功"，调用 fetchData() 刷新列表
  └── 错误处理: toast "删除数据集失败"（dashboard_evaluation:delete_dataset_error）
```

### `/core/evaluation/dataset/data/smartGenerate` 调用链

```
IntelligentGeneration (IntelligentGeneration.tsx)
  ├── 触发: 弹窗表单提交
  ├── 参数: { name?, kbDatasetIds[], intelligentGenerationModelId, count, collectionId? }
  ├── 响应处理: 返回 collectionId，触发 onConfirm 回调，父组件刷新列表
  └── 错误处理: useRequest 统一错误 toast
```

### `/core/evaluation/dataset/collection/failedTasks` 调用链

```
ErrorModal (errorModal.tsx)
  ├── 触发: 弹窗打开（isOpen && collectionId）
  ├── 参数: { collectionId }
  ├── 响应处理: 设置 errorList，记录初始长度用于关闭时判断是否有变化
  └── 注意: 弹窗关闭时清空数据
```

### `/core/evaluation/dataset/collection/retryTask` 调用链

```
ErrorModal (errorModal.tsx)
  ├── 触发: 点击单行"重试"按钮
  ├── 参数: { jobId, collectionId }
  ├── 响应处理: 成功 toast "重试成功"，刷新异常任务列表
  └── 错误处理: useRequest 统一错误 toast
```

### `/core/evaluation/dataset/collection/deleteTask` 调用链

```
ErrorModal (errorModal.tsx)
  ├── 触发: 点击单行"删除"按钮
  ├── 参数: { jobId, collectionId }
  ├── 响应处理: 成功 toast "删除成功"，刷新异常任务列表
  └── 错误处理: useRequest 统一错误 toast
```

### `/core/evaluation/dataset/collection/retryAllTask` 调用链

```
ErrorModal (errorModal.tsx)
  ├── 触发: 点击"全部重试"按钮
  ├── 参数: { collectionId }
  ├── 响应处理: 成功 toast "重试成功"，刷新异常任务列表
  ├── 前置条件: 任务列表非空时按钮可用，列表为空或加载中时灰显
  └── 错误处理: useRequest 统一错误 toast
```
