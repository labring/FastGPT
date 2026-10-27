# 辅助生成当前设计

状态：已实现

最后核对：2026-10-23

## 适用范围

辅助生成用于不经过 Workflow Dispatcher、但需要复用 Chat 身份、SSE、计费、停止和 Agent Loop 的生成场景。目前的核心调用方是 Chat Agent Helper。

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

- 新的辅助生成场景优先复用 `runAuxiliaryGeneration`，只新增 processor。
- 业务事件由 processor 显式写入，不扩展通用 stream 层去理解业务配置。
- 公共生命周期需求放在本模块；单场景数据组装保留在调用方业务目录。
- source 标识统一使用 `sourceType/sourceId`，不能恢复 App-only 的 `appId` 入口。

## 运行详情展示

`AUXILIARY_GENERATION_SHOW_RUN_DETAIL` 统一控制 Skill 编辑助手、Chat Agent Helper 和 Workflow Builder 运行结束后的「运行详情」入口，默认 `false`，设置为 `true` 后展示。环境变量配置在主应用服务，重启后刷新页面生效。

服务端通过 `feConfigs.showAuxiliaryGenerationRunDetail` 下发开关，三个入口沿用 ChatBox 现有的结束状态判断与详情弹窗。开关仅控制展示，不影响生成中的思考、工具卡片、计费、上下文保存与恢复，也不作为接口访问权限。

Skill 和 Workflow Builder 复用已有详情记录；Chat Agent Helper 从标准 Agent Loop 事件复用 Agent V2 详情收集器，并由业务保存层写入统一的独立详情表。详情记录与展示开关无关，旧 Helper 会话没有已保存的详情时仍显示空态，不根据聊天内容猜补运行记录。

## 模型协议上下文的保存与恢复

模型消息是恢复依据，思考区、正文和工具卡片是展示投影。`ChatItem.value` 内的隐藏容器通过 `modelMessages` 保存当前 Agent 运行实际写入的协议消息增量，保留每条 assistant 的正文、思考和完整 tool_calls；工具响应按原调用关系保存。已有展示 value 使用 `modelMessages: []` 表示不再反向构造模型上下文。不存在该字段的旧记录沿用原兼容转换，无法确定的旧分组不猜测合并。

- fastAgent 与 piAgent 从真实 transcript 写入点发送 model_context 事件，覆盖完成、暂停、错误和停止。只保存新消息，不在每轮重复保存历史输入。
- Ask 快照直接保存实际 transcript；用户回答原位替换相同工具结果，保留同轮其他调用和未执行结果。child interactive 也按原 tool_call_id 续跑。
- 压缩 checkpoint 替换当前容器中已被总结的消息，恢复时保留 system 和最新 checkpoint，避免旧上下文重复加入。
- SSE 同步模型消息与展示归属，打字队列延迟到达的文字仍是展示投影。独立并行节点的普通输出不被其他 Agent 覆盖；子工具只流出展示，父模型的上下文由父运行保存。
- 正文展示 ID 按每次模型调用分配，同一次调用内的思考与正文共用展示块；下一次调用的回复按事件顺序追加。Plan 原位更新，模型上下文容器跨调用复用，协议增量或压缩事件不改变正文展示边界。
- 模型消息事件沿用内部工具可见性过滤；节点 answer/output 预览去除协议容器，保持原业务输出形态。
- 验收重点是内存续跑与保存恢复后的关键协议结构一致，覆盖多工具加思考、Ask/方案确认恢复、父子调用、压缩、停止及旧记录。
