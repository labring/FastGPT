---
case_version: 1
id: FG-APP-WORKFLOW-057
title: 旧版工具集暂停会话跨版本与跨图恢复
business: app/workflow/execution
category: boundary
types: [ui, api, e2e, integration]
scenario: special
priority: P0
status: draft
tags: [pr-8074, toolset, interactive, resume, identity, 覆盖基础场景, 覆盖边界场景]
evidence: [ui, response, database, log]
sources:
  - packages/global/core/workflow/runtime/utils.ts
  - packages/global/core/workflow/template/system/interactive/type.ts
  - packages/global/core/app/jsonschema.ts
  - packages/service/core/workflow/dispatch/utils/index.ts
  - packages/service/core/workflow/dispatch/index.ts
  - packages/service/core/workflow/dispatch/child/runApp.ts
  - packages/service/core/workflow/dispatch/loopRun/runLoopRun.ts
  - packages/service/core/workflow/dispatch/ai/agent/sub/app/index.ts
  - packages/service/core/workflow/dispatch/ai/agentLoopCore/application/runtime/workflowToolRunner.ts
  - projects/app/src/pages/api/v1/chat/completions.ts
  - packages/service/core/chat/chatItemSchema.ts
  - packages/service/core/chat/constants.ts
  - packages/global/test/core/workflow/runtime/utils.test.ts
  - packages/service/test/core/workflow/dispatch/rewriteRuntimeWorkFlow.test.ts
routes:
  - POST /api/v1/chat/completions
  - POST /api/core/workflow/debug
related: [FG-APP-WORKFLOW-053, FG-APP-WORKFLOW-055, FG-APP-WORKFLOW-056]
baseline: 346deb76c7fb8f7d961f0312d57bdea3d541180a
---

# 旧版工具集暂停会话跨版本与跨图恢复

## 用例简介

旧版本创建的工具集暂停会话在升级后仍应恢复正确的业务操作和所属工作流。父子应用复用节点 ID 时，子图快照不能绑定到父图工具。

## 前置准备

- 协议服务、可控模型和证据约定复用 053；本例从初始目录就提供该例定义的 lookup。模型计划固定为“CallA 调用一次 echo → 用户交互 → CallB 按场景选择后续工具”，使用真实用户选择/表单节点构建暂停路径，记录实际模型调用与 tools 返回。
- R0：独立临时工作流 `Start → CallA → Ask → CallB → Reply` 及新会话。CallA、CallB 分别挂载自己的工具集节点，指向同一 MCP 或 HTTP 夹具；Reply 引用 CallA 的已完成输出作为旧结果对照。执行带 RUN_ID 的 echo 后在 Ask 暂停，保存聊天消息、appId、chatId、版本和远端调用次数；浏览器刷新后才回复继续，CallB 调用 lookup（C3 改为读取操作）。每个子场景使用独立 chatId，不能重复回复同一个已完成交互。
- Rchild：父应用与独立子应用均含 nodeId=`set` 的工具集，父目录为 parent_tool，子目录为 child_tool。两个图各自合法；运行路径调用子应用并在子图内暂停。父子工具的服务审计与返回标记不同，不靠生成的 ID 文本猜测实际工具。
- 历史夹具 L0：需在迁移前版本实际创建并冻结一份含 `${父ID}${index}` 子工具位置 ID 的暂停会话、对应图和源工具集版本，包含入口、memoryEdges、nodeOutputs；另有 Rchild 的历史暂停会话。仅在隔离数据库副本加载，写入准备由环境维护者按对应版本完成，测试查询账号只读。冻结后先通过该版本的会话 schema 并验证能在旧环境继续，不能只拼一个未验证 JSON。
- 阻塞项：当前未随本用例交付 L0 的历史会话/版本归档，因此 C4/C5 保持阻塞，整份定义暂为 draft；补充夹具哈希、旧 commit 与隔离恢复方法后转 ready。当前版本的普通暂停与换序验证独立见 055，不借历史单测通过结果代替。
- 等待与清理：每轮最多 90 秒，以交互可见或完成/错误事件为终态；回复前检查该交互尚未消费。保存脱敏证据后删除本例临时应用与会话；不要清理共享历史归档或其他 chatId。

## 测试步骤

| 子场景 | 类型与起始状态 | 输入与操作 |
| --- | --- | --- |
| C4 | 历史兼容；隔离恢复 L0，普通工具集会话 | 在新版本继续旧暂停会话；MCP/HTTP 以及工具列表换序作为同一规则的变体，独立恢复归档副本。 |
| C5 | 跨图边界；历史 Rchild 会话及正常同图交互对照 | 新版本继续父应用中的子应用暂停会话；再使用同一图内 ToolCall 包装的暂停对照。必要的循环/Agent 子应用入口使用所属图的同一组归档方法，不仅断言递归层数。 |

## 预期结果

公共断言：恢复的是业务操作身份与所属工作流，不固定要求某个新 ID 字符串。暂停快照中每层 entryNodeIds、memoryEdges、nodeOutputs、skipNodeQueue 引用应能在该层实际展开图中解析；已完成工具结果仍可读取，不能因过滤孤儿边丢掉 selectedTools 挂载。只比较本例明确的调用次数，目录发现可重新发生，模型请求和计费不要求完全不变。

| 子场景 | 验证方式 | 特有预期 | 证据获取方式 |
| --- | --- | --- | --- |
| C4 | 历史归档 + 运行响应 | 旧位置 ID 被正确关联到相应工具；旧入口/边/输出都有效。不能只改 memoryEdges 而丢入口或输出，也不能把旧 ID 当作不存在节点静默跳过。 | L0 哈希、旧新图/快照对照与完整会话结果；无夹具则阻塞。 |
| C5 | 父子图快照 + 服务审计 | 子快照始终关联 child_tool，不能被父图映射成 parent_tool；同图包装仍正确恢复，不能以“完全禁用所有递归”通过子图场景却破坏对照。 | 每层节点图与快照路径对照、两个服务的工具名/次数、旧输出值；无历史子图归档则阻塞。 |

聊天只读证据，库名由环境提供，查询必须同时限定团队、应用和会话：

```js
db.chatitems.find(
  { teamId: ObjectId("<teamId>"), appId: ObjectId("<appId>"), chatId: "<chatId>" },
  { dataId: 1, obj: 1, value: 1, memories: 1, time: 1 }
).sort({ time: 1 });
```

交互对象从实际消息 value 中提取，按 `WorkflowInteractiveResponseTypeSchema` 检查；不预设一个不存在的顶层 lastInteractive 数据库字段。若环境只提供脱敏会话导出，记录其覆盖字段与缺失项，不伪造数据库证据。
