---
capability_label: 最近使用
doc_type: "12"
doc_label: API索引
generated_at: "2026-06-18T10:30:00.000Z"
parent_module: 对话首页
roles: [所有登录用户]
router_paths: [/chat]
---

# 最近使用 — API索引

## 查询/列表

| API 路径 | 方法 | 用途 | 调用位置 | 调用场景 |
|---------|------|------|---------|---------|
| /api/core/chat/recentlyUsed | GET | 获取当前用户最近使用的应用列表（最多20个，按最后使用时间倒序） | `projects/app/src/web/core/chat/api.ts:25` → `projects/app/src/web/core/chat/context/chatPageContext.tsx:78` | 对话首页→侧边栏→加载时调用（初始化）；对话首页→侧边栏→30秒轮询刷新时调用；对话首页→完成对话后手动刷新时调用 |

## 对话初始化

| API 路径 | 方法 | 用途 | 调用位置 | 调用场景 |
|---------|------|------|---------|---------|
| /api/core/chat/init | GET | 获取聊天初始化数据（应用信息、变量、历史消息等） | `projects/app/src/web/core/chat/api.ts:31` → `projects/app/src/pageComponents/chat/ChatWindow/AppChatWindow.tsx:65` | 对话首页→最近使用→进入应用聊天窗口→加载时调用；切换应用时调用 |

## 说明

本模块的 API 定义复用父模块"对话首页"的共享 API 文件 `projects/app/src/web/core/chat/api.ts`，无独立的 API 定义文件。模块通过 `ChatPageContext` 的 `refreshRecentlyUsed` 方法间接触发 API 调用，实际的 HTTP 请求由 `useRequest` Hook 管理。

**核心 API**：
- 获取最近使用列表: `GET /api/core/chat/recentlyUsed`，无请求参数，返回 `[{appId, name, avatar}]`
- 初始化聊天信息: `GET /api/core/chat/init?appId={appId}&chatId={chatId}`

## API 调用链追踪

### `/api/core/chat/recentlyUsed` 调用链

```
ChatPageContextProvider
  ├── 触发: 页面挂载时自动调用 / 30秒轮询 / Chat 完成后手动 refresh
  ├── refreshDeps: [userInfo?.team?.tmbId]（用户团队信息变化时重新请求）
  ├── 参数: 无请求参数，后端通过 auth token 获取 tmbId
  ├── 节流: 500ms throttle
  ├── 响应处理: 更新 myApps 状态 → ChatSlider 消费 myApps 渲染列表
  └── 错误处理: 静默失败（errorToast: ''），不阻断页面

AppChatWindow
  ├── 触发: onStartChat 完成对话后调用 refreshRecentlyUsed()
  ├── 触发: 检测到未授权应用错误 (AppErrEnum.unAuthApp) 时调用 refreshRecentlyUsed()
  └── 效果: 侧边栏最近使用列表更新，将当前应用排到顶部
```

### `/api/core/chat/init` 调用链

```
AppChatWindow
  ├── 触发: 组件挂载时 / appId 或 chatId 变化时
  ├── 参数: { appId, chatId }
  ├── 响应处理: setChatBoxData(res) — 设置聊天窗口数据（应用信息、历史消息、变量）
  ├── 响应处理: resetVariables({ variables: res.variables, variableList: res.app?.chatConfig?.variables })
  ├── 前置条件: appId && chatId 存在且 forbidLoadChat.current 不为 true
  ├── 错误处理: 
  │   ├── 未授权对话 (ChatErrEnum.unAuthChat) → onChangeChatId() 切换对话
  │   └── 未授权应用 (AppErrEnum.unAuthApp) → refreshRecentlyUsed() + 切换到团队应用面板
  └── 最终: forbidLoadChat.current = false（解除加载禁止标记）
```
