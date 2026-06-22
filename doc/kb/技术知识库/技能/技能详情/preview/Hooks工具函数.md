---
capability_label: "预览调试"
doc_type: "16"
doc_label: "Hooks工具函数"
generated_at: "2026-06-18T10:35:00.000Z"
parent_module: "技能详情"
roles: ["owner", "collaborator"]
router_paths: []
---

# 预览调试 — Hooks工具函数

## Hooks

### `useSkillChatTest`

- **签名**: `function useSkillChatTest({ skillId, modelId, chatId, isReady }: { skillId: string; modelId: string; chatId: string; isReady?: boolean }): { ChatContainer: () => JSX.Element }`
- **用途**: 技能聊天测试 Hook，封装了沙箱同步、流式对话、消息删除的完整调试流程，返回一个可渲染的 ChatContainer 组件
- **是否对外共享**: 否（仅在 SkillPreview.tsx 中被引用）
- **返回值说明**：
  - `ChatContainer`: 一个 memoized 的 React 函数组件，渲染 ChatBox 聊天容器，绑定了技能调试特有的 `onStartChat` 和 `onDeleteChatItem` 回调

### 内部函数 `startChat`

- **签名**: `async function startChat({ messages, responseChatItemId, controller, generatingMessage }: StartChatFnProps): Promise<{ responseText: string }>`
- **用途**: 启动一次技能调试对话——先同步沙箱，再发送流式聊天请求，支持中止控制
- **是否对外共享**: 否（useSkillChatTest 内部函数）

### 内部函数 `handleDeleteChatItem`

- **签名**: `async function handleDeleteChatItem(contentId: string): Promise<void>`
- **用途**: 使用技能专属接口删除调试会话中的单条聊天消息，避免走通用聊天删除接口时用 skillId 查询 App 出错
- **是否对外共享**: 否（useSkillChatTest 内部函数）

## 常量

### `SKILL_DEBUG_CHAT_URL`

- **文件**: `projects/app/src/web/core/skill/api.ts:58`
- **类型**: `string`（常量）
- **说明**: 技能调试聊天的 API 端点路径 `/api/core/agentSkills/debugChat`，在 useSkillChatTest 中用于流式请求

### `CHAT_ID_STORAGE_KEY`

- **文件**: `projects/app/src/pageComponents/dashboard/skill/detail/preview/SkillPreview.tsx:75`
- **类型**: `(skillId: string) => string`
- **说明**: 生成 localStorage 中存储调试会话 chatId 的键名，格式为 `skill_debug_chatId_{skillId}`

## 工具函数

本模块未检测到独立的工具函数定义。通用的 ID 生成（`getNanoid`）和分页请求构造逻辑来自共享包 `@fastgpt/global` 和 `@fastgpt/web`。

## 函数依赖关系

- `useSkillChatTest` → `syncSkillSandbox`（来自 AgentSkillEditor 模块的 API）：每次发消息前同步沙箱
- `useSkillChatTest` → `streamFetch`（来自 `@/web/common/api/fetch`）：发起流式聊天请求
- `useSkillChatTest` → `delSkillDebugChatItem`（来自 `@/web/core/skill/api`）：删除调试消息
- `useSkillChatTest` → `SkillDetailContext`（来自 `../context`）：获取 flushAllPendingRef 引用
- `useSkillChatTest` → `ChatItemContext`（来自 `@/web/core/chat/context/chatItemContext`）：设置聊天区域数据
