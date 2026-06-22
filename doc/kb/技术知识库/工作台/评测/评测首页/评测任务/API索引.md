---
capability_label: 评测任务
doc_type: "12"
doc_label: "API索引"
generated_at: "2026-06-18T10:30:00Z"
parent_module: 评测首页
roles: [管理员, 团队成员]
router_paths: [/dashboard/evaluation?evaluationTab=tasks, /dashboard/evaluation/task/detail?taskId={id}]
---

# 评测任务 — API索引

## 任务管理 API

| API 路径 | 方法 | 用途 | 调用位置 | 调用场景 |
|---------|------|------|---------|---------|
| `/core/evaluation/task/create` | POST | 创建评测任务 | `src/web/core/evaluation/task.ts:52` → `src/pageComponents/dashboard/evaluation/task/CreateModal.tsx:335` | 评测任务→创建新任务弹窗→点击确认提交时调用 |
| `/core/evaluation/task/list` | POST | 获取评测任务列表 | `src/web/core/evaluation/task.ts:84` → `src/pages/dashboard/evaluation/task/index.tsx:60` | 评测任务→任务列表→加载/搜索/筛选/分页时调用；创建任务弹窗→获取最近使用的数据集时调用 |
| `/core/evaluation/task/detail` | GET | 获取评测任务详情 | `src/web/core/evaluation/task.ts:76` → `src/web/core/evaluation/context/taskPageContext.tsx:429` | 评测任务→任务详情页→初始化加载和轮询刷新时调用 |
| `/core/evaluation/task/update` | PUT | 更新评测任务（重命名） | `src/web/core/evaluation/task.ts:68` → `src/pages/dashboard/evaluation/task/index.tsx:123` | 评测任务→任务列表→操作菜单→重命名→确认时调用 |
| `/core/evaluation/task/delete` | DELETE | 删除评测任务 | `src/web/core/evaluation/task.ts:60` → `src/pages/dashboard/evaluation/task/index.tsx:138` | 评测任务→任务列表→操作菜单→删除→确认删除时调用 |
| `/core/evaluation/task/start` | POST | 启动评测任务 | `src/web/core/evaluation/task.ts:92` | 后端自动触发（任务创建后 autoStart 为 true 时），前端无直接调用 |
| `/core/evaluation/task/stop` | POST | 停止评测任务 | `src/web/core/evaluation/task.ts:100` | 管理员操作（前端预留能力） |
| `/core/evaluation/task/stats` | GET | 获取评测统计信息 | `src/web/core/evaluation/task.ts:108` → `src/web/core/evaluation/context/taskPageContext.tsx:231` | 评测任务→任务详情页→加载/轮询刷新统计时调用 |
| `/core/evaluation/task/retryFailed` | POST | 重试失败评测项 | `src/web/core/evaluation/task.ts:116` → 多处 | 评测任务→任务列表→操作菜单→重试错误数据时调用；评测任务→任务详情页→错误数据标签→重试按钮时调用 |

### `/core/evaluation/task/create` 调用链

```
CreateModal 组件
  ├── 触发: 用户填写创建表单后点击确认
  ├── 参数: { name, evalDatasetCollectionId, target: { type, config: { appId, versionId } }, evaluators: [{ metric, runtimeConfig }] }
  └── 响应处理: 创建成功后关闭弹窗，刷新任务列表
```

### `/core/evaluation/task/list` 调用链

```
任务列表页 (EvaluationTasks)
  ├── 触发: 页面加载、搜索关键字变化（500ms 防抖）、应用筛选变化、分页切换
  ├── 参数: { pageNum, pageSize, searchKey?, appId? }
  └── 响应处理: 更新表格数据、分页信息、总数

CreateModal 组件
  ├── 触发: 选择应用版本后获取该应用最近使用的任务
  ├── 参数: { pageNum: 1, pageSize: 1, appId }
  └── 响应处理: 自动填入最近使用的数据集
```

### `/core/evaluation/task/detail` 调用链

```
TaskPageContext (loadTaskDetail)
  ├── 触发: 任务详情页初始化加载
  ├── 参数: { evalId }
  └── 响应处理: 存入 taskDetail 状态，用于页面渲染

TaskPageContext (runLoadEvaluationDetail / 轮询)
  ├── 触发: 每 15 秒自动轮询
  ├── 参数: { evalId }
  └── 响应处理: 静默更新 evaluationDetail 状态
```

### `/core/evaluation/task/stats` 调用链

```
TaskPageContext (runLoadStats / 轮询)
  ├── 触发: 详情页初始化加载 + 每 15 秒轮询
  ├── 参数: { evalId }
  └── 响应处理: 更新进度统计（total/completed/error/belowThreshold），用于 NavBar 标签计数和进度展示；删除/重试/编辑操作后手动刷新
```

### `/core/evaluation/task/retryFailed` 调用链

```
任务列表页 (EvaluationTasks)
  ├── 触发: 点击任务操作菜单→重试错误数据
  ├── 参数: { evalId }
  └── 响应处理: 刷新任务列表

TaskPageContext (retryFailedItems)
  ├── 触发: 详情页错误数据标签→重试按钮
  ├── 参数: { evalId }
  └── 响应处理: 刷新统计和详情数据
```

---

## 评测项管理 API

