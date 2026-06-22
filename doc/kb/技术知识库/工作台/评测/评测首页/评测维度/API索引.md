---
capability_label: 评测维度
doc_type: "12"
doc_label: API索引
generated_at: "2026-06-18T12:00:00.000Z"
parent_module: 评测首页
roles: [管理员, 团队成员]
router_paths:
  - /dashboard/evaluation?evaluationTab=dimensions
  - /dashboard/evaluation/dimension/create
  - /dashboard/evaluation/dimension/edit
---

# 评测维度 — API 索引

## API 定义文件

本模块的 API 函数定义在 `projects/app/src/web/core/evaluation/dimension.ts`，使用统一的 HTTP 请求封装（`GET`/`POST`/`PUT`/`DELETE` 来自 `@/web/common/api/request`）。

---

## 维度查询与列表

| API 路径 | 方法 | 用途 | 调用位置 | 调用场景 |
|---------|------|------|---------|---------|
| `/core/evaluation/metric/list` | POST | 获取评估维度列表 | `dimension.ts:22` → `dimension/index.tsx:46`<br>`dimension.ts:22` → `task/ManageDimension.tsx:254` | 评测维度→维度列表→Tab 激活加载时调用；评测任务→管理维度弹窗→打开弹窗时调用 |

## 维度详情

| API 路径 | 方法 | 用途 | 调用位置 | 调用场景 |
|---------|------|------|---------|---------|
| `/core/evaluation/metric/detail` | GET | 获取单个维度详情 | `dimension.ts:30` → `dimension/edit.tsx:36` | 评测维度→编辑维度→页面加载时调用（根据路由 query.id 获取维度数据回填表单） |

## 维度创建

| API 路径 | 方法 | 用途 | 调用位置 | 调用场景 |
|---------|------|------|---------|---------|
| `/core/evaluation/metric/create` | POST | 创建自定义评估维度 | `dimension.ts:38` → `dimension/create.tsx:48` | 评测维度→创建维度→提交创建表单时调用 |

## 维度更新

| API 路径 | 方法 | 用途 | 调用位置 | 调用场景 |
|---------|------|------|---------|---------|
| `/core/evaluation/metric/update` | PUT | 更新自定义评估维度 | `dimension.ts:49` → `dimension/edit.tsx:98` | 评测维度→编辑维度→保存修改时调用 |

## 维度删除

| API 路径 | 方法 | 用途 | 调用位置 | 调用场景 |
|---------|------|------|---------|---------|
| `/core/evaluation/metric/delete` | DELETE | 删除自定义评估维度 | `dimension.ts:62` → `dimension/index.tsx:93` | 评测维度→维度列表→删除确认弹窗确认后调用 |

## 维度调试

| API 路径 | 方法 | 用途 | 调用位置 | 调用场景 |
|---------|------|------|---------|---------|
| `/core/evaluation/metric/debug` | POST | 自定义维度试运行 | `dimension.ts:70` → `dimension/TestRun.tsx:122` | 评测维度→创建/编辑维度→测试运行弹窗→点击开始运行时调用 |

---

## API 调用链追踪

### `POST /core/evaluation/metric/list` 调用链

```
EvaluationDimensions (dimension/index.tsx)
  ├── 触发: 切换到评测维度 Tab 后自动加载；搜索框值变化不触发
  ├── 参数: {}（空对象，当前版本无筛选参数）
  └── 响应处理: setAllDimensions(data.list || []) 存储全量数据；processedDimensions 通过 useMemo 将内置维度的名称和描述转为国际化版本；filteredDimensions 在此基础上做前端搜索过滤

ManageDimension (task/ManageDimension.tsx)
  ├── 触发: 管理维度弹窗打开（isOpen 变为 true）
  ├── 参数: {}（空对象）
  └── 响应处理: 将 metric 转为 Dimension 类型，合并已选中的维度，同步到表单字段数组
```

### `GET /core/evaluation/metric/detail` 调用链

```
DimensionEdit (dimension/edit.tsx)
  ├── 触发: 编辑页面加载，dimensionId 从 router.query.id 解析
  ├── 参数: { metricId: dimensionId }
  └── 响应处理: setDimensionData({ name, description, prompt }) 用于 EditForm 的 defaultValues 回填；失败时 Toast 错误提示后返回列表页
```

### `POST /core/evaluation/metric/create` 调用链

```
DimensionCreate (dimension/create.tsx)
  ├── 触发: 用户点击「确认创建」按钮，name 和 prompt 前端校验通过
  ├── 参数: { name, description, prompt }
  └── 响应处理: 成功 → Toast 成功提示 → router.push 跳转到维度列表；失败 → 停留在创建页
```

### `PUT /core/evaluation/metric/update` 调用链

```
DimensionEdit (dimension/edit.tsx)
  ├── 触发: 用户点击「保存」按钮
  ├── 参数: { metricId, name, description, prompt }
  └── 响应处理: 成功 → Toast 成功提示 → router.push 跳转到维度列表；失败 → 停留在编辑页
```

### `DELETE /core/evaluation/metric/delete` 调用链

```
EvaluationDimensions (dimension/index.tsx)
  ├── 触发: 用户在确认弹窗点击确认后
  ├── 参数: { metricId }
  └── 响应处理: 成功 → fetchAllDimensions() 重新加载列表；失败 → Toast 错误提示
```

### `POST /core/evaluation/metric/debug` 调用链

```
TestRun (dimension/TestRun.tsx)
  ├── 触发: 用户在测试运行弹窗中点击「开始运行」按钮，表单校验通过
  ├── 参数: { evalCase: { userInput, expectedOutput, actualOutput }, llmConfig: { modelId }, metricConfig: { metricName, metricType: "custom", prompt } }
  └── 响应处理: 成功 → setTestResult({ score, status: "success", feedback })；展示分数（百分比）+ 反馈文本；失败 → setTestResult({ status: "error", feedback: 错误信息 })
```

---

## 请求参数类型定义（摘要）

API 入参和出参类型定义在 `@fastgpt/global/core/evaluation/metric/api` 和 `@fastgpt/global/core/evaluation/metric/type` 中：

| API | 请求体类型 | 响应类型 |
|-----|-----------|---------|
| list | `ListMetricsBody` | `PaginationResponse<EvalMetricDisplayType>` |
| detail | `{ metricId: string }` (query) | `EvalMetricSchemaType` |
| create | `CreateMetricBody` | `Pick<EvalMetricSchemaType, '_id' \| 'name' \| 'description' \| 'createTime' \| 'updateTime'>` |
| update | `UpdateMetricBody` | `Pick<EvalMetricSchemaType, '_id' \| 'name' \| 'description' \| 'type' \| 'createTime' \| 'updateTime'>` |
| delete | `{ metricId: string }` (query) | 无特定类型 |
| debug | `DebugMetricBody` | `{ score: number; reason?: string; usages?: any[] }` |
