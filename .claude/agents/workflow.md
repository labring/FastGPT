---
name: workflow-agent
description: 当用户需要开发工作流代码时候，可调用此 Agent。
model: inherit
color: green
---

# FastGPT 工作流系统架构文档

## 概述

FastGPT 工作流系统是一个基于 Node.js/TypeScript 的可视化工作流引擎，支持拖拽式节点编排、实时执行、并发控制和交互式调试。系统采用队列式执行架构，通过有向图模型实现复杂的业务逻辑编排。

## 核心架构

### 1. 项目结构

```
FastGPT/
├── packages/
│   ├── global/core/workflow/           # 全局工作流类型和常量
│   │   ├── constants.ts               # 工作流常量定义
│   │   ├── node/                      # 节点类型定义
│   │   │   └── constant.ts            # 节点枚举和配置
│   │   ├── runtime/                   # 运行时类型和工具
│   │   │   ├── constants.ts           # 运行时常量
│   │   │   ├── type.d.ts              # 运行时类型定义
│   │   │   └── utils.ts               # 运行时工具函数
│   │   ├── template/                  # 节点模板定义
│   │   │   └── system/                # 系统节点模板
│   │   └── type/                      # 类型定义
│   │       ├── node.d.ts              # 节点类型
│   │       ├── edge.d.ts              # 边类型
│   │       └── io.d.ts                # 输入输出类型
│   └── service/core/workflow/         # 工作流服务层
│       ├── constants.ts               # 服务常量
│       ├── dispatch/                  # 调度器核心
│       │   ├── index.ts               # 工作流执行引擎 ⭐
│       │   ├── constants.ts           # 节点调度映射表
│       │   ├── type.d.ts              # 调度器类型
│       │   ├── ai/                    # AI相关节点
│       │   ├── tools/                 # 工具节点
│       │   ├── dataset/               # 数据集节点
│       │   ├── interactive/           # 交互节点
│       │   ├── loop/                  # 循环节点
│       │   └── plugin/                # 插件节点
│       └── utils.ts                   # 工作流工具函数
└── projects/app/src/
    ├── pages/api/v1/chat/completions.ts    # 聊天API入口
    └── pages/api/core/workflow/debug.ts     # 工作流调试API
```

### 2. 执行引擎核心 (dispatch/index.ts)

#### 核心类：WorkflowQueue

工作流执行引擎采用队列式架构，主要特点：

- **并发控制**: 支持最大并发数量限制（默认10个）
- **状态管理**: 维护节点执行状态（waiting/active/skipped）
- **错误处理**: 支持节点级错误捕获和跳过机制
- **交互支持**: 支持用户交互节点暂停和恢复

#### 执行流程

```typescript
1. 初始化 WorkflowQueue 实例
2. 识别入口节点（isEntry=true）
3. 将入口节点加入 activeRunQueue
4. 循环处理活跃节点队列：
   - 检查节点执行条件
   - 执行节点或跳过节点
   - 更新边状态
   - 将后续节点加入队列
5. 处理跳过节点队列
6. 返回执行结果
```

### 3. 节点系统

#### 节点类型枚举 (FlowNodeTypeEnum)

```typescript
enum FlowNodeTypeEnum {
  // 基础节点
  workflowStart: 'workflowStart',      // 工作流开始
  chatNode: 'chatNode',                // AI对话
  answerNode: 'answerNode',            // 回答节点
  
  // 数据集相关
  datasetSearchNode: 'datasetSearchNode',    // 数据集搜索
  datasetConcatNode: 'datasetConcatNode',    // 数据集拼接
  
  // 控制流节点
  ifElseNode: 'ifElseNode',            // 条件判断
  loop: 'loop',                        // 循环
  loopStart: 'loopStart',              // 循环开始
  loopEnd: 'loopEnd',                  // 循环结束
  
  // 交互节点
  userSelect: 'userSelect',            // 用户选择
  formInput: 'formInput',              // 表单输入
  
  // 工具节点
  httpRequest468: 'httpRequest468',    // HTTP请求
  code: 'code',                        // 代码执行
  readFiles: 'readFiles',              // 文件读取
  variableUpdate: 'variableUpdate',    // 变量更新
  
  // AI相关
  classifyQuestion: 'classifyQuestion', // 问题分类
  contentExtract: 'contentExtract',     // 内容提取
  agent: 'tools',                      // 智能体
  queryExtension: 'cfr',               // 查询扩展
  
  // 插件系统
  pluginModule: 'pluginModule',        // 插件模块
  appModule: 'appModule',              // 应用模块
  tool: 'tool',                        // 工具调用
  
  // 系统节点
  systemConfig: 'userGuide',           // 系统配置
  globalVariable: 'globalVariable',    // 全局变量
  comment: 'comment'                   // 注释节点
}
```

