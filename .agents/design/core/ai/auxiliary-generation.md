# 辅助生成当前设计

状态：已实现

最后核对：2026-08-03

## 适用范围

辅助生成用于不经过 Workflow Dispatcher、但需要复用 Chat 身份、SSE、计费、停止和 Agent Loop 的生成场景。目前的核心调用方是 Chat Agent Helper 和 Skill Edit 调试对话。

它不是第二套 Workflow runtime，也不负责：

- Workflow 节点调度、变量或 nodeResponse。
- 默认注入业务工具、Sandbox 或 Agent Skill。
- 资源鉴权和请求参数校验；API 路由必须在进入辅助生成前完成这些工作。
- 持久化业务响应；processor 返回标准响应后由调用方决定如何保存。

## 模块结构

目录：`packages/service/core/ai/auxiliaryGeneration`

| 文件 | 职责 |
| --- | --- |
| `service.ts` | 编排一次辅助生成的完整生命周期 |
| `agentLoop.ts` | 将无业务工具的生成接入统一 Agent Loop |
| `stream.ts` | 创建 SSE、心跳、错误、结束事件和断流续传 mirror |
| `usage.ts` | 余额检查、usage 记录创建和用量推送 |
| `stop.ts` | 读取并清理统一停止标记 |
| `type.ts` | processor、用户上下文和运行结果协议 |

Skill Edit 的鉴权、消息组装、Sandbox 准备、Agent Loop runtime、ChatBox 事件和聊天持久化保留在
`packages/service/core/ai/skill/debugChat`。该目录调用辅助生成公共生命周期，但不依赖 Workflow Dispatcher
或 `agentLoopCore`。

## 执行流程

```text
API route
  |-- parse input and auth source
  |-- load histories / files
  `-- runAuxiliaryGeneration
        |-- create SSE and resume mirror
        |-- check balance and create usage record
        |-- clear stale stop flag
        |-- call business processor
        |     `-- optional runAuxiliaryGenerationAgentLoop
        |-- emit done
        `-- clear timer and stop flag
```

`runAuxiliaryGeneration` 只编排公共生命周期，业务差异通过 `processor` 注入。processor 接收 query、files、data、histories、stream writer、停止检查、usage sink 和已鉴权用户信息。

## Agent Loop 接入

`runAuxiliaryGenerationAgentLoop` 复用 [Agent Loop](./agent-loop/index.md)，约束如下：

- 不启用 `plan`、Sandbox、文件读取或知识库系统工具。
- 启用标准 `ask_user` 系统工具；暂停和恢复完全遵循 Agent Loop 的 `providerState + userAnswer` 协议。
- 业务调用方可以显式注入 runtime tools 和 executor；Chat Agent Helper 注入 `generate_config`。
- reasoning delta 转为辅助生成 answer SSE。
- usage 直接进入辅助生成 usage sink。
- 结果保留标准 `status`、`pause` 和 `providerState`，业务层只负责转换展示和持久化，不自行判断暂停条件。

如果新场景需要业务工具，必须通过 runtime tool catalog 和 executor 显式注入，不能依赖 processor 读取 Workflow runtime。

## Chat Agent Helper 连续调用

```text
模型调用 ask_user
  -> Agent Loop 返回 paused + ask + providerState
  -> Chat Agent Helper 保存 interactive、ask tool call 和 providerState memory
  -> 用户提交与 Workflow Agent 相同的 { answers: string[] } 原始结构
  -> 调用方传回 providerState + userAnswer
  -> Agent Loop 在原 ask tool call 后追加 tool response 并继续
  -> 模型调用 generate_config
  -> executor 校验并生成表单配置，返回 "Generate config success"
  -> 模型自行结束，调用方清理 providerState memory
