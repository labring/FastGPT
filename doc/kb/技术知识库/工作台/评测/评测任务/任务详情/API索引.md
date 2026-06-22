---
capability_label: 任务详情
doc_type: "12"
doc_label: API索引
generated_at: "2026-06-18T10:30:00Z"
parent_module: 评测任务
roles: ["团队成员"]
router_paths: ["/dashboard/evaluation/task/detail"]
---

# 任务详情 — API索引

## 评测任务核心 API

| API 路径 | 方法 | 用途 | 调用位置 | 调用场景 |
|---------|------|------|---------|---------|
| `/core/evaluation/task/detail` | GET | 获取评测任务详情（含实时状态和统计） | `task.ts:76` → `taskPageContext.tsx:429` | 评测→任务详情→页面初始化时调用；轮询每15秒调用 |
| `/core/evaluation/task/stats` | GET | 获取评测任务统计信息（总数/完成/错误/低于阈值数） | `task.ts:108` → `taskPageContext.tsx:231` | 评测→任务详情→页面初始化时调用；轮询每15秒调用 |

## 评测项（数据）API

| API 路径 | 方法 | 用途 | 调用位置 | 调用场景 |
|---------|------|------|---------|---------|
| `/core/evaluation/task/item/list` | POST | 获取评测项列表（分页） | `task.ts:150` → `task/detail/index.tsx:55`（通过 useScrollPagination） | 评测→任务详情→加载数据列表时调用；切换Tab过滤时调用；滚动加载更多时调用；搜索时调用；轮询智能刷新时调用 |
| `/core/evaluation/task/item/update` | PUT | 更新评测项（修改问题/参考答案） | `task.ts:134` → `taskPageContext.tsx:329` | 评测→任务详情→编辑数据→保存时调用 |
| `/core/evaluation/task/item/delete` | DELETE | 删除评测项 | `task.ts:126` → `taskPageContext.tsx:314` | 评测→任务详情→删除数据→确认后调用 |
| `/core/evaluation/task/item/retry` | POST | 重试单条评测项 | `task.ts:158` → `taskPageContext.tsx:320` | 评测→任务详情→重试单条→点击重试时调用 |

## 批量操作 API

| API 路径 | 方法 | 用途 | 调用位置 | 调用场景 |
|---------|------|------|---------|---------|
| `/core/evaluation/task/retryFailed` | POST | 批量重试所有失败评测项 | `task.ts:116` → `taskPageContext.tsx:338` | 评测→任务详情→错误数据Tab→点击重试按钮时调用 |

## 导出 API

| API 路径 | 方法 | 用途 | 调用位置 | 调用场景 |
|---------|------|------|---------|---------|
| `/api/core/evaluation/task/item/export` | POST | 导出评测数据为 CSV 文件 | `taskPageContext.tsx:396`（通过 downloadFetch） | 评测→任务详情→点击导出按钮时调用 |

## 评分总结 API

| API 路径 | 方法 | 用途 | 调用位置 | 调用场景 |
|---------|------|------|---------|---------|
| `/core/evaluation/summary/detail` | GET | 获取评测总结报告（含各维度评分） | `task.ts:168` → `taskPageContext.tsx:259` | 评测→任务详情→页面初始化时调用；轮询每15秒调用 |
| `/core/evaluation/summary/config/detail` | GET | 获取评分配置详情（阈值/权重/聚合方式） | `task.ts:184` → `ConfigParams.tsx:90` | 评测→任务详情→打开配置参数弹窗时调用 |
| `/core/evaluation/summary/config/update` | POST | 更新评分配置（阈值/权重/聚合方式） | `task.ts:176` → `ConfigParams.tsx:213` | 评测→任务详情→配置参数弹窗→确认保存时调用 |
| `/core/evaluation/summary/create` | POST | 触发生成评分总结报告 | `task.ts:192` → `taskPageContext.tsx:346` | 评测→任务详情→点击刷新评分时调用；维度总结卡片中点击重试生成时调用 |

## 外部依赖 API

| API 路径 | 方法 | 用途 | 调用位置 | 调用场景 |
|---------|------|------|---------|---------|
| `getAppDetailById` (应用详情接口) | GET | 获取关联应用的详情信息 | `@/web/core/app/api` → `taskPageContext.tsx:415` | 评测→任务详情→加载应用信息→用于基本信息面板显示 |
| `getChatResData` (对话响应接口) | GET | 获取对话完整响应数据 | `@/web/core/chat/record/api` → `DetailedResponseModal.tsx:29` | 评测→任务详情→查看完整响应弹窗→打开时调用 |

---

## API 调用链追踪

### `GET /core/evaluation/task/detail` 调用链

