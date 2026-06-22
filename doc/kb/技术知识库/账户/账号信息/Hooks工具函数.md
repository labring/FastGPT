---
capability_label: 账号信息
doc_type: "16"
doc_label: Hooks工具函数
generated_at: "2026-06-18T12:00:00.000Z"
parent_module: 账户
roles: ["普通成员", "团队管理员", "团队拥有者"]
router_paths: ["/account/info"]
---

# 账号信息 — Hooks工具函数

## 说明

本模块未检测到自有 Hooks/Composables/Utils/Constants 目录或导出函数。模块内使用的工具函数均来自外部共享模块。

- 状态管理逻辑参见 [Store数据流](./Store数据流.md)
- 组件信息参见 [组件列表](./组件列表.md)

## 消费的外部 Hooks

| Hook/工具 | 源模块 | 用途 |
|----------|--------|------|
| `useUserStore` | `@/web/support/user/useUserStore` | 用户信息和团队状态管理 |
| `useSystemStore` | `@/web/common/system/useSystemStore` | 系统配置功能开关 |
| `useToast` | `@fastgpt/web/hooks/useToast` | Toast 消息提示 |
| `useSystem` | `@fastgpt/web/hooks/useSystem` | PC/移动端判断 |
| `useRequest` | `@fastgpt/web/hooks/useRequest` | 异步请求封装（loading/error状态） |
| `useUploadAvatar` | `@fastgpt/web/common/file/hooks/useUploadAvatar` | 头像上传逻辑封装 |
| `formatStorePrice2Read` | `@fastgpt/global/support/wallet/usage/tools` | 价格格式化（分→元） |
| `formatTime2YMD` | `@fastgpt/global/common/string/time` | 时间格式化 |