```

Chat Agent Helper 读取历史时使用 `reserveTool: true`。除 interactive 外，还需要持久化对应的 `ask_user` 和 `generate_config` tool call/response，否则历史转换无法恢复工具语义。

`generate_config` 是普通 runtime tool，不设置 `stop`。工具参数使用配置生成业务结构，不包含用于旧 JSON 路由的 `phase` 和 `reasoning` 字段；executor 使用 Zod 校验，并确认全部资源 ID 都在当前成员的可访问资源集合内，再转换为最终表单结构。参数错误作为 tool error 返回给模型修正，不再额外调用模型修复 JSON。

## Provider State 持久化

- 暂停态把 Agent Loop 返回的完整 `providerState` 写入当前 AI ChatItem 的 `memories`。
- 恢复态只从最后一条 AI history 读取该 memory，并把原始回答作为 `userAnswer` 传入。
- `done`、`error` 和 `aborted` 都清除该 memory，避免后续普通消息恢复陈旧暂停点。
- 通用 `saveChat` 已支持 memories；辅助生成只扩展 processor 返回协议和 Chat Agent Helper 保存调用，不修改通用保存语义。

Skill Edit 不复用 Chat Agent Helper wrapper，而是在自己的 processor 中直接调用 `runAgentLoop`，并通过公共
`AgentLoopRuntime.systemTools` 显式启用 `plan`、`ask`、`sandbox` 和 `readFile`。Skill Edit 不注册
runtime tools；Sandbox 和文件读取均使用 Agent Loop 标准 system tool 协议。

## Skill Edit 直连

Skill Edit 调试对话保留原 `/api/core/ai/skill/debugChat` 和 ChatBox SSE 协议，但移除
`workflowStart -> agent` 临时 Workflow。执行流程如下：

```text
debugChat API
  |-- Skill 写权限、频控、运行中 edit sandbox 校验
  |-- preChatRound 与历史/文件 URL 恢复
  `-- runAuxiliaryGeneration
        |-- Skill Edit processor 准备 sandbox 和当前用户上下文
        |-- runAgentLoop(systemTools: plan/ask/sandbox/readFile)
        |-- Skill Edit event adapter 生成 SSE、assistantResponses、nodeResponses
        `-- 写入 chat round、agent providerState 和 node response rows
```

边界约束：

- Skill Edit 只依赖 Agent Loop 的 `interface` 和 Sandbox 的 `interface`，不调用 Workflow Dispatcher，
  也不复用 `packages/service/core/workflow/dispatch/ai/agentLoopCore`。
- Pro 的内置 Skill prepare action 直接从 Sandbox interface 注入；Workflow 侧只保留兼容 re-export，
  不维护 Skill Edit 专用 adapter。
- ChatBox 仍消费既有 answer、tool、plan、interactive、flowNodeResponse 和 duration 事件；这是传输兼容，
  不代表执行经过 Workflow。
- ask 暂停时只持久化 opaque `providerState`；恢复时由 Agent Loop provider 解释。
- ask 恢复统一使用 `continuation: { type: 'ask', answer, additionalMessages }`；回答作为对应
  tool response，同轮新上传的文件作为 `additionalMessages` 追加到暂停上下文，
  避免把回答文本重复作为 user message。
- `read_files` 只允许读取当前聊天上下文中已授权的文件 URL，单文件失败转换为模型可见结果。
- 正常、交互暂停和 Agent Loop error 都先完成聊天与 node response 持久化，再发送 SSE `[DONE]`。

## SSE 与断流续传

- Stream key 使用 `teamId/sourceType/sourceId/chatId`，与标准 Chat source 隔离规则一致。
- SSE heartbeat 使用空 answer delta。
- 错误通过 `AuxiliaryGenerationEventEnum.error` 返回，并复用统一 cookie 清理规则。
- 正常结束依次发送 finish delta 和 `[DONE]`。
- 路由层可以通过 `onStreamContextReady` 获取 stream context，在 processor 前后的异常路径写 error 并 flush resume。

## 停止语义

辅助生成读取 `/v2/chat/stop` 使用的 Redis key：

```text
agent_runtime_stopping:<sourceType>:<sourceId>:<chatId>
```

运行期间定时刷新停止状态，连接关闭也会触发本地停止。开始和结束时都清理旧标记，避免一次停止污染下一次生成。

## 用量

1. 开始生成前检查团队 AI points。
2. 根据 `sourceType` 将 sourceId 记为 appId 或 skillId。
3. 创建一次 chat usage record。
4. processor 通过 usage sink 推入模型、工具或压缩用量。

辅助生成不重新计算 Agent Loop 积分，也不重复调用用量写入。

## 扩展规则

- 新的辅助生成场景优先复用 `runAuxiliaryGeneration`，只在所属业务域新增 processor。
- 业务事件由 processor 显式写入，不扩展通用 stream 层去理解业务配置。
- 公共生命周期需求放在本模块；单场景数据组装保留在调用方业务目录。
- source 标识统一使用 `sourceType/sourceId`，不能恢复 App-only 的 `appId` 入口。

## TODO

- [x] 将当前分支线性对齐到最新 `upstream/main`，保留旧分支恢复引用。
- [x] 在 Agent Loop 公共 Input 和两个 provider 中统一 ask `continuation` 恢复协议。
- [x] 扩展辅助生成生命周期，支持 usage 复用和 `[DONE]` 前业务持久化。
- [x] 将 Skill Debug 从临时 Workflow 改为 Skill 域内的直接 Agent Loop processor。
- [x] 将内置 Skill prepare action 下沉到 Sandbox interface，并更新 Pro Skill Debug 入口。
- [x] 覆盖消息上下文、ask 恢复、runtime/event adapter、API 收尾和错误路径测试。
- [x] 运行相关局部测试、lint 和 Pro 定向类型检查（按要求不运行全量测试）。
