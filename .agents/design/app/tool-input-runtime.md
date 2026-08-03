# 统一工具参数转换与运行时编译

## 任务概述

FastGPT 的工具定义来自 JSON Schema 或 NodeIO，并分别被 AgentV2、工作流 ToolCall 和普通工作流执行消费。本设计建立统一编译 seam，将原始定义、持久化配置、模型可见参数和最终执行参数分层，保持现有数据库与公开协议兼容。

## 数据模型

- `ToolInputDefinition`：单个参数的原始 schema、NodeIO 投影和允许的输入来源。
- `ToolInputConfiguration`：参数最终选择的 `agentGenerated` 或 `manual` 模式，以及可选手工绑定。
- `CompiledToolRuntime`：模型 function schema、Agent 参数白名单和固定输入绑定。
- `compileToolRuntime()`：从最新工具定义和当前配置生成唯一运行时描述。
- `mergeToolRuntimeParams()`：过滤模型未知字段并与固定绑定合并，拒绝两组 key 冲突。

## 转换规则

1. HTTP、MCP 和系统工具保留完整 JSON Schema property，并投影为 NodeIO 配置视图。
2. 基础类型、对象、同类型数组、枚举和同基础类型 nullable union 支持手工配置。
3. 混合 union、tuple 和无法确定基础类型的 schema 只允许 Agent 生成。
4. 文件、知识库、模型等 NodeIO 专属输入只允许手工配置，不进入模型 schema。
5. AgentV2 继续保存 `{ key, mode } + config`；Simple 与 Workflow ToolCall 继续保存 NodeIO。
6. `isToolParam` 只决定首次默认模式。显式 `mode`、`selectedType` 和 `isToolParam: false` 优先。
7. `toolDescription` 的旧版默认推断只作用于 workflow tool 的原始 `pluginInput`。

## 执行与校验

- AgentV2 和 ToolCall 通过同一 compiler 生成模型 schema。
- 模型参数按 `agentGeneratedKeys` 白名单过滤，再与用户值或默认值合并。
- 工作流 NodeIO 引用仍由工作流引擎解析，普通工作流不经过模型 compiler。
- JSON Schema 手工值在配置表单提交和服务端外部调用前使用 AJV 校验。

## 风险与注意事项

- 不迁移存量记录，兼容读取逻辑必须保留。
- 原始 JSON Schema 可能包含未知 format；本期保留结构约束，format 不作为阻断项。
- runtime 校验只处理工具 schema 声明的字段，内部 secret/config 字段不进入 schema。
- 内置节点继续只允许挂载到工作流 ToolCall。

## 参考

- `packages/global/core/app/jsonschema.ts`
- `packages/global/core/app/formEdit/utils.ts`
- `packages/service/core/workflow/dispatch/ai/agent/sub/tool/utils.ts`
- `packages/service/core/workflow/dispatch/ai/toolcall/hooks/useToolCatalog.ts`

## TODO

- [x] 新增统一 contract、compiler、参数合并和 AJV validator
- [x] JSON Schema 投影保留完整 property，覆盖不可投影类型
- [x] AgentV2 接入统一 compiler 与参数合并
- [x] ToolCall 接入统一 compiler 与参数合并
- [x] 普通工作流外部工具调用前复验参数
- [x] 配置弹窗增加字段级 JSON Schema 校验
- [x] 完成局部、全量测试与双轴代码审查
