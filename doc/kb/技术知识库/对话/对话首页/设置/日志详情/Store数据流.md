---
capability_label: 日志详情
doc_type: "14"
doc_label: Store数据流
generated_at: "2026-06-18T10:30:00Z"
parent_module: 设置
roles: [管理员]
router_paths: ["/chat?pane=s&tab=l"]
---

## 说明

本模块无独立 Store（未检测到本模块范围内的 Zustand/Pinia/Redux 状态管理模块定义）。

模块的状态管理通过以下方式实现：
- 使用 `LogsContext`（React Context）管理日志筛选状态（日期范围、对话来源、搜索关键词、用户筛选、列配置等），定义于 `@/pageComponents/app/detail/Logs/context.tsx`
- 使用 `ChatPageContext`（React Context）获取应用设置信息（含 appId），定义于 `@/web/core/chat/context/chatPageContext.tsx`
- 使用 `useLocalStorageState`（ahooks）持久化日志列配置到浏览器本地存储
- 日志列配置同时支持从团队后端同步（通过 `getLogKeys` API）
