---
capability_label: 对话
doc_type: "12"
doc_label: API索引
generated_at: "2026-06-18T10:30:00.000Z"
parent_module: null
roles: ["登录用户", "匿名用户", "团队成员"]
router_paths: ["/chat", "/chat/share"]
---

# 对话 — API索引

## 查询/初始化

| API 路径 | 方法 | 用途 | 调用位置 | 调用场景 |
|---------|------|------|---------|---------|
| `/api/core/chat/init` | GET | 初始化在线聊天（获取应用配置、对话历史、变量） | `src/web/core/chat/api.ts:31` → `HomeChatWindow.tsx`、`AppChatWindow.tsx` | 对话首页→首页自由对话→加载时调用；对话首页→最近使用应用对话→加载时调用 |
| `/api/core/chat/outLink/init` | GET | 初始化外链聊天（获取发布应用配置和对话历史） | `src/web/core/chat/api.ts:33` → `share.tsx:OutLink` | 分享对话→加载时调用 |
| `/api/core/chat/team/init` | GET | 初始化团队空间聊天 | `src/web/core/chat/api.ts:35` | 对话首页→团队应用对话→选择应用加载时调用 |
| `/api/core/chat/recentlyUsed` | GET | 获取最近使用的应用列表 | `src/web/core/chat/api.ts:25` | 对话首页→侧边栏最近使用→加载时调用 |

## 流式对话

| API 路径 | 方法 | 用途 | 调用位置 | 调用场景 |
|---------|------|------|---------|---------|
| `/api/v2/chat/completions` | POST | 发起流式对话（SSE），支持 detail 模式返回节点级响应 | `src/web/common/api/fetch.ts:557` → `HomeChatWindow.tsx`、`AppChatWindow.tsx`、`share.tsx:OutLink` | 对话首页→首页自由对话→发送消息时调用；对话首页→最近使用应用对话→发送消息时调用；分享对话→发送消息时调用 |
| `/api/proApi/core/chat/chatHome` | POST | 首页自由对话（含模型和工具选择，不依赖预配置应用） | `src/web/common/api/fetch.ts:557`（streamFetch 参数传入）→ `HomeChatWindow.tsx:onStartChat` | 对话首页→首页自由对话→非快捷应用发送消息时调用 |

## 对话控制

| API 路径 | 方法 | 用途 | 调用位置 | 调用场景 |
|---------|------|------|---------|---------|
| `/api/core/chat/stop` | POST | 停止正在生成的对话 | `src/web/core/chat/api.ts:60` | 对话首页/分享对话→用户点击停止生成时调用 |

## 会话管理

| API 路径 | 方法 | 用途 | 调用位置 | 调用场景 |
|---------|------|------|---------|---------|
| `/api/core/chat/history/markRead` | POST | 标记对话为已读 | ChatRecordContext → 内部调用 | 对话页→查看未读消息后自动标记 |
| `/api/core/chat/history/update` | POST | 更新对话标题或置顶状态 | ChatContext → 内部调用 | 对话页→发送第一条消息后自动生成标题 |
| `/api/core/chat/history/delete` | DELETE | 删除单个对话历史 | ChatHistorySidebar → 内部调用 | 对话页→侧边栏对话列表→右键菜单删除 |
| `/api/core/chat/history/clear` | DELETE | 清空某应用的全部对话历史 | ChatHistorySidebar → 内部调用 | 对话页→侧边栏→确认清空历史 |

## 对话设置（Plus 版）

