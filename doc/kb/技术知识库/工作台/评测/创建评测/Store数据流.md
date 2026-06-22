---
capability_label: 创建评测
doc_type: "14"
doc_label: Store数据流
generated_at: "2026-06-18T10:20:00.000Z"
parent_module: 评测
roles: [admin]
router_paths: ["/dashboard/evaluation/create"]
---

## 说明

本模块无独立 Store（未检测到模块专属状态管理定义）。

模块使用的状态来自全局 Store：
- `useSystemStore` — 获取 LLM 模型列表（`llmModelList`），用于评测模型选择器的数据源
- `useSystemStore` — 积分不足时调用 `setNotSufficientModalType` 触发弹窗

表单状态通过 `react-hook-form` 的 `useForm` 在组件内部管理，不经过全局 Store。
