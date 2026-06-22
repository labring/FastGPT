---
capability_label: 首页
doc_type: "14"
doc_label: Store数据流
generated_at: "2026-06-18T11:00:00Z"
parent_module: 对话首页
roles: ["Plus版用户"]
router_paths: ["/chat?pane=HOME"]
---

# 首页 — Store数据流

## 涉及 Store 概览

| Store | 来源 | 在首页中的用途 |
|-------|------|-------------|
| `useChatStore` | `@/web/core/chat/context/useChatStore` | 管理当前 appId、chatId、outLinkAuthData；控制最近使用的应用记录 |
| `useUserStore` | `@/web/support/user/useUserStore` | 获取当前登录用户信息、头像 |
| `useSystemStore` | `@/web/common/system/useSystemStore` | 获取系统配置（feConfigs）、模型列表（llmModelList）、默认模型 |

## useChatStore — 对话状态

### 读取字段

| 字段 | 类型 | 说明 |
|------|------|------|
| `chatId` | `string` | 当前对话 ID，用于 API 请求和对话历史关联 |
| `appId` | `string` | 当前应用 ID，决定使用哪个应用的工作流 |
| `outLinkAuthData` | `object` | 外链鉴权数据，传入 ChatBox 用于发布渠道访问 |

### 数据流方向

```
ChatPageContextProvider
  ├── 初始化: setSource('online'), setAppId(routeAppId)
  ├── 路由变化: setAppId(routeAppId) （useEffect 同步）
  └── 面板切换: setLastPane(), setLastChatAppId()

HomeChatWindow（读取）
  ├── chatId → 传入 ChatBox（对话标识）
  ├── appId → 传入 ChatBox，用于 getInitChatInfo 和 onStartChat
  └── outLinkAuthData → 传入 ChatBox
```

### 关键依赖：onChangeGlobalAppId

`HomeChatWindow` 通过 `ChatContext.onChangeAppId` 切换应用：
- 切换到快速应用时：更新全局 appId → 触发 `getInitChatInfo` 重新拉取数据
- 切回首页默认时：使用 `homeAppId`（`chatSettings.appId`）

## useUserStore — 用户状态

### 读取字段

| 字段 | 类型 | 说明 |
|------|------|------|
| `userInfo` | `UserType` | 当前登录用户信息，其中的 `avatar` 用于 API 响应合并 |

### 数据流方向

```
ChatPageContextProvider
  └── 初始化: initUserInfo() → setUserInfo

HomeChatWindow（读取）
  └── userInfo.avatar → 合并到 chatBoxData 的 userAvatar 字段
```

## useSystemStore — 系统配置

### 读取字段

| 字段 | 类型 | 说明 |
|------|------|------|
| `llmModelList` | `LLMModelItemType[]` | 可用模型列表，用于构建模型选择器选项 |
| `defaultModels` | `{llm?: {id, name}}` | 默认模型，用于模型选择器的初始值 |
| `feConfigs` | `FeConfigsType` | 系统功能配置，其中 `isPlus` 控制首页可见性；`systemTitle` 用于页面标题 |

### 数据流方向

```
HomeChatWindow（读取）
  ├── llmModelList → 构建 availableModels 选项列表（{value: id, label: name}）
  ├── defaultModels.llm?.id → 模型选择器默认值
  └── feConfigs
        ├── isPlus → 控制首页面板可见性（useMount 中自动跳转 TEAM_APPS）
        ├── isPlus → 控制 getInitChatInfo 的 refreshDeps
        └── systemTitle → NextHead 页面标题
```

## localStorage 持久化状态

| Key | 类型 | 默认值 | 说明 |
|-----|------|-------|------|
| `chat_home_model` | `string` | `defaultModels.llm?.id` | 用户上次选择的模型 ID |
| `chat_home_tools` | `string[]` | `[]` | 用户上次选择的工具 ID 列表 |

这两个值通过 `useLocalStorageState` 管理，在页面刷新后保持用户的选择。

**数据流**：

```
HomeChatWindow
  ├── selectedModel = useLocalStorageState('chat_home_model')
  │     ├── 读取: 模型选择器初始值
  │     └── 写入: 选择模型时 setSelectedModel(model)
  └── selectedToolIds = useLocalStorageState('chat_home_tools')
        ├── 读取: 工具多选初始值
        └── 写入: 勾选/取消工具时 setSelectedToolIds(ids)
```