#### 节点调度映射 (callbackMap)

每个节点类型都有对应的调度函数：

```typescript
export const callbackMap: Record<FlowNodeTypeEnum, Function> = {
  [FlowNodeTypeEnum.workflowStart]: dispatchWorkflowStart,
  [FlowNodeTypeEnum.chatNode]: dispatchChatCompletion,
  [FlowNodeTypeEnum.datasetSearchNode]: dispatchDatasetSearch,
  [FlowNodeTypeEnum.httpRequest468]: dispatchHttp468Request,
  [FlowNodeTypeEnum.ifElseNode]: dispatchIfElse,
  [FlowNodeTypeEnum.agent]: dispatchRunTools,
  // ... 更多节点调度函数
};
```

### 4. 数据流系统

#### 输入输出类型 (WorkflowIOValueTypeEnum)

```typescript
enum WorkflowIOValueTypeEnum {
  string: 'string',
  number: 'number', 
  boolean: 'boolean',
  object: 'object',
  arrayString: 'arrayString',
  arrayNumber: 'arrayNumber',
  arrayBoolean: 'arrayBoolean',
  arrayObject: 'arrayObject',
  chatHistory: 'chatHistory',          // 聊天历史
  datasetQuote: 'datasetQuote',        // 数据集引用
  dynamic: 'dynamic',                  // 动态类型
  any: 'any'
}
```

#### 变量系统

- **系统变量**: userId, appId, chatId, cTime等
- **用户变量**: 通过variables参数传入的全局变量
- **节点变量**: 节点间传递的引用变量
- **动态变量**: 支持{{$variable}}语法引用

### 5. 状态管理

#### 运行时状态

```typescript
interface RuntimeNodeItemType {
  nodeId: string;
  name: string;
  flowNodeType: FlowNodeTypeEnum;
  inputs: FlowNodeInputItemType[];
  outputs: FlowNodeOutputItemType[];
  isEntry?: boolean;
  catchError?: boolean;
}

interface RuntimeEdgeItemType {
  source: string;
  target: string;
  sourceHandle: string;
  targetHandle: string;
  status: 'waiting' | 'active' | 'skipped';
}
```

#### 执行状态

```typescript
enum RuntimeEdgeStatusEnum {
  waiting: 'waiting',    // 等待执行
  active: 'active',      // 活跃状态  
  skipped: 'skipped'     // 已跳过
}
```

### 6. API接口设计

#### 主要API端点

1. **工作流调试**: `/api/core/workflow/debug`
   - POST方法，支持工作流测试和调试
   - 返回详细的执行结果和状态信息

2. **聊天完成**: `/api/v1/chat/completions`
   - OpenAI兼容的聊天API
   - 集成工作流执行引擎

3. **优化代码**: `/api/core/workflow/optimizeCode`
   - 工作流代码优化功能

#### 请求/响应类型

```typescript
interface DispatchFlowResponse {
  flowResponses: ChatHistoryItemResType[];
  flowUsages: ChatNodeUsageType[];
  debugResponse: WorkflowDebugResponse;
  workflowInteractiveResponse?: WorkflowInteractiveResponseType;
  toolResponses: ToolRunResponseItemType;
  assistantResponses: AIChatItemValueItemType[];
  runTimes: number;
  newVariables: Record<string, string>;
  durationSeconds: number;
}
```

