---
capability_label: 评测任务
doc_type: "14"
doc_label: "Store数据流"
generated_at: "2026-06-18T10:30:00Z"
parent_module: 评测首页
roles: [管理员, 团队成员]
router_paths: [/dashboard/evaluation?evaluationTab=tasks, /dashboard/evaluation/task/detail?taskId={id}]
---

# 评测任务 — Store数据流

## 状态管理概览

评测任务模块使用两种状态管理模式：

- **列表页**：使用本地 `useState` + `usePagination` Hook 管理任务列表的分页、搜索和筛选状态，无需独立的 Context
- **详情页**：使用 `TaskPageContext`（基于 React Context + `use-context-selector`）集中管理详情页的全部数据和操作状态

## TaskPageContext（详情页核心状态）

**文件位置**: `src/web/core/evaluation/context/taskPageContext.tsx`

### 状态字段

| 字段 | 类型 | 初始值 | 说明 |
|------|------|--------|------|
| `taskId` | `string` | Props 传入 | 当前查看的任务 ID |
| `taskDetail` | `EvaluationDisplayType` | 空对象 | 任务基本详情（名称/创建时间/状态等） |
| `statsData` | `EvaluationStatsResponse \| null` | `null` | 任务进度统计（总数/完成/错误/低于阈值） |
| `summaryData` | `EvaluationSummaryResponse \| null` | `null` | 评测总结数据（各维度得分/综合分/总结文本） |
| `evaluationDetail` | `EvaluationDisplayType \| null` | `null` | 任务详细数据（含 metricNames、evaluators、target 等） |
| `evaluationItems` | `EvaluationItemDisplayType[]` | `[]` | 评测数据项列表 |
| `appDetail` | `AppDetailType \| null` | `null` | 被评测应用的详细信息 |
| `searchValue` | `string` | `''` | 数据列表搜索关键字 |
| `totalItems` | `number` | `0` | 数据项总数 |
| `filterParams` | `Record<string, any>` | `{}` | 数据列表过滤参数 |
| `loading` | `LoadingState` | 全 `false` | 各数据源的加载状态（stats/summary/detail/items/taskDetail） |
| `errors` | `ErrorState` | 全 `null` | 各数据源的错误信息 |

### 数据加载流程

```
TaskPageContextProvider 挂载
  │
  ├── 1. Detail 组件 useRequest 触发 loadTaskDetail(taskId)
  │     ├── GET /core/evaluation/task/detail → taskDetail
  │     └── 成功后调用 loadAllData(taskDetailData)
  │
  ├── 2. loadAllData:
  │     ├── 设置 evaluationDetail（由传入数据或 delay 加载）
  │     ├── 并行: loadStats() | loadEvaluationDetail()
  │     │   ├── GET /core/evaluation/task/stats → statsData
  │     │   └── GET /core/evaluation/task/detail → evaluationDetail [轮询 15s]
  │     ├── 串行: loadSummary()
  │     │   └── GET /core/evaluation/summary/detail → summaryData [轮询 15s]
  │     └── 串行: runLoadAppDetail(targetAppId)
  │         └── GET app detail → appDetail
  │
  └── 3. 轮询（15 秒间隔）:
        ├── stats 自动轮询
        ├── summary 自动轮询
        ├── detail 自动轮询
        └── 数据列表智能刷新（重新加载已浏览页面的数据）
```

### 轮询机制

- **轮询间隔**：15 秒
- **静默更新**：非首次加载时不显示 loading 遮罩
- **自动启停**：首次成功加载后自动开启；组件卸载时自动清除所有轮询
- **数据列表刷新**：`smartRefreshData` 智能刷新——仅重新加载到当前已浏览位置的数据，而非全量重新加载

### 数据操作流程

```
操作: 删除数据项
  └── deleteItem(itemId)
        ├── DELETE /core/evaluation/task/item/delete
        └── 并行刷新: refreshStats() + refreshEvaluationItems()

操作: 重试数据项
  └── retryItem(itemId)
        ├── POST /core/evaluation/task/item/retry
        └── 并行刷新: refreshStats() + refreshEvaluationItems()

操作: 更新数据项
  └── updateItem(itemId, data)
        ├── PUT /core/evaluation/task/item/update
        └── 并行刷新: refreshStats() + refreshEvaluationItems()

操作: 重试所有失败项
  └── retryFailedItems()
        ├── POST /core/evaluation/task/retryFailed
        └── 并行刷新: refreshStats() + refreshEvaluationItems()

操作: 生成总结
  └── generateSummary()
        ├── 从 summaryData 提取所有 metricIds
        └── generateSummaryForMetrics({ evalId, metricIds })
              ├── POST /core/evaluation/summary/create
              └── loadSummary() 刷新总结数据

操作: 导出数据
  └── exportItems(filters)
        ├── 收集维度列名（从 evaluationDetail.metricNames + summaryData）
        ├── 构建 CSV headers（中文表头 + 维度列）
        └── POST /api/core/evaluation/task/item/export → 文件下载
```

## 列表页状态管理

列表页不使用 Context，而是使用 `usePagination` Hook 管理状态：

```
EvaluationTasks 组件状态:
├── searchValue / localSearchValue: 搜索关键字（双状态：即时显示 + 防抖实际搜索）
├── appFilter: 应用筛选 ID
├── isCreateModalOpen: 创建弹窗开关
├── usePagination: 分页/数据加载
│   ├── data (tasks): 当前页任务数据
│   ├── Pagination: 分页器组件
│   ├── getData (fetchData): 刷新数据
│   ├── isLoading: 加载状态
│   └── total: 总数据量
├── useConfirm: 删除确认弹窗
└── useEditTitle: 重命名弹窗
```

### 列表页数据刷新触发条件

- `searchValue` 变化（500ms 防抖延迟）
- `appFilter` 变化
- `fetchData()` 手动调用（创建/删除/重命名/重试成功后）
