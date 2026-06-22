---
capability_label: 编辑维度
doc_type: "14"
doc_label: Store数据流
generated_at: 2026-06-18T12:00:00.000Z
parent_module: 评测维度
roles: [hasEvaluationCreatePer]
router_paths: [/dashboard/evaluation/dimension/edit]
---

## 说明

本模块无独立 Store（未检测到状态管理模块定义）。

模块的状态管理通过以下方式实现：
- 使用 `useSystemStore`（`@/web/common/system/useSystemStore`）获取 LLM 模型列表，供 TestRun 组件中的 AIModelSelector 使用
- 使用 `useUserStore`（`@/web/support/user/useUserStore`）获取用户信息和权限
- 编辑表单状态通过 `useForm`（react-hook-form）本地管理
- 网络请求状态通过 `useRequest` Hook 管理
- 页面级状态（isFormValid、isTestRunOpen、dimensionData 等）通过 `useState` 本地管理

组件信息参见 [组件列表](./组件列表.md)。
