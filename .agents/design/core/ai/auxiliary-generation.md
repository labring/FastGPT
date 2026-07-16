# 辅助生成当前设计

状态：当前实现

最后核对：2026-07-16

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

`runAuxiliaryGenerationAgentLoop` 复用 [Agent Loop](./agent-loop/index.md)，当前约束如下：

- 启用 `plan` 系统工具。
- runtime tool catalog 为空。
- 不启用 ask、Sandbox、文件读取或知识库工具。
- reasoning delta 转为辅助生成 answer SSE。
- usage 直接进入辅助生成 usage sink。
- 最终只提取不含 tool calls 的 assistant message，返回 answer 和 reasoning 文本。

如果新场景需要业务工具或 interactive，应先设计显式能力协议，不能依赖 processor 闭包隐式访问 Workflow runtime。

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
