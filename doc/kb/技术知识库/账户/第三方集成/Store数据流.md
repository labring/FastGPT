---
capability_label: "第三方集成"
doc_type: "14"
doc_label: "Store数据流"
generated_at: "2026-06-18T12:00:00.000Z"
parent_module: "账户"
roles: ["owner", "member"]
router_paths: ["/account/thirdParty"]
---

# 账户 — 第三方集成 Store 数据流

## 说明

本模块无独立 Store（未检测到状态管理模块定义）。

模块的状态管理通过以下方式实现：
- 使用共享基础设施的 Store：`useSystemStore`（读取系统配置 `feConfigs`）和 `useUserStore`（读取/刷新团队第三方配置 `userInfo.team`）
- 通过 `react-hook-form` 的 `useForm` 管理表单局部状态
- 通过 `useRequest` 管理异步请求状态和自动刷新
- 配置成功后通过 `initUserInfo()` 刷新全局 Store，驱动页面级数据（usage、卡片状态）的更新
