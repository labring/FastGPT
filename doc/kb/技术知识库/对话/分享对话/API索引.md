---
capability_label: "分享对话"
doc_type: "12"
doc_label: "API索引"
generated_at: "2026-06-18T10:05:00.000Z"
parent_module: "对话"
roles: ["匿名用户", "认证用户"]
router_paths: ["/chat/share"]
---

# 分享对话 — API索引

## 查询/初始化

| API 路径 | 方法 | 用途 | 调用位置 | 调用场景 |
|---------|------|------|---------|---------|
| `/core/chat/outLink/init` | GET | 获取分享链接聊天初始化数据（应用配置、变量、欢迎语等） | `web/core/chat/api.ts:33` → `pages/chat/share.tsx:146` | 分享对话→页面加载→身份确认后调用；分享对话→切换对话→切换 chatId 时重新调用 |
| `/core/chat/init` | GET | 获取聊天初始化信息（用于权限验证） | `web/core/chat/api.ts:31` → `pages/chat/share.tsx:518,540` | 分享对话→强制认证模式→登录后验证应用权限时调用 |

## 流式对话

| API 路径 | 方法 | 用途 | 调用位置 | 调用场景 |
|---------|------|------|---------|---------|
| `/api/v2/chat/completions` | POST | 发送对话消息并获取流式 AI 回复（SSE） | `web/common/api/fetch.ts:558` → `pages/chat/share.tsx:212` | 分享对话→用户输入消息→发送对话请求时调用 |
| `/api/v2/chat/completions`（恢复） | POST | 恢复未完成的流式对话（断点续传） | `web/common/api/fetch.ts:603` → `ChatBox` 自动触发 | 分享对话→页面加载→检测到未完成对话→自动恢复流式连接 |

## 登录与身份

| API 路径 | 方法 | 用途 | 调用位置 | 调用场景 |
|---------|------|------|---------|---------|
| `getTokenLogin` | POST | 通过 token 自动登录 | `web/support/user/api.ts` → `pages/chat/share.tsx:515` | 分享对话→强制认证模式→页面加载时尝试自动登录 |

---

## API 调用链追踪

### `/core/chat/outLink/init` 调用链

```
share.tsx (OutLink 组件)
  ├── 触发: 页面加载，outLinkAuthData 就绪后自动调用
  ├── 参数: { chatId, shareId, outLinkUid }
  └── 响应处理:
      ├── setChatBoxData(res) — 设置 ChatBox 初始数据
      ├── resetVariables({ variables: {...formatedCustomVariables, ...res.variables} }) — 合并变量
      └── onFinally: 清除 forbidLoadChatMap 标记
```

### `/api/v2/chat/completions` 调用链

```
share.tsx (startChat 回调)
  ├── 触发: 用户在 ChatBox 中输入消息并发送
  ├── 参数:
  │   ├── messages: [当前轮次消息]
  │   ├── variables: { ...formValues, ...customVariables, cTime }
  │   ├── chatId: completionChatId
  │   ├── shareId, outLinkUid (outLinkAuthData)
  │   ├── detail: true, stream: true
  │   └── retainDatasetCite: isShowCite
  ├── 响应处理 (onMessage):
  │   ├── 流式文本追加到对话列表
  │   ├── 中间状态（工具调用、思考等）接入展示
  │   └── 完成后 postMessage('shareChatFinish') (iframe 模式)
  └── 完成后:
      ├── 新对话: onChangeChatId 切换
      └── onUpdateHistoryTitle 更新标题
```

### `/core/chat/init` 调用链

```
share.tsx (AutoLoginChecker)
  ├── 触发: allowAnonymous === false 时登录成功后
  ├── 参数: { appId, chatId (nanoid) }
  └── 响应处理:
      ├── 成功 → setIsConfirmed(true) 进入对话
      └── 失败 (code >= 502000) → toast 提示"无权限访问该应用"
```
