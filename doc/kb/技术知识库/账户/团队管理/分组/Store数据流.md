---
capability_label: 分组
doc_type: "14"
doc_label: Store数据流
generated_at: "2026-06-18T12:00:00.000Z"
parent_module: 团队管理
roles: ["team_owner", "team_admin", "group_owner", "group_admin", "group_member"]
router_paths: ["/account/team?teamTab=group"]
---

## 说明

本模块无独立 Store（未检测到状态管理模块定义）。

模块的状态管理通过以下方式实现：
- 使用全局 Store：`useUserStore`（用户信息、团队权限）、`useSystemStore`（系统配置/套餐计划）
- 通过 React Context：`TeamContext`（团队编辑数据、团队人数）— 由父模块团队管理注入
- 通过组件内部状态（useState）管理局部 UI 状态（如当前编辑的分组、搜索关键词、已选成员等）
- 使用 `useRequest` hook 管理 API 请求状态（loading、data、refresh）