| API 路径 | 方法 | 用途 | 调用位置 | 调用场景 |
|---------|------|------|---------|---------|
| `/api/proApi/core/chat/setting/detail` | GET | 获取对话首页设置（快捷应用、首页配置） | `src/web/core/chat/api.ts:39` → `ChatSetting` | 对话首页→对话设置→加载时调用 |
| `/api/proApi/core/chat/setting/update` | POST | 更新对话首页设置 | `src/web/core/chat/api.ts:41` → `ChatSetting` | 对话首页→对话设置→保存配置时调用 |
| `/api/proApi/core/chat/setting/favourite/list` | GET | 获取收藏应用列表 | `src/web/core/chat/api.ts:44` → `ChatSetting` | 对话首页→对话设置→快捷应用管理→加载时调用 |
| `/api/proApi/core/chat/setting/favourite/update` | POST | 批量更新收藏应用信息 | `src/web/core/chat/api.ts:47` → `ChatSetting` | 对话首页→对话设置→编辑快捷应用时调用 |
| `/api/proApi/core/chat/setting/favourite/order` | PUT | 更新收藏应用排序 | `src/web/core/chat/api.ts:50` → `ChatSetting` | 对话首页→对话设置→拖拽调整快捷应用顺序时调用 |
| `/api/proApi/core/chat/setting/favourite/tags` | PUT | 更新收藏应用标签 | `src/web/core/chat/api.ts:53` → `ChatSetting` | 对话首页→对话设置→修改快捷应用标签时调用 |
| `/api/proApi/core/chat/setting/favourite/delete` | DELETE | 删除收藏应用 | `src/web/core/chat/api.ts:56` → `ChatSetting` | 对话首页→对话设置→移除快捷应用时调用 |

## 助手功能

| API 路径 | 方法 | 用途 | 调用位置 | 调用场景 |
|---------|------|------|---------|---------|
| `/api/core/chat/assistant/getQuote` | POST | 获取知识库引用列表（按源类型分组） | `src/web/core/chat/api.ts:66` → `ChatQuoteList` | 对话页→点击引用标记→加载引用详情时调用 |
| `/api/core/chat/assistant/getRetrievalResults` | POST | 获取检索排序结果 | `src/web/core/chat/api.ts:72` → `ChatQuoteList` | 对话页→查看知识库检索结果时调用 |

## API 调用链追踪

### `/api/v2/chat/completions` 调用链

```
ChatBox（发送消息）
  ├── 触发: 用户在输入框输入内容并发送
  ├── 参数: messages（消息列表）、variables（变量）、appId、chatId、retainDatasetCite、showSkillReferences
  ├── 响应处理: SSE 流式解析 → 逐 token 更新 UI → 完成时更新对话标题和历史
  └── 错误处理: 网络异常→显示错误提示；abort→停止生成并保留已生成内容

HomeChatWindow（首页自由对话 — 快捷应用模式）
  ├── 触发: 用户在快捷应用输入框发送消息
  ├── 参数: messages、appId、chatId、variables
  └── 附加: 与 ChatBox 共享同一 streamFetch 调用路径

HomeChatWindow（首页自由对话 — 自由模式）
  ├── URL: /api/proApi/core/chat/chatHome
  ├── 触发: 用户在首页自由对话输入框发送消息
  ├── 参数: messages、appId、selectedModel、selectedTools、workflow form
  └── 响应处理: SSE 流式解析 → 逐 token 更新 UI → 完成时更新标题

OutLink share.tsx（分享对话）
  ├── 触发: 外部用户在分享页输入框发送消息
  ├── 参数: messages、outLinkAuthData（shareId + outLinkUid）、variables、retainDatasetCite
  ├── 响应处理: SSE 流式解析 → 逐 token 更新 → postMessage 通知父窗口（嵌入模式）
  └── 错误处理: 超时/网络异常→显示错误提示
```

### `/api/core/chat/init` 调用链

```
HomeChatWindow → getInitChatInfo
  ├── 触发: 切换应用（appId 变化）或对话ID变化时
  ├── 参数: appId, chatId
  └── 响应处理: 填充 ChatBox 数据（title、app 配置、variables） → 重置变量表单

AppChatWindow → getInitChatInfo
  ├── 触发: 从最近使用列表选择应用进入
  ├── 参数: appId, chatId
  └── 响应处理: 恢复历史对话 → 加载应用配置和聊天设置
```
