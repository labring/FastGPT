---
capability_label: "评测数据集首页"
doc_type: "14"
doc_label: "Store数据流"
generated_at: "2026-06-18T12:00:00.000Z"
parent_module: "评测数据集"
roles: ["团队成员"]
router_paths: ["/dashboard/evaluation/dataset"]
---

# 评测数据集首页 — Store数据流

## 说明

本模块无独立 Store（未检测到状态管理模块定义）。

模块的状态管理通过以下方式实现：
- 页面级状态使用 React useState 管理（searchValue、selectedDataset 等）
- 列表数据通过 usePagination Hook 管理（来自 @fastgpt/web/hooks/usePagination）
- 弹窗状态使用 Chakra UI useDisclosure Hook 管理
- 模型列表通过 useSystemStore 全局 Store 获取（仅在 IntelligentGeneration 子组件中使用）
- API 请求状态通过 useRequest Hook 管理
