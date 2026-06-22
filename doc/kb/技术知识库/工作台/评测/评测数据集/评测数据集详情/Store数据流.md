---
capability_label: 评测数据集详情
doc_type: "14"
doc_label: "Store数据流"
generated_at: 2026-06-18T12:00:00+08:00
parent_module: 评测数据集
roles: []
router_paths: ["/dashboard/evaluation/dataset/detail"]
---

# 评测数据集详情 — Store 数据流

## 说明

本模块无独立 Store（未检测到状态管理模块定义）。

模块的状态管理通过以下方式实现：
- 使用 React Context（`DataListContext`、`DatasetDetailPageContext`）管理页面内共享状态
- 使用外部 `useSystemStore`（Zustand）获取 LLM 模型列表
- 通过 Props 和 Context 进行父子组件通信
