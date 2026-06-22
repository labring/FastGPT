---
capability_label: "评测维度首页"
doc_type: "12"
doc_label: "API索引"
generated_at: "2026-06-18T10:30:00.000Z"
parent_module: "评测维度"
roles: []
router_paths:
  - "/dashboard/evaluation?evaluationTab=dimensions"
---

# 评测维度首页 — API索引

## 维度查询

| API 路径 | 方法 | 用途 | 调用位置 | 调用场景 |
|---------|------|------|---------|---------|
| `/core/evaluation/metric/list` | POST | 获取评测维度列表 | `@/web/core/evaluation/dimension.ts:23` → `pages/.../dimension/index.tsx:46` | 评测维度首页→查看维度列表→页面加载时自动调用；评测维度首页→删除维度成功后→刷新列表时调用 |

## 维度删除

| API 路径 | 方法 | 用途 | 调用位置 | 调用场景 |
|---------|------|------|---------|---------|
| `/core/evaluation/metric/delete` | DELETE | 删除自定义评测维度 | `@/web/core/evaluation/dimension.ts:63` → `pages/.../dimension/index.tsx:93` | 评测维度首页→删除自定义维度→确认弹窗确认后调用 |

## API 调用链追踪

### `POST /core/evaluation/metric/list` 调用链

```
EvaluationDimensions（页面组件）
  ├── 触发: 页面加载时自动调用（useRequest manual: false）
  ├── 参数: {}（空对象，无筛选条件）
  ├── 响应处理: data.list → setAllDimensions；内置维度通过 getBuiltinDimensionNameFromId + getBuiltinDimensionInfo 取 i18n key → t() 翻译
  ├── 加载状态: isLoading → MyBox 显示遮罩
  └── 错误处理: useRequest 内置错误 Toast

EvaluationDimensions（同一组件）
  ├── 触发: 删除维度成功后回调 onSuccess
  ├── 参数: {}（同上）
  └── 响应处理: 同首次加载，静默刷新列表
```

### `DELETE /core/evaluation/metric/delete` 调用链

```
EvaluationDimensions（页面组件）
  ├── 触发: 用户在删除确认弹窗中点击「确认」
  ├── 参数: { metricId: string }（被删除维度的 _id）
  ├── 响应处理: 成功 → Toast「删除成功」+ 自动调用 getMetricList 刷新列表
  ├── 错误处理: 失败 → Toast「删除失败」
  └── 前置条件: 仅自定义维度（type === custom_metric）显示删除按钮
```