## 核心特性

### 1. 并发控制
- 支持最大并发节点数限制
- 队列式调度避免资源竞争
- 节点级执行状态管理

### 2. 错误处理
- 节点级错误捕获
- catchError配置控制错误传播
- 错误跳过和继续执行机制

### 3. 交互式执行
- 支持用户交互节点（userSelect, formInput）
- 工作流暂停和恢复
- 交互状态持久化

### 4. 调试支持
- Debug模式提供详细执行信息
- 节点执行状态可视化
- 变量值追踪和检查

### 5. 扩展性
- 插件系统支持自定义节点
- 模块化架构便于扩展
- 工具集成（HTTP, 代码执行等）

## 开发指南

### 添加新节点类型

1. 在 `FlowNodeTypeEnum` 中添加新类型
2. 在 `callbackMap` 中注册调度函数
3. 在 `dispatch/` 目录下实现节点逻辑
4. 在 `template/system/` 中定义节点模板

### 自定义工具集成

1. 实现工具调度函数
2. 定义工具输入输出类型
3. 注册到callbackMap
4. 添加前端配置界面

### 调试和测试

1. 使用 `/api/core/workflow/debug` 进行测试
2. 启用debug模式查看详细执行信息
3. 检查节点执行状态和数据流
4. 使用skipNodeQueue控制执行路径

## 性能优化

1. **并发控制**: 合理设置maxConcurrency避免资源过载
2. **缓存机制**: 利用节点输出缓存减少重复计算
3. **流式响应**: 支持SSE实时返回执行状态
4. **资源管理**: 及时清理临时数据和状态

---

## 前端架构设计

### 1. 前端项目结构

```
projects/app/src/
├── pageComponents/app/detail/              # 应用详情页面
│   ├── Workflow/                          # 工作流主页面
│   │   ├── Header.tsx                     # 工作流头部
│   │   └── index.tsx                      # 工作流入口
│   ├── WorkflowComponents/                # 工作流核心组件
│   │   ├── context/                       # 状态管理上下文
│   │   │   ├── index.tsx                  # 主上下文提供者 ⭐
│   │   │   ├── workflowInitContext.tsx    # 初始化上下文
│   │   │   ├── workflowEventContext.tsx   # 事件上下文
│   │   │   └── workflowStatusContext.tsx  # 状态上下文
│   │   ├── Flow/                          # ReactFlow核心组件
│   │   │   ├── index.tsx                  # 工作流画布 ⭐
│   │   │   ├── components/                # 工作流UI组件
│   │   │   ├── hooks/                     # 工作流逻辑钩子
│   │   │   └── nodes/                     # 节点渲染组件
│   │   ├── constants.tsx                  # 常量定义
│   │   └── utils.ts                       # 工具函数
│   └── HTTPTools/                         # HTTP工具页面
│       └── Edit.tsx                       # HTTP工具编辑器
├── web/core/workflow/                      # 工作流核心逻辑
│   ├── api.ts                             # API调用 ⭐
│   ├── adapt.ts                           # 数据适配
│   ├── type.d.ts                          # 类型定义
│   └── utils.ts                           # 工具函数
└── global/core/workflow/                  # 全局工作流定义
    └── api.d.ts                           # API类型定义
```

### 2. 核心状态管理架构

#### Context分层设计

前端采用分层Context架构，实现状态的高效管理和组件间通信：

```typescript
// 1. ReactFlowCustomProvider - 最外层提供者
ReactFlowProvider → WorkflowInitContextProvider → 
WorkflowContextProvider → WorkflowEventContextProvider → 
WorkflowStatusContextProvider → children

// 2. 四层核心Context
- WorkflowInitContext: 节点数据和基础状态
- WorkflowDataContext: 节点/边操作和状态
- WorkflowEventContext: 事件处理和UI控制
- WorkflowStatusContext: 保存状态和父节点管理
```

#### 主Context功能 (context/index.tsx)

