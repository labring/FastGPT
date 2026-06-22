---
capability_label: "评测任务"
doc_type: "12"
doc_label: "API索引"
generated_at: "2026-06-18T00:00:00.000Z"
parent_module: "评测"
roles: ["团队管理员", "团队成员"]
router_paths: ["/dashboard/evaluation/task", "/dashboard/evaluation/task/detail"]
---

# 评测任务 — API索引

## 任务管理

| API 路径 | 方法 | 用途 | 调用位置 | 调用场景 |
|---------|------|------|---------|---------|
| /core/evaluation/task/list | POST | 获取评测任务列表 | task.ts:85 → task/index.tsx:60 | 评测任务→任务首页→加载时调用；搜索/筛选/翻页时调用 |
| /core/evaluation/task/create | POST | 创建评测任务 | task.ts:52 → CreateModal.tsx:335 | 评测任务→任务首页→点击创建→提交表单时调用 |
| /core/evaluation/task/detail | GET | 获取任务详情 | task.ts:76 → taskPageContext.tsx:287 | 评测任务→任务详情→加载时调用；每15秒轮询刷新 |
| /core/evaluation/task/update | PUT | 更新任务信息 | task.ts:68 → task/index.tsx:123 | 评测任务→任务首页→重命名→确认时调用 |
| /core/evaluation/task/delete | DELETE | 删除评测任务 | task.ts:60 → task/index.tsx:138 | 评测任务→任务首页→删除→确认弹窗确认时调用 |
| /core/evaluation/task/start | POST | 启动评测任务 | task.ts:92 | 后端自动触发（任务创建后自动开始执行） |
| /core/evaluation/task/stop | POST | 停止评测任务 | task.ts:100 | 后端管理操作 |
| /core/evaluation/task/stats | GET | 获取评测统计信息 | task.ts:108 → taskPageContext.tsx:231 | 评测任务→任务详情→加载时调用；每15秒轮询刷新 |
| /core/evaluation/task/retryFailed | POST | 重试失败项 | task.ts:116 → task/index.tsx:205, taskPageContext.tsx:339 | 评测任务→任务首页→重试异常数据→点击时调用；任务详情→异常Tab→重试→点击时调用 |

### `/core/evaluation/task/list` 调用链

```
task/index.tsx (EvaluationTasks)
  ├── 触发: 页面加载、搜索关键词变化(500ms防抖)、应用筛选变化、分页切换
  ├── 参数: { pageNum, pageSize, searchKey?, appId? }
  └── 响应处理: 更新 tasks 数组和 total，驱动表格渲染

taskPageContext.tsx (不直接调用，通过 Context 间接使用)
```

### `/core/evaluation/task/create` 调用链

```
CreateModal.tsx
  ├── 触发: 用户填写任务名、选择应用/版本/数据集/维度后点击确认
  ├── 参数: { name, evalDatasetCollectionId, target: { type, config: { appId, versionId } }, evaluators: [{ metric, runtimeConfig }] }
  └── 响应处理: 成功→关闭弹窗→刷新任务列表
```

### `/core/evaluation/task/detail` 调用链

```
taskPageContext.tsx (loadEvaluationDetail)
  ├── 触发: 进入任务详情页时加载；后续每15秒自动轮询
  ├── 参数: { evalId }
  └── 响应处理: 更新 evaluationDetail 状态（含 status、metricNames、target 等）

taskPageContext.tsx (loadTaskDetail)
  ├── 触发: 进入任务详情页时首次加载
  ├── 参数: { evalId }
  └── 响应处理: 更新 taskDetail 状态，失败时跳转回任务列表
```

### `/core/evaluation/task/stats` 调用链

```
taskPageContext.tsx (runLoadStats)
  ├── 触发: 进入任务详情页时加载；后续每15秒自动轮询
  ├── 参数: { evalId }
  └── 响应处理: 更新 statsData（total, completed, error, belowThreshold），驱动 NavBar 标签数据展示
```

## 评测项管理

| API 路径 | 方法 | 用途 | 调用位置 | 调用场景 |
|---------|------|------|---------|---------|
| /core/evaluation/task/item/list | POST | 获取评测项列表 | task.ts:150 → task/detail/index.tsx:197 | 评测任务→任务详情→数据列表加载时调用；搜索/翻页/Tab切换时调用 |
| /core/evaluation/task/item/update | PUT | 更新评测项 | task.ts:134 → taskPageContext.tsx:329 | 评测任务→任务详情→编辑问题/预期回复→保存时调用 |
| /core/evaluation/task/item/delete | DELETE | 删除评测项 | task.ts:126 → taskPageContext.tsx:314 | 评测任务→任务详情→删除评测项→确认时调用 |
| /core/evaluation/task/item/retry | POST | 重试单个评测项 | task.ts:158 → taskPageContext.tsx:320 | 评测任务→任务详情→重试单项→点击时调用 |
| /core/evaluation/task/item/detail | GET | 获取评测项详情 | task.ts:142 | （预留接口，当前前端未直接调用） |
| /core/evaluation/task/item/export | POST | 导出评测数据 | taskPageContext.tsx:396 | 评测任务→任务详情→导出→点击时调用 |

### `/core/evaluation/task/item/list` 调用链

```
task/detail/index.tsx (Detail)
  ├── 触发: 页面加载、搜索关键词变化(500ms防抖)、Tab切换、滚动加载更多
  ├── 参数: { evalId, offset, pageSize: 20, userInput?, status?, belowThreshold? }
  └── 响应处理: 更新 evaluationItems 数组，驱动数据列表和详情面板渲染

smartRefreshData (Detail)
  ├── 触发: 智能轮询（15秒间隔，仅刷新已选中项所在页及之前的数据）
  ├── 参数: { evalId, offset, pageSize: 20, ...scrollParams }
  └── 响应处理: 逐页加载选中项之前的数据，合并后更新列表
```

## 评测总结

| API 路径 | 方法 | 用途 | 调用位置 | 调用场景 |
|---------|------|------|---------|---------|
| /core/evaluation/summary/detail | GET | 获取总结报告 | task.ts:168 → taskPageContext.tsx:259 | 评测任务→任务详情→加载时调用；每15秒轮询刷新 |
| /core/evaluation/summary/config/detail | GET | 获取任务配置详情 | task.ts:184 → ConfigParams.tsx:90 | 评测任务→任务详情→评分设置→弹窗打开时加载 |
| /core/evaluation/summary/config/update | POST | 更新评分配置 | task.ts:176 → ConfigParams.tsx:213 | 评测任务→任务详情→评分设置→修改后确认时调用 |
| /core/evaluation/summary/create | POST | 生成指定指标的总结 | task.ts:192 → taskPageContext.tsx:346 | 评测任务→任务详情→刷新评分→点击时调用 |
