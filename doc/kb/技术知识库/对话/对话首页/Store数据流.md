---
capability_label: 对话首页
doc_type: "14"
doc_label: Store数据流
generated_at: "2026-06-18T10:30:00Z"
parent_module: 对话
roles: ["全部角色"]
router_paths: ["/chat"]
---

# 对话首页 — Store数据流

## Store 概览

| Store 文件 | Store ID | 用途 |
|-----------|---------|------|
| `src/web/core/chat/context/useChatStore.ts` | `useChatStore` | 对话级全局状态：appId、chatId、source、面板记忆 |
| `src/web/core/chat/context/chatPageContext.tsx` | `ChatPageContext` | 对话页面级状态：面板切换、折叠、用户信息、最近应用 |

### useChatStore — `src/web/core/chat/context/useChatStore.ts`

> Zustand + immer + persist 实现。sessionStorage 存储敏感字段（source、chatId、appId），localStorage 存储持久字段（lastChatId、lastChatAppId、lastPane）。支持跨 Tab localStorage 事件同步。

#### State

| 字段 | 类型 | 说明 |
|------|------|------|
| `source` | `ChatSourceEnum` | 对话来源（online/share/team） |
| `appId` | `string` | 当前对话的应用 ID |
| `lastChatAppId` | `string` | 上次使用的应用 ID（跨 Tab 持久化） |
| `chatId` | `string` | 当前对话 ID（24 位 nanoid） |
| `lastChatId` | `string` | 上次对话 ID（`{source}-{chatId}` 格式） |
| `lastPane` | `ChatSidebarPaneEnum` | 上次激活的面板 |
| `outLinkAuthData` | `OutLinkChatAuthProps` | 外链鉴权数据 |

#### Actions

| Action | 参数 | 说明 | 调用的 API |
|--------|------|------|-----------|
| `setSource` | `e: ChatSourceEnum` | 设置对话来源，来源变更时重置 chatId，恢复上次 appId | 无 |
| `setAppId` | `e: string` | 设置应用 ID，同步更新 lastChatAppId | 无 |
| `setChatId` | `e?: string` | 设置对话 ID，自动生成 lastChatId | 无 |
| `setLastPane` | `e: ChatSidebarPaneEnum` | 记录上次激活面板（跨页面对话恢复用） | 无 |
| `setLastChatAppId` | `e: string` | 设置上次应用 ID | 无 |
| `setOutLinkAuthData` | `e: OutLinkChatAuthProps` | 设置外链鉴权数据 | 无 |

### ChatPageContext — `src/web/core/chat/context/chatPageContext.tsx`

> React Context 实现，由 ChatPageContextProvider 提供。管理对话页面的 UI 状态和用户上下文。

#### State

| 字段 | 类型 | 说明 |
|------|------|------|
| `pane` | `ChatSidebarPaneEnum` | 当前激活的面板（HOME/TEAM_APPS/FAVORITE_APPS/RECENTLY_USED_APPS/SETTING） |
| `collapse` | `CollapseStatusType`（0\|1） | 侧边栏折叠状态（0=展开，1=折叠） |
| `chatSettings` | `ChatSettingType` | 对话首页设置（Plus版），含首页应用、快捷应用列表 |
| `isInitedUser` | `boolean` | 用户信息是否初始化完成 |
| `userInfo` | `UserType` | 当前用户信息 |
| `myApps` | `GetRecentlyUsedAppsResponseType` | 最近使用应用列表 |

#### Actions / 操作方法

| 操作 | 参数 | 说明 | 调用的 API |
|------|------|------|-----------|
| `handlePaneChange` | `pane, _id?, _tab?` | 切换面板，更新 URL query | `router.replace` |
| `onTriggerCollapse` | 无 | 切换侧边栏折叠状态 | 无 |
| `refreshChatSetting` | 无 | 刷新对话首页设置 | `GET /proApi/core/chat/setting/detail` |
| `refreshRecentlyUsed` | 无 | 刷新最近使用应用列表 | `GET /core/chat/recentlyUsed` |

## 数据流向

### 页面初始化流程

```
ChatPageContextProvider                 useChatStore              API
     │                                      │                      │
     │  setAppId(routeAppId)                │                      │
     ├─────────────────────────────────────►│                      │
     │                                      │                      │
     │  initUserInfo()                      │                      │
     ├─────────────────────────────────────────────────────────────►│
     │  ◄── userInfo ─────────────────────────────────────────────┤
     │                                      │                      │
     │  setSource('online')                 │                      │
     ├─────────────────────────────────────►│                      │
     │                                      │                      │
     │  isInitedUser = true                 │                      │
     │                                      │                      │
     │  getRecentlyUsedApps()               │                      │
     ├─────────────────────────────────────────────────────────────►│
     │  ◄── myApps[] ─────────────────────────────────────────────┤
     │                                      │                      │
     │  getChatSetting() [Plus only]        │                      │
     ├─────────────────────────────────────────────────────────────►│
     │  ◄── chatSettings ─────────────────────────────────────────┤
     │                                      │                      │
     │  auto-redirect if enableHome=false   │                      │
     │  or appId mismatch                   │                      │
```

### 面板切换流程

```
User                   ChatPageContext              useChatStore                 Router
  │                         │                            │                          │
  │  点击侧边栏导航           │                            │                          │
  ├────────────────────────►│                            │                          │
  │                         │  handlePaneChange(pane, id)│                          │
  │                         ├───────────────────────────►│                          │
  │                         │                            │  setLastPane(pane)       │
  │                         │                            │  setLastChatAppId(id)    │
  │                         │                            │                          │
  │                         │  router.replace({query})                               │
  │                         ├───────────────────────────────────────────────────────►│
  │                         │                            │                          │
  │  页面更新（URL参数变更）    │                            │                          │
  │  主内容区切换面板组件       │                            │                          │
  │  侧边栏高亮切换           │                            │                          │
```

## 组件间通信模式

| 通信模式 | 场景 | 涉及组件 |
|---------|------|---------|
| Context 共享状态 | 面板状态（pane）→ 所有子组件条件渲染 | ChatPageContextProvider → Chat → HomeChatWindow / ChatFavouriteApp / ChatTeamApp / AppChatWindow / ChatSetting |
| Context 共享状态 | 用户信息 → 鉴权判断 | ChatPageContext → ChatContent（isInitedUser / userInfo） |
| Zustand Store 共享 | 应用 ID 跨组件同步 | useChatStore ← ChatPageContextProvider, ChatContextProvider, 各对话窗口 |
| URL 路由参数 | 面板切换同步 | ChatPageContext → Next.js Router（pane / appId / tab query） |
| Props 传递 | 发布配置项 → 各级 Context Provider | ChatContent → ChatItemContextProvider（showRunningStatus 等） |
| localStorage 跨 Tab 同步 | chatStore 持久化字段同步 | useChatStore → window.storage 事件监听 |
