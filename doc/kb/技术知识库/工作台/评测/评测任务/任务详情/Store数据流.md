---
capability_label: 任务详情
doc_type: "14"
doc_label: Store数据流
generated_at: "2026-06-18T10:30:00Z"
parent_module: 评测任务
roles: ["团队成员"]
router_paths: ["/dashboard/evaluation/task/detail"]
---

# 任务详情 — Store 数据流

## 状态管理方案

本模块使用 **React Context + use-context-selector** 实现集中式状态管理，不依赖 Zustand 等外部状态库。状态由 `TaskPageContextProvider` 统一管理，通过 `TaskPageContext` 向子组件树分发。

## 状态结构

### TaskPageContextType

| 字段 | 类型 | 说明 | 更新方式 |
|------|------|------|---------|
| `taskId` | `string` | 当前评测任务 ID | 组件 props 传入，不变 |
| `taskDetail` | `EvaluationTaskType` | 任务基本信息（名称、创建时间等） | `loadTaskDetail()` 设置 |
| `statsData` | `EvaluationStatsResponse \| null` | 统计信息（总数/完成/错误/低于阈值） | `runLoadStats()` 设置，15s 轮询更新 |
| `summaryData` | `EvaluationSummaryResponse \| null` | 评分总结（各维度得分、阈值、总结文本） | `runLoadSummary()` 设置，15s 轮询更新 |
| `evaluationDetail` | `EvaluationDisplayType \| null` | 评测任务完整详情（含 evaluators、target 等） | `runLoadEvaluationDetail()` 设置，15s 轮询更新 |
| `evaluationItems` | `EvaluationItemDisplayType[]` | 评测项列表（当前筛选条件下的数据） | 由外部 `useScrollPagination` 的 `setData` 更新 |
| `appDetail` | `AppDetailType \| null` | 关联应用详情（含权限信息） | `runLoadAppDetail()` 设置 |
| `loading` | `LoadingState` | 各数据模块的加载状态 | 各加载方法自动管理 |
| `errors` | `ErrorState` | 各数据模块的错误信息 | 各加载方法自动管理 |
| `searchValue` | `string` | 搜索关键词 | `setSearchValue()` |
| `totalItems` | `number` | 评测项总数 | `setTotalItems()` |
| `filterParams` | `Record<string, any>` | 当前过滤参数 | `setFilterParams()` |

### LoadingState

| 字段 | 说明 |
|------|------|
| `stats` | 统计数据加载中 |
| `summary` | 评分总结加载中 |
| `detail` | 评测详情加载中 |
| `items` | 评测项列表加载中 |
| `taskDetail` | 任务基本信息加载中 |

### ErrorState

| 字段 | 说明 |
|------|------|
| `stats` | 统计数据加载错误信息 |
| `summary` | 评分总结加载错误信息 |
| `detail` | 评测详情加载错误信息 |
| `items` | 评测项列表加载错误信息 |
| `taskDetail` | 任务基本信息加载错误信息 |

## 数据加载方法

| 方法 | 说明 | 触发时机 | 轮询 |
|------|------|---------|------|
| `loadTaskDetail(id)` | 加载任务基本信息，失败时跳转回列表 | 页面初始化 | 否 |
| `loadAllData(taskDetailData?)` | 分三阶段加载：① 详情+统计（并行）② 评分总结 ③ 应用详情 | 页面初始化 | 否 |
| `refreshAllData()` | 并行刷新详情+统计+总结 | 手动触发 | 否 |
| `refreshStats()` | 刷新统计数据 | 增删改操作后 | 否 |
| `loadSummary()` | 刷新评分总结 | 生成总结后 | 否 |
| `refreshEvaluationItems()` | 刷新评测项列表（当前为空操作，列表由 useScrollPagination 管理） | 增删改操作后 | 否 |

## 数据操作方法

