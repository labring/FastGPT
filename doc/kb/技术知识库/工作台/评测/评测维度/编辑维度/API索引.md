---
capability_label: 编辑维度
doc_type: "12"
doc_label: API索引
generated_at: 2026-06-18T12:00:00.000Z
parent_module: 评测维度
roles: [hasEvaluationCreatePer]
router_paths: [/dashboard/evaluation/dimension/edit]
---

# 编辑维度 — API索引

> 编辑维度页面的全部 API 调用均定义于 `projects/app/src/web/core/evaluation/dimension.ts`。

## API 总览表

### 详情查询

| API 路径 | 方法 | 用途 | 调用位置 | 调用场景 |
|---------|------|------|---------|---------|
| `/core/evaluation/metric/detail` | GET | 获取维度详情数据，填充编辑表单 | `projects/app/src/web/core/evaluation/dimension.ts:30` → `projects/app/src/pages/dashboard/evaluation/dimension/edit.tsx:36` | 评测→评测维度→编辑维度→页面加载时→根据 URL 参数 `id` 获取维度数据→`onSuccess` 填充表单默认值 |

### 更新操作

| API 路径 | 方法 | 用途 | 调用位置 | 调用场景 |
|---------|------|------|---------|---------|
| `/core/evaluation/metric/update` | PUT | 提交编辑后的维度信息 | `projects/app/src/web/core/evaluation/dimension.ts:49` → `projects/app/src/pages/dashboard/evaluation/dimension/edit.tsx:98` | 评测→评测维度→编辑维度→表单验证通过→点击"保存"按钮→提交更新→成功跳转回评测首页 |

### 调试运行

| API 路径 | 方法 | 用途 | 调用位置 | 调用场景 |
|---------|------|------|---------|---------|
| `/core/evaluation/metric/debug` | POST | 试运行维度评分，验证评估效果 | `projects/app/src/web/core/evaluation/dimension.ts:70` → `projects/app/src/pageComponents/dashboard/evaluation/dimension/TestRun.tsx:122` | 评测→评测维度→编辑维度→试运行弹窗→填写测试用例并选择模型→点击"开始运行"→调用评测调试接口→展示评分和反馈 |

## API 调用链追踪

### `/core/evaluation/metric/detail` 调用链

```
DimensionEdit 页面组件 (edit.tsx)
  ├── 触发: 页面加载，useEffect 通过 router.query.id 获取 dimensionId (edit.tsx:60-73)
  ├── 调用: fetchDimensionData(id) → useRequest 封装的异步函数 (edit.tsx:34-57)
  │     └── 调用 getMetricDetail(id) → GET /core/evaluation/metric/detail?metricId={id} (dimension.ts:30-31)
  ├── 参数: { metricId: string }
  ├── 前置条件: dimensionId 存在（从 URL query 参数获取）
  └── 响应处理:
        ├── 成功 → setDimensionData({ name, description, prompt }) → EditForm 接收 defaultValues 渲染表单
        └── 失败 → toast 错误提示 + router.push 跳回评测首页
```

### `/core/evaluation/metric/update` 调用链

```
DimensionEdit 页面组件 (edit.tsx)
  ├── 触发: 用户点击"保存"按钮，按钮的 form="evaluation-dimension-form" 触发表单提交 (edit.tsx:168-176)
  ├── 调用链: EditForm onSubmit → DimensionEdit.onSubmit (edit.tsx:117) → updateDimension(data) (edit.tsx:94-115)
  │     └── 调用 putUpdateMetric({ metricId, name, description, prompt }) → PUT /core/evaluation/metric/update (dimension.ts:49-55)
  ├── 参数: { metricId: string, name: string, description: string, prompt: string }
  ├── 前置校验: dimensionId 非空（edit.tsx:96）; EditForm 内部校验 name、prompt 非空后 isFormValid=true 才启用按钮
  └── 响应处理:
        ├── 成功 → toast "更新成功" + router.push /dashboard/evaluation?evaluationTab=dimensions
        └── 失败 → useRequest 默认错误处理（toast 显示错误信息）
```

### `/core/evaluation/metric/debug` 调用链

```
DimensionEdit 页面组件 (edit.tsx)
  └── 传递 currentFormData 和 isOpen/onClose 给 TestRun 子组件 (edit.tsx:180)

TestRun 试运行弹窗组件 (TestRun.tsx)
  ├── 触发: 用户在试运行弹窗中填写问题/参考答案/实际答案，选择模型后点击"开始运行"按钮 (TestRun.tsx:258)
  ├── 调用: handleStartRun → useCallback 异步函数 (TestRun.tsx:86-143)
  │     └── 调用 postDebugMetric({ evalCase, llmConfig, metricConfig }) → POST /core/evaluation/metric/debug (dimension.ts:70-75)
  ├── 参数:
  │     ├── evalCase: { userInput: question, expectedOutput: referenceAnswer, actualOutput: actualAnswer }
  │     ├── llmConfig: { modelId: selectedModel }
  │     └── metricConfig: { metricName: formData.name, metricType: 'custom', prompt: formData.prompt }
  ├── 前置校验:
  │     ├── formData.prompt 为空 → toast "提示词不能为空"，提前返回
  │     ├── selectedModel 未选择 → toast "请选择模型"，提前返回
  │     └── 按钮 disabled 条件（前端 UI 层面）: question/referenceAnswer/actualAnswer/selectedModel 任一为空
  └── 响应处理:
        ├── 成功 → setTestResult({ score, status:'success', feedback: reason 或 "暂无反馈" })
        │         界面展示: 状态标签（绿色成功）、分数（百分比）、反馈文本
        └── 失败 → setTestResult({ score:0, status:'error', feedback: 错误信息 })
                   界面展示: 状态标签（红色失败）、错误详情
```

## 分组规则

| 分组 | 包含 API | 划分依据 |
|------|---------|---------|
| 详情查询 | `getMetricDetail` (GET `/core/evaluation/metric/detail`) | 页面初始化阶段，读取现有维度数据用于表单回填 |
| 更新操作 | `putUpdateMetric` (PUT `/core/evaluation/metric/update`) | 用户编辑完成后的数据持久化操作，为编辑维度的核心动作 |
| 调试运行 | `postDebugMetric` (POST `/core/evaluation/metric/debug`) | 辅助性操作，在保存前验证评估 Prompt 效果，非必需流程但属于编辑页面的完整能力 |