| API 路径 | 方法 | 用途 | 调用位置 | 调用场景 |
|---------|------|------|---------|---------|
| `/core/evaluation/task/item/list` | POST | 获取评测项列表 | `src/web/core/evaluation/task.ts:150` → `src/pages/dashboard/evaluation/task/detail/index.tsx:197` | 评测任务→任务详情→数据列表→加载/滚动分页/轮询刷新时调用 |
| `/core/evaluation/task/item/detail` | GET | 获取评测项详情 | `src/web/core/evaluation/task.ts:142` | 评测项详情查看 |
| `/core/evaluation/task/item/update` | PUT | 更新评测项 | `src/web/core/evaluation/task.ts:134` → `src/web/core/evaluation/context/taskPageContext.tsx:330` | 评测任务→任务详情→编辑数据→保存时调用 |
| `/core/evaluation/task/item/delete` | DELETE | 删除评测项 | `src/web/core/evaluation/task.ts:126` → `src/web/core/evaluation/context/taskPageContext.tsx:314` | 评测任务→任务详情→选中数据→删除时调用 |
| `/core/evaluation/task/item/retry` | POST | 重试评测项 | `src/web/core/evaluation/task.ts:158` → `src/web/core/evaluation/context/taskPageContext.tsx:321` | 评测任务→任务详情→选中数据→刷新时调用 |
| `/api/core/evaluation/task/item/export` | POST | 导出评测数据 | `src/web/core/evaluation/context/taskPageContext.tsx:396` | 评测任务→任务详情→导出按钮→确认时调用 |

### `/core/evaluation/task/item/list` 调用链

```
任务详情页 (Detail)
  ├── 触发: 首次加载、滚动到底部自动加载更多、15 秒轮询刷新
  ├── 参数: { evalId, offset, pageSize: 20, userInput? (搜索), status? (标签筛选), belowThreshold? (标签筛选) }
  └── 响应处理: 更新 evaluationItems 列表；搜索时重置选中索引
```

### `/core/evaluation/task/item/update` 调用链

```
任务详情页 (Detail → updateItem)
  ├── 触发: 编辑数据后点击保存
  ├── 参数: { evalItemId, userInput, expectedOutput, modifyDataset }
  └── 响应处理: 成功后刷新数据列表，退出编辑模式
```

### `/api/core/evaluation/task/item/export` 调用链

```
任务详情页 (Detail → exportItems)
  ├── 触发: 点击导出按钮
  ├── 参数: { evalId, filters, headers, metricColumns, statusLabelMap }
  └── 响应处理: 触发文件下载，保存为 CSV；文件名格式 evaluation_{任务名}_{日期}.csv
```

---

## 评测总结 API

| API 路径 | 方法 | 用途 | 调用位置 | 调用场景 |
|---------|------|------|---------|---------|
| `/core/evaluation/summary/detail` | GET | 获取评测总结报告 | `src/web/core/evaluation/task.ts:168` → `src/web/core/evaluation/context/taskPageContext.tsx:259` | 评测任务→任务详情→初始化加载和轮询刷新时调用 |
| `/core/evaluation/summary/config/detail` | GET | 获取评分配置详情 | `src/web/core/evaluation/task.ts:184` → `src/pageComponents/dashboard/evaluation/task/detail/ConfigParams.tsx:90` | 评测任务→任务详情→配置参数→弹窗打开时调用 |
| `/core/evaluation/summary/config/update` | POST | 更新评分配置 | `src/web/core/evaluation/task.ts:176` → `src/pageComponents/dashboard/evaluation/task/detail/ConfigParams.tsx:213` | 评测任务→任务详情→配置参数弹窗→确认时调用 |
| `/core/evaluation/summary/create` | POST | 生成总结报告 | `src/web/core/evaluation/task.ts:192` → `src/web/core/evaluation/context/taskPageContext.tsx:347` | 评测任务→任务详情→刷新评分按钮；评测总结卡片→重试生成时调用 |

### `/core/evaluation/summary/detail` 调用链

```
TaskPageContext (loadSummary / 轮询)
  ├── 触发: 详情页初始化加载 + 每 15 秒轮询
  ├── 参数: { evalId }
  └── 响应处理: 更新 summaryData 状态，驱动右侧评分仪表盘和总结卡片渲染
```

### `/core/evaluation/summary/config/update` 调用链

```
ConfigParams 弹窗
  ├── 触发: 用户配置分数聚合方式、各维度阈值和权重后点击确认
  ├── 参数: { evalId, calculateType, metricsConfig: [{ metricId, thresholdValue, weight }] }
  └── 响应处理: 配置保存成功后关闭弹窗，刷新总结数据
```

### `/core/evaluation/summary/create` 调用链

```
TaskPageContext (generateSummary / generateSummaryForMetrics)
  ├── 触发: 详情页刷新评分按钮 / 总结卡片重试链接
  ├── 参数: { evalId, metricIds: [...] }
  └── 响应处理: 异步生成，后续轮询自动获取结果
```

---

## API 分组汇总

| 分组 | API 数量 | 说明 |
|------|---------|------|
| 任务创建与管理 | 6 | 创建、列表、详情、更新、删除、启动/停止 |
| 统计数据 | 1 | 任务进度统计（总数/完成/错误/低于阈值） |
| 批量操作 | 1 | 重试失败项 |
| 评测项管理 | 4 | 列表、详情、更新、删除 |
| 评测项操作 | 2 | 重试单条、导出 |
| 总结报告 | 4 | 查看总结、配置参数、更新配置、生成报告 |
