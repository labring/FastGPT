---
capability_label: 账单
doc_type: "14"
doc_label: Store数据流
generated_at: "2026-06-18T12:00:00.000Z"
parent_module: 账户
roles: [团队管理员]
router_paths: [/account/bill]
---

## 说明

本模块无独立 Store（未检测到状态管理模块定义）。

模块的状态管理通过以下方式实现：
- 使用全局 Store：`useUserStore`（用户信息/权限）、`useSystemStore`（系统配置 `feConfigs`）——定义在外部模块
- 各组件使用 React `useState` 管理局部状态（如 Tab 切换状态、弹窗开关、选中项等）
- 通过 URL query 参数（`invoiceTab`）在 Tab 间共享当前活跃 Tab 状态
