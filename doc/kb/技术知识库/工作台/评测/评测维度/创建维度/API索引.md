---
capability_label: 创建维度
doc_type: "12"
doc_label: "API索引"
generated_at: "2026-06-18T10:30:00.000Z"
parent_module: 评测维度
roles: ["admin", "team_member"]
router_paths: ["/dashboard/evaluation/dimension/create"]
---

# 创建维度 — API索引

## 维度创建

| API 路径 | 方法 | 用途 | 调用位置 | 调用场景 |
|---------|------|------|---------|---------|
| `/core/evaluation/metric/create` | POST | 创建评估维度 | `projects/app/src/web/core/evaluation/dimension.ts:38` → `projects/app/src/pages/dashboard/evaluation/dimension/create.tsx:48` | 评测→评测维度→创建维度→点击"确认创建"提交时调用 |

### `/core/evaluation/metric/create` 调用链

```
DimensionCreate (create.tsx:46)
  ├── 触发: 用户点击"确认创建"按钮
  ├── 参数: { name: 维度名称, description: 维度描述, prompt: 评估提示词 }
  └── 响应处理: 成功 → toast "维度创建成功" + router.push 跳转评测首页；失败 → 按钮恢复可用
```

## 维度调试

| API 路径 | 方法 | 用途 | 调用位置 | 调用场景 |
|---------|------|------|---------|---------|
| `/core/evaluation/metric/debug` | POST | 试运行评估维度 | `projects/app/src/web/core/evaluation/dimension.ts:70` → `projects/app/src/pageComponents/dashboard/evaluation/dimension/TestRun.tsx:122` | 评测→评测维度→创建维度→试运行弹窗→点击"运行"按钮时调用 |

### `/core/evaluation/metric/debug` 调用链

```
TestRun (TestRun.tsx:86)
  ├── 触发: 用户在试运行弹窗中点击"开始运行"按钮
  ├── 参数: { evalCase: { 用户输入, 期望输出, 实际输出 }, llmConfig: { modelId }, metricConfig: { metricName, metricType, prompt } }
  ├── 前置校验: prompt 为空 → toast "提示词不能为空"；modelId 未选择 → toast "请选择模型"
  └── 响应处理: 成功 → setTestResult({ score, status:'success', feedback: 评分反馈 })；失败 → setTestResult({ score:0, status:'error', feedback: 错误信息 })
```