```typescript
interface WorkflowContextType {
  // 节点管理
  nodeList: FlowNodeItemType[];
  onChangeNode: (props: FlowNodeChangeProps) => void;
  onUpdateNodeError: (nodeId: string, isError: boolean) => void;
  getNodeDynamicInputs: (nodeId: string) => FlowNodeInputItemType[];
  
  // 边管理
  onDelEdge: (edgeProps: EdgeDeleteProps) => void;
  
  // 版本控制
  past: WorkflowSnapshotsType[];
  future: WorkflowSnapshotsType[];
  undo: () => void;
  redo: () => void;
  pushPastSnapshot: (snapshot: SnapshotProps) => boolean;
  
  // 调试功能
  workflowDebugData?: DebugDataType;
  onNextNodeDebug: (debugData: DebugDataType) => Promise<void>;
  onStartNodeDebug: (debugProps: DebugStartProps) => Promise<void>;
  onStopNodeDebug: () => void;
  
  // 数据转换
  flowData2StoreData: () => StoreWorkflowType;
  splitToolInputs: (inputs, nodeId) => ToolInputsResult;
}
```

### 3. ReactFlow集成

#### 节点类型映射 (Flow/index.tsx)

```typescript
const nodeTypes: Record<FlowNodeTypeEnum, React.ComponentType> = {
  [FlowNodeTypeEnum.workflowStart]: NodeWorkflowStart,
  [FlowNodeTypeEnum.chatNode]: NodeSimple,
  [FlowNodeTypeEnum.datasetSearchNode]: NodeSimple,
  [FlowNodeTypeEnum.httpRequest468]: NodeHttp,
  [FlowNodeTypeEnum.ifElseNode]: NodeIfElse,
  [FlowNodeTypeEnum.agent]: NodeAgent,
  [FlowNodeTypeEnum.code]: NodeCode,
  [FlowNodeTypeEnum.loop]: NodeLoop,
  [FlowNodeTypeEnum.userSelect]: NodeUserSelect,
  [FlowNodeTypeEnum.formInput]: NodeFormInput,
  // ... 40+ 种节点类型
};
```

#### 工作流核心功能

- **拖拽编排**: 基于ReactFlow的可视化节点编辑
- **实时连接**: 节点间的动态连接和断开
- **缩放控制**: 支持画布缩放和平移
- **选择操作**: 多选、批量操作支持
- **辅助线**: 节点对齐和位置吸附

### 4. 节点组件系统

#### 节点渲染架构

```
nodes/
├── NodeSimple.tsx                    # 通用简单节点
├── NodeWorkflowStart.tsx            # 工作流开始节点
├── NodeAgent.tsx                    # AI智能体节点
├── NodeHttp/                        # HTTP请求节点
├── NodeCode/                        # 代码执行节点
├── Loop/                            # 循环节点组
├── NodeFormInput/                   # 表单输入节点
├── NodePluginIO/                    # 插件IO节点
├── NodeToolParams/                  # 工具参数节点
└── render/                          # 渲染组件库
    ├── NodeCard.tsx                 # 节点卡片容器
    ├── RenderInput/                 # 输入渲染器
    ├── RenderOutput/                # 输出渲染器
    └── templates/                   # 输入模板组件
```

#### 动态输入系统

```typescript
// 支持多种输入类型
const inputTemplates = {
  reference: ReferenceTemplate,      // 引用其他节点
  input: TextInput,                  // 文本输入
  textarea: TextareaInput,           // 多行文本
  selectApp: AppSelector,            // 应用选择器
  selectDataset: DatasetSelector,    // 数据集选择
  settingLLMModel: LLMModelConfig,   // AI模型配置
  // ... 更多模板类型
};
```

### 5. 调试和测试系统

#### 调试功能

```typescript
interface DebugDataType {
  runtimeNodes: RuntimeNodeItemType[];
  runtimeEdges: RuntimeEdgeItemType[];
  entryNodeIds: string[];
  variables: Record<string, any>;
  history?: ChatItemType[];
  query?: UserChatItemValueItemType[];
  workflowInteractiveResponse?: WorkflowInteractiveResponseType;
}
```

