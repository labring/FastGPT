---
capability_label: 评测维度
doc_type: "12"
doc_label: API索引
generated_at: "2026-06-18T12:00:00.000Z"
parent_module: 评测
roles:
  - 团队管理员
  - 团队成员（有评测权限）
router_paths:
  - /dashboard/evaluation?evaluationTab=dimensions
  - /dashboard/evaluation/dimension/create
  - /dashboard/evaluation/dimension/edit
---

# 评测维度 — API索引

> 评测维度为分组节点，本文档汇总所有子能力使用的 API。API 定义统一位于 `projects/app/src/web/core/evaluation/dimension.ts`。

## 查询/列表

| API 路径 | 方法 | 用途 | 调用位置 | 调用场景 |
|---------|------|------|---------|---------|
| `/core/evaluation/metric/list` | POST | 获取评估维度分页列表 | `src/web/core/evaluation/dimension.ts:22` → `pages/.../dimension/index.tsx:46` | 评测→评测维度Tab→加载时调用；维度列表渲染 |

## 详情

| API 路径 | 方法 | 用途 | 调用位置 | 调用场景 |
|---------|------|------|---------|---------|
| `/core/evaluation/metric/detail` | GET | 获取单个维度详情 | `src/web/core/evaluation/dimension.ts:30` → `pages/.../dimension/edit.tsx:36` | 评测→评测维度→编辑维度→加载时调用；获取维度数据填充表单 |

## 创建

| API 路径 | 方法 | 用途 | 调用位置 | 调用场景 |
|---------|------|------|---------|---------|
| `/core/evaluation/metric/create` | POST | 创建自定义评测维度 | `src/web/core/evaluation/dimension.ts:38` → `pages/.../dimension/create.tsx:48` | 评测→评测维度→创建维度→提交表单时调用 |

## 更新

| API 路径 | 方法 | 用途 | 调用位置 | 调用场景 |
|---------|------|------|---------|---------|
| `/core/evaluation/metric/update` | PUT | 更新自定义评测维度 | `src/web/core/evaluation/dimension.ts:49` → `pages/.../dimension/edit.tsx:98` | 评测→评测维度→编辑维度→保存修改时调用 |

## 删除

| API 路径 | 方法 | 用途 | 调用位置 | 调用场景 |
|---------|------|------|---------|---------|
| `/core/evaluation/metric/delete` | DELETE | 删除自定义评测维度 | `src/web/core/evaluation/dimension.ts:62` → `pages/.../dimension/index.tsx:93` | 评测→评测维度Tab→确认删除弹窗→确认时调用 |

## 调试/试运行

| API 路径 | 方法 | 用途 | 调用位置 | 调用场景 |
|---------|------|------|---------|---------|
| `/core/evaluation/metric/debug` | POST | 试运行维度评分 | `src/web/core/evaluation/dimension.ts:70` → `pageComponents/.../dimension/TestRun.tsx:122` | 评测→评测维度→创建/编辑维度→试运行弹窗→点击开始运行时调用 |

## API 调用链追踪

### `/core/evaluation/metric/list` 调用链

```
EvaluationDimensions 组件
  ├── 触发: 评测首页加载，evaluationTab=dimensions
  ├── 参数: ListMetricsBody（分页/筛选，当前传入空对象 {}）
  └── 响应处理: 解构 data.list 存入 allDimensions state → useMemo 处理内置维度国际化 → useMemo 前端搜索过滤 → 渲染表格
```

### `/core/evaluation/metric/detail` 调用链

```
DimensionEdit 组件
  ├── 触发: 页面加载，通过 router.query.id 获取 dimensionId
  ├── 参数: { metricId: string }
  └── 响应处理: 数据填充到 dimensionData state → EditForm 的 defaultValues → 表单渲染
```

### `/core/evaluation/metric/create` 调用链

```
DimensionCreate 组件
  ├── 触发: 用户点击提交按钮（form="evaluation-dimension-form"），通过 EditForm 的 onSubmit 回调触发
  ├── 参数: { name, description, prompt }
  │         校验: name 非空、prompt 非空（前端校验）
  └── 响应处理: 成功 → toast 提示 "创建成功" → 路由跳转回 /dashboard/evaluation?evaluationTab=dimensions
```

### `/core/evaluation/metric/update` 调用链

```
DimensionEdit 组件
  ├── 触发: 用户点击保存按钮（form="evaluation-dimension-form"），通过 EditForm 的 onSubmit 回调触发
  ├── 参数: { metricId, name, description, prompt }
  └── 响应处理: 成功 → toast 提示 "更新成功" → 路由跳转回 /dashboard/evaluation?evaluationTab=dimensions
```

### `/core/evaluation/metric/delete` 调用链

```
EvaluationDimensions 组件
  ├── 触发: 用户点击维度行删除图标 → useConfirm 弹出确认框 → 用户确认
  ├── 参数: metricId（作为 URL query 或 body）
  └── 响应处理: 成功 → toast 提示 "删除成功" → 重新调用 getMetricList 刷新列表
               失败 → toast 提示 "删除失败"
```

### `/core/evaluation/metric/debug` 调用链

```
TestRun 组件
  ├── 触发: 用户点击"开始运行"按钮
  ├── 前置校验: prompt 非空、已选择模型、问题/参考答案/实际答案均已填写
  ├── 参数: { evalCase: { userInput, expectedOutput, actualOutput }, llmConfig: { modelId }, metricConfig: { metricName, metricType, prompt } }
  └── 响应处理: 成功 → 显示 score（百分比）、feedback（评分理由）；失败 → 显示错误提示
```
