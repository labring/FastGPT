---
capability_label: 评测任务首页
doc_type: "12"
doc_label: API索引
generated_at: "2026-06-18T00:00:00.000Z"
parent_module: 评测任务
roles: ["admin", "team_member"]
router_paths: ["/dashboard/evaluation/task"]
---

# 评测任务首页 — API索引

## 任务列表查询

| API 路径 | 方法 | 用途 | 调用位置 | 调用场景 |
|---------|------|------|---------|---------|
| `/core/evaluation/task/list` | POST | 获取评测任务分页列表（含实时状态和统计） | `web/core/evaluation/task.ts:85` → `pages/dashboard/evaluation/task/index.tsx:60` | 评测任务首页→进入页面时调用；评测任务首页→搜索/筛选时调用；评测任务首页→翻页时调用；评测任务首页→创建/编辑/删除后刷新时调用 |

## 任务管理

| API 路径 | 方法 | 用途 | 调用位置 | 调用场景 |
|---------|------|------|---------|---------|
| `/core/evaluation/task/update` | PUT | 更新评测任务信息（重命名） | `web/core/evaluation/task.ts:68` → `pages/dashboard/evaluation/task/index.tsx:123` | 评测任务首页→操作菜单→重命名→确认修改时调用 |
| `/core/evaluation/task/delete` | DELETE | 删除评测任务及其关联数据 | `web/core/evaluation/task.ts:60` → `pages/dashboard/evaluation/task/index.tsx:138` | 评测任务首页→操作菜单→删除→确认删除时调用 |
| `/core/evaluation/task/retryFailed` | POST | 重新执行任务中所有失败的评测项 | `web/core/evaluation/task.ts:116` → `pages/dashboard/evaluation/task/index.tsx:205` | 评测任务首页→操作菜单→重试失败项→点击时调用 |

## 创建任务

| API 路径 | 方法 | 用途 | 调用位置 | 调用场景 |
|---------|------|------|---------|---------|
| `/core/evaluation/task/create` | POST | 创建评测任务，自动创建评测项并启动 | `web/core/evaluation/task.ts:52` → `pageComponents/dashboard/evaluation/task/CreateModal.tsx:335` | 评测任务首页→创建新任务→填写表单→提交时调用 |

---

## API 调用链追踪

### `POST /core/evaluation/task/list` 调用链

```
EvaluationTasks (pages/dashboard/evaluation/task/index.tsx)
  ├── 触发: 组件挂载 / searchValue/appFilter 变更 / 翻页 / fetchData() 手动刷新
  ├── 参数: { pageNum, pageSize, searchKey, appId }
  ├── 适配层: getEvaluationListAdapter 将 PaginationProps 转为 ListEvaluationsRequest
  ├── 响应处理: 更新 tasks 列表、total 总数；Pagination 组件更新页码状态
  └── 错误处理: usePagination 内部处理，EmptyTip 兜底

CreateModal (pageComponents/dashboard/evaluation/task/CreateModal.tsx)
  ├── 触发: 获取应用最近使用的数据集（getLastUsedDataset）
  ├── 参数: { pageNum:1, pageSize:1, appId }
  └── 响应处理: 取结果 list[0].evalDatasetCollectionId 自动填充数据集字段
```

### `PUT /core/evaluation/task/update` 调用链

```
EvaluationTasks (pages/dashboard/evaluation/task/index.tsx)
  ├── 触发: 用户通过 EditTitleModal 确认修改任务名称
  ├── 参数: { evalId, name }
  ├── 封装: onUpdateTaskName(evalId, newName) → putUpdateEvaluation({ evalId, name })
  └── 响应处理: onSuccess → fetchData() 刷新列表
```

### `DELETE /core/evaluation/task/delete` 调用链

```
EvaluationTasks (pages/dashboard/evaluation/task/index.tsx)
  ├── 触发: 用户通过 ConfirmModal 确认删除
  ├── 参数: { evalId }
  ├── 封装: handleDeleteTask(evalId) → onDeleteEvaluation(evalId) → deleteEvaluation(evalId)
  ├── 后端流程: 事务中清理评估项队列 → 清理总结队列 → 删除评估项 → 删除评估记录
  └── 响应处理: onSuccess → fetchData() 刷新列表
```

### `POST /core/evaluation/task/retryFailed` 调用链

```
EvaluationTasks (pages/dashboard/evaluation/task/index.tsx)
  ├── 触发: 操作菜单中点击"重试失败项"（仅当 statistics.error > 0 可见）
  ├── 参数: { evalId }
  └── 响应处理: .then(() => fetchData()) 刷新列表；.catch() 打印错误日志
```

### `POST /core/evaluation/task/create` 调用链

```
CreateModal (pageComponents/dashboard/evaluation/task/CreateModal.tsx)
  ├── 触发: 用户填写完整表单后提交（handleSubmitForm → createTask）
  ├── 参数: { name, evalDatasetCollectionId, target: { type, config: { appId, versionId } }, evaluators: [{ metric, runtimeConfig }] }
  ├── 前端校验: 任务名称非空；每个需要模型的维度已配置模型
  ├── 响应处理: onSuccess → 调用父组件 onSubmit 回调（fetchData 刷新列表）→ 关闭弹窗
  └── 错误处理: successToast/errorToast 展示操作结果
```

---

## API 分组汇总

| 分组 | API 数量 | 涉及 API |
|------|---------|---------|
| 查询/列表 | 1 | POST /core/evaluation/task/list |
| 创建 | 1 | POST /core/evaluation/task/create |
| 更新 | 1 | PUT /core/evaluation/task/update |
| 删除 | 1 | DELETE /core/evaluation/task/delete |
| 批量操作 | 1 | POST /core/evaluation/task/retryFailed |
