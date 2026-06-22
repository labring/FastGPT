---
capability_label: 评测维度
doc_type: "14"
doc_label: Store数据流
generated_at: "2026-06-18T12:00:00.000Z"
parent_module: 评测首页
roles: [管理员, 团队成员]
router_paths:
  - /dashboard/evaluation?evaluationTab=dimensions
---

# 评测维度 — Store 数据流

## 说明

本模块无独立 Store（未检测到 Zustand 或 Context 状态管理模块定义）。

模块的状态管理通过以下方式实现：
- 使用系统级 Store：`useSystemStore` 获取 LLM 模型列表（`llmModelList`）、Embedding 模型列表（`embeddingModelList`）和功能开关（`feConfigs.show_evaluation`）
- 通过 React `useState` 管理组件局部状态（搜索值 `searchValue`、维度数据 `allDimensions`、表单数据等）
- 通过 `react-hook-form` 的 `useForm` / `useFieldArray` 管理表单状态
- 通过 Props 传递进行父子组件通信（如 `Tab` 组件从父页面传入）
- 使用 `@fastgpt/web/hooks/useRequest` 管理异步请求状态（loading、data、error）
