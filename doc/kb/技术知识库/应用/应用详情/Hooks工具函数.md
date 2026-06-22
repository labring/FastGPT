---
capability_label: "应用详情"
doc_type: "16"
doc_label: "Hooks工具函数"
generated_at: "2026-06-18T00:00:00.000Z"
parent_module: "应用"
roles: ["Owner", "管理员(manage)", "编辑者(write)", "只读者(read)", "日志查看者(readChatLog)"]
router_paths: ["/app/detail"]
---

# 应用详情 — Hooks工具函数

## 模块内 Hooks

### useChatTest

- **位置**: `projects/app/src/pageComponents/app/detail/useChatTest.tsx`
- **用途**: 提供编辑器内聊天测试面板的核心逻辑，管理 SSE 流式聊天交互
- **主要导出/返回值**:
  - 聊天消息状态管理（发送/接收/流式更新）
  - 初始化聊天（通过 getInitChatInfo 获取 chatId + 历史记录）
  - 流式请求（通过 streamFetch 发送 chatTest 请求）
  - 停止生成逻辑
- **消费方**: SimpleEdit/ChatTest, ChatAgent/ChatTest, SmartCustomerService/ChatTest, MCPTools/ChatTest, HTTPTools/ChatTest
- **外部依赖**: `@/web/core/chat/api`（getInitChatInfo, streamFetch）, `useChatStore`

### useSnapshots (useSimpleAppSnapshots)

- **位置**: `projects/app/src/pageComponents/app/detail/Edit/FormComponent/useSnapshots.tsx`
- **用途**: 编辑器快照管理，支持表单编辑历史记录的 localStorage 持久化和版本恢复
- **主要导出/返回值**:
  - `past`: 历史快照数组
  - `setPast`: 设置快照历史
  - `saveSnapshot`: 保存快照（含标题、时间戳）
  - `forbiddenSaveSnapshot`: 是否禁止保存快照
- **消费方**: SimpleEdit/index, AgentEdit/index
- **外部依赖**: `localStorage`, `ahooks`（useDebounceEffect）

### useSkillManager

- **位置**: `projects/app/src/pageComponents/app/detail/Edit/ChatAgent/hooks/useSkillManager.tsx`
- **用途**: Agent 技能管理 Hook，处理技能的增删改和配置
- **消费方**: AgentEdit
- **外部依赖**: `@fastgpt/global/core/agentSkill/type`

### useSnapshots (SmartCustomerService 专用)

- **位置**: `projects/app/src/pageComponents/app/detail/SmartCustomerService/`（内置快照 Hook）
- **用途**: 智能客服编辑器的差异快照管理（diff-based），与 SimpleEdit 的快照机制不同
- **消费方**: SmartCustomerService/index
- **外部依赖**: `@/web/core/app/diff`

## 工具函数

### form2AppWorkflow / appWorkflow2Form (SimpleApp)

- **位置**: `projects/app/src/pageComponents/app/detail/Edit/SimpleApp/utils.ts`
- **用途**: 简单应用的表单数据 ↔ 工作流数据的双向转换
- **导出**:
  - `form2AppWorkflow(form)`: 将编辑表单转为工作流 nodes/edges/chatConfig 格式，用于保存
  - `appWorkflow2Form(nodes, chatConfig)`: 将工作流 nodes 转为编辑表单格式，用于初始化/恢复
- **消费方**: SimpleEdit/index, SimpleEdit/ChatTest

### agentForm2AppWorkflow / appWorkflow2AgentForm (ChatAgent)

- **位置**: `projects/app/src/pageComponents/app/detail/Edit/ChatAgent/utils.ts`
- **用途**: Agent 应用的表单数据 ↔ 工作流数据的双向转换
- **导出**:
  - `agentForm2AppWorkflow(form)`: Agent 表单转为工作流数据
  - `appWorkflow2AgentForm(nodes, chatConfig)`: 工作流数据转为 Agent 表单
- **消费方**: AgentEdit/index

### v1Workflow2V2

- **位置**: `projects/app/src/web/core/workflow/adapt.ts`（外部工具，本模块内使用）
- **用途**: 将旧版 v1 工作流数据格式迁移到 v2 格式
- **消费方**: SimpleEdit/index（版本兼容处理）

### flowData2StoreData

- **位置**: 工作流相关工具（被 Plugin/Header 等工作流编辑器使用）
- **用途**: 从 ReactFlow 画布提取 nodes 和 edges 转换为可保存的 Store 数据格式
- **消费方**: Plugin/Header, Workflow/Header（保存时调用）

## 模块内 Context

### AppContext

- **位置**: `projects/app/src/pageComponents/app/detail/context.tsx`
- **类型**: React Context（通过 `useContextSelector` 消费）
- **提供者**: `AppContextProvider`
- **提供的数据**:
  - `appId: string` — 当前应用 ID
  - `currentTab: TabEnum` — 当前激活 Tab
  - `route2Tab: (tab) => void` — Tab 切换路由方法
  - `appDetail: AppDetailType` — 应用完整详情
  - `loadingApp: boolean` — 应用加载状态
  - `updateAppDetail: (data) => Promise<void>` — 更新应用基础信息
  - `onSaveApp: (data) => Promise<void>` — 保存/发布应用
  - `onDelApp: () => void` — 删除应用
  - `reloadApp: () => Promise<void>` — 重新加载应用详情
  - `appLatestVersion` — 最新版本数据
  - `reloadAppLatestVersion: () => void` — 刷新最新版本
- **消费方**: 所有子编辑器和 Tab 页面

### LogsContext

- **位置**: `projects/app/src/pageComponents/app/detail/Logs/context.tsx`
- **用途**: 日志模块上下文，管理日期范围和来源筛选状态
- **消费方**: Logs/LogChart, Dashboard, Logs 相关筛选组件
