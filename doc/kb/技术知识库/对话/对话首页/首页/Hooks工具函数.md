---
capability_label: 首页
doc_type: "16"
doc_label: Hooks工具函数
generated_at: "2026-06-18T11:00:00Z"
parent_module: 对话首页
roles: ["Plus版用户"]
router_paths: ["/chat?pane=HOME"]
---

# 首页 — Hooks工具函数

## 自定义 Hooks

本模块主要使用 `HomeChatWindow` 组件内部的内联 hooks 和第三方库 hooks，无独立导出的自定义 hook 文件。

### 组件内使用的核心 Hooks

| Hook | 来源 | 用途 |
|------|------|------|
| `useContextSelector` | `use-context-selector` | 从多个 Context 中精确选取需要的字段，避免不必要的重渲染 |
| `useMemoizedFn` | `ahooks` | 持久化函数引用，用于 `onStartChat` 避免闭包陈旧问题 |
| `useMount` | `ahooks` | 组件挂载时执行一次（检查 Plus 权限，非 Plus 跳转） |
| `useLocalStorageState` | `ahooks` | 持久化模型选择和工具选择到 localStorage |
| `useRequest` | `@fastgpt/web/hooks/useRequest` | 管理 `getInitChatInfo` 异步请求状态（loading、refreshDeps） |
| `useSystem` | `@fastgpt/web/hooks/useSystem` | 获取 `isPc` 判断 PC/移动端，控制布局差异 |
| `useMemo` | React | 计算 `availableModels`、`availableTools`、`selectedTools`、`isQuickApp` |
| `useEffect` | React | 清理无效的 selected tool IDs |
| `useRef` | React | —（未在 HomeChatWindow 中直接使用） |

### Context 选择器使用详情

`HomeChatWindow` 通过 `useContextSelector` 从以下 Context 精确选取字段：

| Context | 选取字段 | 用途 |
|---------|---------|------|
| `ChatContext` | `forbidLoadChat`, `onUpdateHistoryTitle`, `onChangeAppId` | 控制对话加载、标题更新、应用切换 |
| `ChatItemContext` | `chatBoxData`, `setChatBoxData`, `resetVariables`, `isShowCite`, `showSkillReferences`, `datasetCiteData` | 对话数据管理、变量重置、引用显示 |
| `ChatPageContext` | `pane`, `chatSettings`, `handlePaneChange`, `refreshRecentlyUsed` | 面板切换、设置读取、最近使用刷新 |
| `ChatRecordContext` | `chatRecords`, `totalRecordsCount` | 对话记录列表和总数 |

### 核心业务 Hook：onStartChat

`onStartChat` 是首页最核心的业务 hook，通过 `useMemoizedFn` 包装，根据 `isQuickApp` 分支走不同的对话发送路径：

- **快速应用分支**：直接使用 `streamFetch` 调用 `/api/core/chat/completions`
- **自定义模式分支**：先并行 `getToolPreviewNode` 获取工具节点，再组装 `form2AppWorkflow`，最后通过 `streamFetch` 调用 `/api/proApi/core/chat/chatHome`

两个分支完成后均执行：生成对话标题、更新 `chatBoxData.title`、刷新最近使用列表。

### 模型选择副作用

选择模型时（`AIModelSelector.onChange`）：
- 更新 `selectedModel`（localStorage 持久化）
- 同步更新 `chatBoxData.app.chatConfig.fileSelectConfig.canSelectImg`：若新模型有 vision 能力则开启图片选择

### 工具选择副作用

工具列表变化时（`useEffect`）：
- 过滤 `selectedToolIds`：清除已不在 `availableTools` 中的工具 ID（避免已删除工具的无效选中）
