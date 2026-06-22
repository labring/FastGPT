---
capability_label: 首页
doc_type: "12"
doc_label: API索引
generated_at: "2026-06-18T11:00:00Z"
parent_module: 对话首页
roles: ["Plus版用户"]
router_paths: ["/chat?pane=HOME"]
---

# 首页 — API索引

## 对话初始化

| API 路径 | 方法 | 用途 | 调用位置 | 调用场景 |
|---------|------|------|---------|---------|
| `/api/core/chat/init` | GET | 获取对话初始化信息（应用配置、变量、对话历史） | `src/web/core/chat/api.ts:31` → `HomeChatWindow.tsx:135` | 对话首页→首页面板→加载时调用；对话首页→首页面板→切换应用/模型时调用 |

## 对话发送

| API 路径 | 方法 | 用途 | 调用位置 | 调用场景 |
|---------|------|------|---------|---------|
| `/api/core/chat/completions`（快速应用路径） | POST | 使用快速应用工作流发送对话消息 | `src/web/common/api/fetch.ts:557` → `HomeChatWindow.tsx:215` | 对话首页→首页面板→快速应用模式→发送消息时调用 |
| `/api/proApi/core/chat/chatHome` | POST | 使用首页自定义模型和工具发送对话消息 | `src/web/common/api/fetch.ts:557` → `HomeChatWindow.tsx:264` | 对话首页→首页面板→自定义模式→发送消息时调用 |

## 工具预览

| API 路径 | 方法 | 用途 | 调用位置 | 调用场景 |
|---------|------|------|---------|---------|
| `/api/core/app/tool/preview` | GET | 获取工具节点的预览模板信息（含输入参数） | `src/web/core/app/api/tool.ts:98` → `HomeChatWindow.tsx:249` | 对话首页→首页面板→自定义模式→发送消息前组装工具节点时调用 |

---

## API 调用链追踪

### `/api/core/chat/init` 调用链

```
HomeChatWindow
  ├── 触发: 页面加载（appId/chatId/feConfigs.isPlus 变更时）
  ├── 参数: appId, chatId
  ├── 响应处理: 设置 chatBoxData（含 app.chatConfig 文件选择配置、whisper 语音配置）
  ├── 响应处理: 初始化对话变量
  └── 错误处理: Plus 版跳转 HOME，非 Plus 版跳转 TEAM_APPS

AppChatWindow
  ├── 触发: 切换到最近使用的应用
  └── 参数: appId, chatId
```

### `/api/core/chat/completions`（快速应用）调用链

```
HomeChatWindow.onStartChat（isQuickApp 分支）
  ├── 触发: 用户在快速应用模式下发送消息
  ├── 参数: messages（仅最后一条）, variables, responseChatItemId, appId, chatId, retainDatasetCite, showSkillReferences
  ├── 响应处理（onMessage）: 流式更新正在生成的 AI 回复（generatingMessage）
  ├── 响应处理（完成后）: 根据首条消息生成对话标题，更新历史记录，刷新最近使用列表
  └── 错误处理: 抛出 "appId is empty" 错误
```

### `/api/proApi/core/chat/chatHome` 调用链

```
HomeChatWindow.onStartChat（自定义模式分支）
  ├── 触发: 用户在自定义模式下发送消息
  ├── 前置步骤: 并行获取所有选中工具的预览节点（getToolPreviewNode），填充工具默认输入值
  ├── 前置步骤: 组装 formData（包含选中模型、工具节点、chatConfig）
  ├── 参数: messages（仅最后一条）, variables, responseChatItemId, appId, appName, chatId, retainDatasetCite, showSkillReferences + form2AppWorkflow（工作流节点和边）
  ├── 响应处理（onMessage）: 流式更新正在生成的 AI 回复
  ├── 响应处理（完成后）: 生成对话标题，更新历史记录，刷新最近使用列表
  └── 错误处理: 模型未选择时抛出 "No model selected"
```

### `/api/core/app/tool/preview` 调用链

```
HomeChatWindow.onStartChat（自定义模式分支内）
  ├── 触发: 发送消息前，为每个已选工具获取节点模板
  ├── 参数: appId（工具 ID）
  ├── 调用方式: Promise.all 并行请求所有已选工具
  └── 响应处理: 合并工具的默认输入值（availableTools 中的 inputs），填充到节点的 inputs 中
```
