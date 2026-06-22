---
capability_label: 评测维度
doc_type: "16"
doc_label: Hooks工具函数
generated_at: "2026-06-18T12:00:00.000Z"
parent_module: 评测首页
roles: [管理员, 团队成员]
router_paths:
  - /dashboard/evaluation?evaluationTab=dimensions
---

# 评测维度 — Hooks工具函数

## API 请求函数（`web/core/evaluation/dimension.ts`）

| 导出函数 | 用途 | 对外共享 | 使用者 |
|---------|------|---------|--------|
| `getMetricList` | 获取评估维度列表（POST 请求） | 是 | 评测维度列表页、评测任务管理维度弹窗 |
| `getMetricDetail` | 获取单个维度详情（GET 请求） | 否 | 评测维度编辑页 |
| `postCreateMetric` | 创建自定义评估维度（POST 请求） | 否 | 评测维度创建页 |
| `putUpdateMetric` | 更新自定义评估维度（PUT 请求） | 否 | 评测维度编辑页 |
| `deleteMetric` | 删除自定义评估维度（DELETE 请求） | 否 | 评测维度列表页 |
| `postDebugMetric` | 自定义维度试运行调试（POST 请求） | 否 | 测试运行弹窗 |

## 内置维度工具函数（`web/core/evaluation/utils/index.ts`）

| 导出函数/常量 | 用途 | 对外共享 | 使用者 |
|-------------|------|---------|--------|
| `BUILTIN_DIMENSION_MAP` | 内置维度信息映射表，包含 6 种内置维度（answer_correctness、answer_similarity、answer_relevancy、faithfulness、context_recall、context_precision）的 i18n 名称和描述 key | 是 | 评测任务模块 |
| `getBuiltinDimensionInfo` | 根据维度名称查询 BUILTIN_DIMENSION_MAP，返回对应国际化信息 | 是 | 评测任务（CreateModal、ManageDimension、ConfigParams、EvaluationSummaryCard 等） |
| `getBuiltinDimensionNameFromId` | 去除维度 ID 中的 `builtin_` 前缀，返回原始维度名称 | 是 | 评测任务模块、评测维度列表 |
| `getBuiltinDimensionIdFromName` | 为维度名称添加 `builtin_` 前缀，生成内置维度标准 ID | 是 | 评测任务模块 |
| `getBuiltinDimensionEnglishInfo` | 获取内置维度的英文名称和描述（用于下发给后台 API） | 是 | 评测任务模块 |
| `formatScoreToPercentage` | 将 0-1 的分数转换为百分比整数（Math.round(score * 100)） | 是 | 评测任务模块 |

## 维度模板常量（`pageComponents/dashboard/evaluation/dimension/constants/evaluationTemplates.ts`）

| 导出 | 用途 | 对外共享 |
|------|------|---------|
| `DIMENSION_LIST` | 8 种引用模板维度类型数组：correctness、conciseness、harmfulness、controversiality、creativity、criminality、depth、detail | 否（仅被 CitationTemplate 使用） |
| `DimensionType` | 维度模板类型联合类型 | 否 |
| `CHINESE_DIMENSION_TEMPLATES` | 中文评分模板内容映射（每种维度类型对应一段完整的中文评估 prompt） | 否 |
| `ENGLISH_DIMENSION_TEMPLATES` | 英文评分模板内容映射 | 否 |
| `getDimensionTemplates` | 根据语言标志返回中文或英文模板映射 | 否（仅被 CitationTemplate 使用） |

## 使用的公共 Hooks

本模块通过 `import` 使用以下共享 Hooks（非本模块定义）：

| Hook | 来源 | 用途 |
|------|------|------|
| `useRequest` | `@fastgpt/web/hooks/useRequest` | 管理异步 API 请求的 loading/data/error 状态 |
| `useConfirm` | `@fastgpt/web/hooks/useConfirm` | 管理删除确认弹窗 |
| `useToast` | `@fastgpt/web/hooks/useToast` | 显示操作结果 Toast 提示 |
| `useTranslation` | `next-i18next` | 获取国际化翻译函数 |
| `useSystemStore` | `@/web/common/system/useSystemStore` | 获取系统级状态（模型列表、功能开关） |
| `useRouter` | `next/router` | 路由跳转和参数读取 |
| `useForm` / `useFieldArray` | `react-hook-form` | 表单状态管理和校验 |
| `useDisclosure` | `@chakra-ui/react` | 管理弹窗的开/关状态 |
| `useState` / `useEffect` / `useMemo` / `useCallback` / `useRef` | `react` | React 标准 Hooks |