```
taskPageContext.loadTaskDetail()
  ├── 触发: 页面初始化 / 轮询调度
  ├── 参数: { evalId: taskId }
  ├── 响应: EvaluationDisplayType（含 name, status, evaluators, target, createTime, finishTime 等）
  ├── 状态更新: setTaskDetail(data)
  └── 错误处理: Toast 提示加载失败，跳转回评测任务列表

taskPageContext.runLoadEvaluationDetail()（轮询用）
  ├── 触发: loadAllData 中手动触发 / 轮询每 15 秒
  ├── 参数: { evalId: taskId }
  ├── 响应处理: setEvaluationDetail(data)
  └── 错误处理: 轮询静默失败（不显示 Toast），仅更新 error 状态
```

### `GET /core/evaluation/task/stats` 调用链

```
taskPageContext.runLoadStats()
  ├── 触发: loadAllData 中与 detail 并行请求 / 轮询每 15 秒
  ├── 参数: { evalId: taskId }
  ├── 响应: EvaluationStatsResponse（含 total, completed, evaluating, queuing, error, belowThreshold）
  ├── 状态更新: setStatsData(data)
  ├── 消费方: NavBar（显示标签计数）、详情页（判断是否全部失败/排队中/评测中）
  └── 错误处理: 轮询静默失败
```

### `POST /core/evaluation/task/item/list` 调用链

```
useScrollPagination(getEvaluationItemList)
  ├── 触发: 首次加载 / 滚动到底部 / 搜索值变化 / Tab 切换 / taskId 变化 / 轮询智能刷新
  ├── 参数: { evalId, offset, pageSize: 20, userInput?（搜索关键词）, status?（错误数据Tab）, belowThreshold?（问题数据Tab）}
  ├── 响应: { list: EvaluationItemDisplayType[], total: number }
  ├── 状态更新: setEvaluationItems（列表数据）、total（总数）
  ├── 排序: 按创建顺序
  └── 渲染: 动态表头（< 3 维度显示各维度名，≥ 3 显示"综合评分"列）
```

### `DELETE /core/evaluation/task/item/delete` 调用链

```
Detail.handleDelete()
  ├── 触发: 用户点击删除按钮 → PopoverConfirm 确认
  ├── 参数: { evalItemId }
  ├── 响应处理: 刷新列表和统计 → 调整选中索引（下一条或最后一条）
  ├── Toast: 成功"删除成功" / 失败"删除失败"
  └── 状态更新: 退出编辑模式、重置表单
```

### `PUT /core/evaluation/task/item/update` 调用链

```
Detail.handleSave()
  ├── 触发: 编辑模式下点击保存 → Popover 确认（含 modifyDataset 开关）
  ├── 参数: { evalItemId, userInput, expectedOutput, modifyDataset }
  ├── 响应处理: 刷新列表数据
  ├── Toast: 成功"保存成功" / 失败"保存失败"
  └── 状态更新: 退出编辑模式、关闭 Popover
```

### `POST /core/evaluation/task/item/retry` 调用链

```
Detail.handleRefresh()
  ├── 触发: 选中错误项 → 点击重试图标按钮
  ├── 参数: { evalItemId }
  ├── 响应处理: 刷新列表数据
  ├── Toast: 成功"重试请求已提交" / 失败"重试失败"
  └── 后续: 评测项重新入队，轮询自动更新状态
```

### `POST /core/evaluation/task/retryFailed` 调用链

```
Detail.handleRetryFailed()
  ├── 触发: 错误数据 Tab → 点击"重试"按钮
  ├── 参数: { evalId: taskId }
  ├── 响应处理: 自动跳转到全部数据 Tab（currentTab=allData）
  ├── Toast: 成功提示 / 失败"重试失败"
  └── 后续: useScrollPagination 响应 currentTab 变化自动刷新列表
```

### `POST /api/core/evaluation/task/item/export` 调用链

```
Detail.handleExport()
  ├── 触发: 点击顶部"导出"按钮
  ├── 参数: { evalId, filters（当前 Tab 过滤条件）, headers, metricColumns, statusLabelMap }
  ├── 方式: downloadFetch 直接触发浏览器下载
  ├── 文件名: evaluation_{任务名}_{日期}.csv
  ├── Toast: 成功"导出成功" / 失败"导出失败"
  └── 前置数据: 从 evaluationDetail 和 summaryData 构建导出列和状态映射
```

### `POST /core/evaluation/summary/create` 调用链

```
Detail.handleRefreshScore() / generateSummary()
  ├── 触发: 点击右侧面板刷新按钮
  ├── 参数: { evalId, metricIds }（从 summaryData.data 中提取所有 metricId）
  ├── 前置检查: summaryData 为空 → Toast 警告"无维度数据"
  ├── Toast: 成功"总结生成请求已提交" / 失败"生成总结失败"
  └── 后续: 刷新总结数据
```

### `POST /core/evaluation/summary/config/update` 调用链

```
ConfigParams.handleFormSubmit()
  ├── 触发: 配置弹窗中点击确认
  ├── 参数: { evalId, calculateType, metricsConfig: [{ metricId, thresholdValue, weight }] }
  ├── 前置校验: 有权重列且总和 ≠ 100 → 按钮置灰
  ├── Toast: 成功"保存成功" / 失败"保存失败"
  └── 后续: 关闭弹窗 → 触发 loadAllData 刷新
```
