---
capability_label: "分享对话"
doc_type: "14"
doc_label: "Store数据流"
generated_at: "2026-06-18T10:05:00.000Z"
parent_module: "对话"
roles: ["匿名用户", "认证用户"]
router_paths: ["/chat/share"]
---

# 分享对话 — Store数据流

## 模块专属 Store

### useShareChatStore

- **文件位置**: `projects/app/src/web/core/chat/storeShareChat.ts`
- **Store 类型**: Zustand（persist + immer + devtools）
- **持久化 key**: `shareChatStore`

#### 状态结构

| 字段 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `localUId` | `string \| undefined` | `undefined` | 本地用户唯一标识，用于匿名分享对话的身份追踪 |
| `loaded` | `boolean` | `false` | 持久化数据是否已从 localStorage 恢复 |

#### 操作方法

| 方法 | 签名 | 说明 |
|------|------|------|
| `setLocalUId` | `(localUId: string) => void` | 设置本地用户 UID |

#### 数据流

```
页面加载
  → useShareChatStore 从 localStorage 恢复 localUId
  → loaded = true
  → 检查 localUId 是否存在：
    ├── 不存在 → setLocalUId(`shareChat-${Date.now()}-${getNanoid(24)}`) 生成新 ID
    └── 存在 → 直接使用已有 localUId
  → localUId 作为 outLinkUid 传给 ChatContextProvider
  → 后端通过 outLinkUid 关联对话记录
```

#### 持久化策略

- `partialize` 仅持久化 `localUId` 字段（排除 `loaded` 和 `setLocalUId`）
- 通过 `localStorage` 存储，跨会话保持同一匿名用户身份

## 消费的外部 Store

| Store | 文件位置 | 使用方式 | 用途 |
|-------|---------|---------|------|
| `useChatStore` | `web/core/chat/context/useChatStore.ts` | `useChatStore()` | 管理聊天状态：source、appId、chatId、outLinkAuthData |
| `useSystemStore` | `web/common/system/useSystemStore.ts` | `useSystemStore()` | 读取系统配置 `feConfigs`（系统标题等） |