- **单步调试**: 支持逐个节点执行调试
- **断点设置**: 在任意节点设置断点
- **状态查看**: 实时查看节点执行状态
- **变量追踪**: 监控变量在节点间的传递
- **错误定位**: 精确定位执行错误节点

#### 聊天测试

```typescript
// ChatTest组件提供实时工作流测试
<ChatTest 
  isOpen={isOpenTest}
  nodes={workflowTestData?.nodes}
  edges={workflowTestData?.edges}
  onClose={onCloseTest}
  chatId={chatId}
/>
```

### 6. API集成层

#### 工作流API (web/core/workflow/api.ts)

```typescript
// 工作流调试API
export const postWorkflowDebug = (data: PostWorkflowDebugProps) =>
  POST<PostWorkflowDebugResponse>(
    '/core/workflow/debug',
    { ...data, mode: 'debug' },
    { timeout: 300000 }
  );

// 支持的API操作
- 工作流调试和测试
- 节点模板获取
- 插件配置管理
- 版本控制操作
```

#### 数据适配器

```typescript
// 数据转换适配
- storeNode2FlowNode: 存储节点 → Flow节点
- storeEdge2RenderEdge: 存储边 → 渲染边
- uiWorkflow2StoreWorkflow: UI工作流 → 存储格式
- adaptCatchError: 错误处理适配
```

### 7. 交互逻辑设计

#### 键盘快捷键 (hooks/useKeyboard.tsx)

```typescript
const keyboardShortcuts = {
  'Ctrl+Z': undo,                    // 撤销
  'Ctrl+Y': redo,                   // 重做
  'Ctrl+S': saveWorkflow,           // 保存工作流
  'Delete': deleteSelectedNodes,    // 删除选中节点
  'Escape': cancelCurrentOperation, // 取消当前操作
};
```

#### 节点操作

- **拖拽创建**: 从模板拖拽创建节点
- **连线操作**: 节点间的连接管理
- **批量操作**: 多选节点的批量编辑
- **右键菜单**: 上下文操作菜单
- **搜索定位**: 节点搜索和快速定位

#### 版本控制

```typescript
// 快照系统
interface WorkflowSnapshotsType {
  nodes: Node[];
  edges: Edge[];
  chatConfig: AppChatConfigType;
  title: string;
  isSaved?: boolean;
}
```

- **自动快照**: 节点变更时自动保存快照
- **版本历史**: 支持多版本切换
- **云端同步**: 与服务端版本同步
- **协作支持**: 团队协作版本管理

### 8. 性能优化策略

#### 渲染优化

```typescript
// 动态加载节点组件
const nodeTypes: Record<FlowNodeTypeEnum, any> = {
  [FlowNodeTypeEnum.workflowStart]: dynamic(() => import('./nodes/NodeWorkflowStart')),
  [FlowNodeTypeEnum.httpRequest468]: dynamic(() => import('./nodes/NodeHttp')),
  // ... 按需加载
};
```

- **懒加载**: 节点组件按需动态加载
- **虚拟化**: 大型工作流的虚拟渲染
- **防抖操作**: 频繁操作的性能优化
- **缓存策略**: 模板和数据的缓存机制

#### 状态优化

- **Context分割**: 避免不必要的重渲染
- **useMemo/useCallback**: 优化计算和函数创建
- **选择器模式**: 精确订阅状态变化
- **批量更新**: 合并多个状态更新

### 9. 扩展性设计

#### 插件系统

```typescript
// 节点模板扩展
interface NodeTemplateListItemType {
  id: string;
  flowNodeType: FlowNodeTypeEnum;
  templateType: string;
  avatar?: string;
  name: string;
  intro?: string;
  isTool?: boolean;
  pluginId?: string;
}
```

- **自定义节点**: 支持第三方节点开发
- **模板市场**: 节点模板的共享和分发
- **插件生态**: 丰富的节点插件生态
- **开放API**: 标准化的节点开发接口

#### 主题定制

- **节点样式**: 可定制的节点外观
- **连线样式**: 自定义连线类型和颜色
- **布局配置**: 多种布局算法支持
- **国际化**: 多语言界面支持