| 方法 | 对应 API | 成功后副作用 | Toast |
|------|---------|------------|------|
| `deleteItem(itemId)` | DELETE item/delete | 刷新统计 + 列表 | 删除成功 / 删除失败 |
| `retryItem(itemId)` | POST item/retry | 刷新统计 + 列表 | 重试请求已提交 / 重试失败 |
| `updateItem(itemId, data)` | PUT item/update | 刷新统计 + 列表 | 保存成功 / 保存失败 |
| `retryFailedItems()` | POST task/retryFailed | 刷新统计 + 列表 + 提示重试数量 | 重试请求已提交 / 重试失败 |
| `exportItems(filters)` | POST item/export（downloadFetch） | 浏览器下载 CSV 文件 | 导出成功 / 导出失败 |
| `generateSummary()` | POST summary/create | 刷新总结数据 | 总结生成请求已提交 / 生成失败 |
| `generateSummaryForMetrics(params)` | POST summary/create（指定 metricIds） | 刷新总结数据 | 同上 |

## 数据流图

```
TaskPageContextProvider (taskId)
│
├─ 初始化阶段
│   ├── loadTaskDetail(taskId)
│   │   └── GET /core/evaluation/task/detail → taskDetail
│   ├── loadAllData(taskDetailData)
│   │   ├── [并行] loadStats() / loadEvaluationDetail()
│   │   │   ├── GET /core/evaluation/task/stats → statsData (轮询 15s)
│   │   │   └── GET /core/evaluation/task/detail → evaluationDetail (轮询 15s)
│   │   ├── loadSummary()
│   │   │   └── GET /core/evaluation/summary/detail → summaryData (轮询 15s)
│   │   └── runLoadAppDetail(appId)
│   │       └── getAppDetailById → appDetail
│   │
├─ 列表数据（由 useScrollPagination 管理，不在 Context 内）
│   └── POST /core/evaluation/task/item/list → evaluationItems
│       ├── 首次加载: offset=0, pageSize=20
│       ├── 滚动加载: offset=N, pageSize=20
│       ├── 搜索: userInput=keyword (500ms 防抖)
│       ├── Tab 过滤: status/belowThreshold
│       └── 智能轮询: 加载到当前选中页的数据
│
├─ 用户操作
│   ├── 编辑 → PUT item/update → 刷新列表+统计
│   ├── 重试单条 → POST item/retry → 刷新列表+统计
│   ├── 删除 → DELETE item/delete → 刷新列表+统计+调整选中索引
│   ├── 批量重试 → POST task/retryFailed → 刷新列表+统计+切换Tab
│   ├── 导出 → POST item/export → 浏览器下载CSV
│   ├── 刷新评分 → POST summary/create → 刷新总结
│   └── 配置参数 → POST summary/config/update → 刷新全部数据
│
└─ 组件卸载
    └── 清除所有轮询定时器 (cancelStatsPolling, cancelSummaryPolling, cancelDetailPolling)
```

## 轮询机制

评测执行过程中，Context 内通过 `useRequest` 的 `pollingInterval` 选项实现自动轮询：

- **轮询间隔**：15 秒
- **轮询接口**：stats、summary、detail（三个独立轮询）
- **静默更新**：首次加载后，后续轮询不显示 loading 状态，数据静默替换
- **隐藏时暂停**：`pollingWhenHidden: false`，浏览器标签页不可见时暂停轮询
- **错误不重试**：`pollingErrorRetryCount: 0`，轮询失败不自动重试
- **列表智能刷新**：详情页组件通过 `useInterval` 每 15 秒调用 `smartRefreshData`，仅重新请求到当前选中项所在页码的数据，减少不必要的请求

## 搜索与过滤流程

```
用户输入搜索关键词
  → 本地状态 immediate 更新（输入框实时显示）
  → 500ms 防抖后调用 setSearchValue
  → useScrollPagination 检测到 searchValue 变化
  → 自动重新请求 POST item/list (带 userInput 参数)
  → 列表刷新，选中项重置为第一条

用户切换 Tab
  → router.replace 更新 URL query currentTab
  → useScrollPagination 检测到 currentTab 变化
  → 自动重新请求 POST item/list (带 Tab 对应的过滤参数)
  → 列表刷新
```

## Provider 层级

```
<Render>  (pages/dashboard/evaluation/task/detail/index.tsx)
  └── <TaskPageContextProvider taskId={taskId}>
        └── <Detail>  (实际页面组件)
              ├── <NavBar>  (通过 useContextSelector 消费 taskDetail, statsData)
              ├── 数据列表区域 (通过 useContextSelector 消费 searchValue, setSearchValue 等)
              ├── 详情区域 (通过 useContextSelector 消费 evaluationDetail 等)
              └── 右侧面板 (通过 useContextSelector 消费 statsData, summaryData 等)
```
