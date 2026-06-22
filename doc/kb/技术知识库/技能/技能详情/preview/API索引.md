---
capability_label: "预览调试"
doc_type: "12"
doc_label: "API索引"
generated_at: "2026-06-18T10:35:00.000Z"
parent_module: "技能详情"
roles: ["owner", "collaborator"]
router_paths: []
---

# 预览调试 — API索引

## 技能调试会话

| API 路径 | 方法 | 用途 | 调用位置 | 调用场景 |
|---------|------|------|---------|---------|
| `/api/core/agentSkills/debugChat` | POST（流式） | 发送技能调试消息，获取流式 AI 回复 | `useSkillChatTest.tsx:80` → `ChatBox` | 技能详情→预览Tab→发送消息时调用 |
| `/api/core/agentSkills/debugSession/records` | POST | 获取调试会话的历史对话记录（分页） | `SkillPreview.tsx:103` → `ChatRecordContextProvider` | 技能详情→预览Tab→加载历史/向上滚动翻页时调用 |
| `/api/core/agentSkills/debugSession/chatItem/delete` | POST | 删除调试会话中的单条对话消息 | `useSkillChatTest.tsx:99` → `ChatBox`（重新生成时） | 技能详情→预览Tab→重新生成某条消息时调用 |

## 技能沙箱同步

| API 路径 | 方法 | 用途 | 调用位置 | 调用场景 |
|---------|------|------|---------|---------|
| `/api/core/agentSkills/syncSandbox` | POST | 同步技能最新配置到沙箱环境 | `useSkillChatTest.tsx:69`（syncSkillSandbox） | 技能详情→预览Tab→每次发送消息前自动调用 |

## 系统配置

| API 路径 | 方法 | 用途 | 调用位置 | 调用场景 |
|---------|------|------|---------|---------|
| 系统 LLM 模型列表 | —（通过 useSystemStore 获取） | 获取可用 AI 模型列表 | `SkillPreview.tsx:21`（useSystemStore） | 技能详情→预览Tab→加载时获取；用于填充模型选择器 |

---

## API 调用链追踪

### `/api/core/agentSkills/syncSandbox` 调用链

```
useSkillChatTest → startChat()
  ├── 触发: 用户发送消息时
  ├── 前置: flushAllPendingRef.current() — 先保存编辑器中待保存的内容
  ├── 参数: { skillId }
  ├── 成功: 继续执行后续的 debugChat 请求
  └── 失败: toast 警告提示（标题: "skill:preview_sync_failed_title"，内容: 错误详情文本）
```

### `/api/core/agentSkills/debugChat` 调用链

```
useSkillChatTest → startChat() → streamFetch()
  ├── 触发: sandbox 同步完成后
  ├── 参数: { skillId, chatId, messages（最近一条）, modelId, responseChatItemId }
  ├── 流式处理: onMessage → generatingMessage（逐字流式更新 UI）
  ├── 中止控制: abortCtrl → controller（支持用户中止生成）
  └── 返回: { responseText } — 完整回复文本
```

### `/api/core/agentSkills/debugSession/records` 调用链

```
SkillPreview Render → ChatRecordContextProvider → skillFetchFn()
  ├── 触发: 首次加载聊天区域 + 向上滚动翻页时
  ├── 参数: { skillId, chatId, pageSize, initialId / nextId / prevId }
  ├── 分页模式: 双向游标分页（支持向前/向后翻页）
  └── 返回: { list, total, hasMorePrev, hasMoreNext }
```

### `/api/core/agentSkills/debugSession/chatItem/delete` 调用链

```
useSkillChatTest → handleDeleteChatItem() → delSkillDebugChatItem()
  ├── 触发: ChatBox 中用户点击重新生成（需先删除旧消息）
  ├── 参数: { skillId, chatId, contentId }
  └── 说明: 使用技能专属删除接口，避免走通用 /api/core/chat/item/delete 用 skillId 查 App 报错
```
