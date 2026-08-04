# Workflow Builder 单 Sandbox 与主 AgentLoop 架构

## 1. 目标

Workflow Builder 接收用户业务需求，在需求和资源闭合后，把完整工作流一次性搭建、校验并原子应用到当前画布。实现必须复用通用 AgentLoop，不在 Runner 外建立第二套业务状态机。

核心约束：

- 角色和业务生命周期由 Workflow Builder 系统提示词定义。
- AgentLoop 只提供通用的执行、交互、工具调度和可注入完成策略。
- 是否真正完成由工具产生的结构化事实决定，不解析 Agent 文本，不检查固定词汇。
- 当前画布事实只来自 Workflow CLI Gateway；Workflow Core 负责领域校验。
- 一个 App 用户复用一个物理 Sandbox，研究区与事务区保持逻辑隔离。
- 不新增数据库状态，不保存外部阶段机，不要求用户处理节点和连线问题。

## 2. 总体架构

```mermaid
flowchart TD
  U["用户业务需求"] --> R["Workflow Builder Runner"]
  R --> S["单物理 Sandbox"]
  S --> SR["研究执行器：Skill 与用户文件"]
  S --> ST["受保护事务区：草稿、分片与 CLI"]
  R --> L["统一 AgentLoop"]
  P["Builder 系统提示词"] --> L
  CP["CompletionPolicy：只读取终止事实"] --> L
  L --> A{"需要业务输入？"}
  A -->|是| ASK["ask_agent：一次性收集业务缺口"]
  ASK --> U
  A -->|否| PV["workflow_builder_present_preview"]
  PV --> PC{"用户选择"}
  PC -->|修改| L
  PC -->|取消| CANCEL
  PC -->|确认| Q["workflow_cli_query"]
  L --> Q
  L --> SG["workflow_cli_stage"]
  Q --> G["Workflow CLI Gateway"]
  SG --> G
  G --> C["Chunk Session 与 Checkpoint"]
  C --> WC["Workflow Core 合并与校验"]
  WC --> V{"draft valid？"}
  V -->|否| L
  V -->|是| CM["workflow_cli_commit"]
  CM --> AP["原子应用到画布"]
  AP --> TF["结构化 applied 事实"]
  CANCEL["workflow_builder_cancel"] --> TF2["结构化 cancelled 事实"]
  L --> CANCEL
  TF --> F["无工具动态收尾 Agent"]
  TF2 --> F
  F --> U
```

Runner 只启动一次负责需求闭合、预览和搭建的主 `runAgentLoopCoreWithSummary`。用户确认 Mermaid 后尚未 Commit，或用户要求修改后尚未展示新 Mermaid 时，`CompletionPolicy` 才让同一个 Provider、同一份消息链和同一个运行预算继续执行，不重建主 AgentLoop。主执行产生终止事实后，Runner 另启动一次最多一轮、禁用全部工具的收尾 Agent；它只负责把结构化终止事实转换成用户答复，不参与搭建。普通问候和非搭建对话可以自然结束，也不会进入收尾 Agent。

## 3. 业务生命周期

系统提示词负责以下连续链路：

1. 需求建模与当前画布事实核对。
2. 解析知识库、模型、应用、工具、密钥等外部资源。
3. 将同一轮发现的业务或资源缺口合并成一次 `ask_agent`。
4. 所有工作流搭建和修改任务都调用 `workflow_builder_present_preview`，以 `title + mermaid + sections` 提交完整预览；普通 assistant 正文不得自行输出 Mermaid。
5. Preview 工具统一注入 `confirm`、`revise`、`cancel` 三个稳定动作。`revise` 先收集文本修改意见；Agent 合并意见后重新调用同一工具展示完整新版方案，不得重复旧图。
6. 用户确认后进入连续搭建，不再为 Schema、节点、引用、边、容器或诊断向用户确认。
7. 分片 Stage、draft validate、自主修复，最后 Commit。
8. Commit 返回 `state: applied` 与 `taskComplete: true` 后完成。

用户明确取消时必须调用 `workflow_builder_cancel`，避免把自然语言取消误当成普通完成。

## 4. 完成策略

通用 `AgentLoopRuntime` 接收可选 `completionPolicy`：

```ts
type AgentLoopCompletionPolicy = (context: {
  requestIndex: number;
}) =>
  | { action: 'complete' }
  | { action: 'continue'; message: string }
  | Promise<
      | { action: 'complete' }
      | { action: 'continue'; message: string }
    >;
```

策略不会收到 assistant 文本，因此不能演变成关键词、正则或意图分类补丁。未注入策略时，FastAgent 和 PiAgent 保持原来的自然结束行为。

Workflow Builder 的终止事实如下：

| 事实 | AgentLoop 行为 | Builder 结果 |
| --- | --- | --- |
| `ask_agent` 交互 | 暂停并保存 Provider 状态 | `clarification_pending` |
| Commit 成功 | 工具 `stop` | `applied` |
| Cancel 工具成功 | 工具 `stop` | `cancelled` |
| 同一修复目标第 10 次失败 | 工具 `stop` | `failed` |
| Provider 错误或预算耗尽 | 错误返回 | `failed` |
| 连接或用户停止信号 | 中止 | `aborted` |
| 无工具自然结束且没有上述事实 | 同一 AgentLoop 继续 | 不对用户返回阶段性结束 |

成功、取消和失败统一进入一次无工具收尾 Agent，根据权威事实动态生成最终答复。收尾失败时保留主 Agent 已经产生的内容，不注入固定兜底文案。

## 5. CLI 与状态边界

CLI Gateway 只维护执行所需状态：

- 当前 Chunk Session 与 checkpoint。
- 最近一次有效 draft validation 对应的 revision 和 WorkflowPlan。
- Stage 与 Commit 按修复目标隔离的失败次数。
- 已应用的 WorkflowDocument、WorkflowPlan 和终止错误。

不再维护 Supervisor round、stalled round、响应文本、最近工具指纹或执行快照。Stage 成功后清除该目标次数，并清除旧草稿版本上的 Commit 次数；错误类型变化不会让同一目标的计数清零。

修改顺序固定为：节点与结构化输入、执行边、数据引用和剩余配置、工具与容器关系。draft validate 必须无阻断诊断，Commit 只接受对应且未变化的 `draftRevision`。

## 6. Sandbox 边界

同一 App 用户使用稳定的物理 Sandbox，不同 Builder `chatId` 使用独立的 `sessions/<chatId>` 会话工作目录。Builder 在当前会话目录中准备：

```text
sessions/<chatId>/
  user_files/
  .fastgpt/workflow-builder/transaction/
    workflow.json
    chunks/
    runs/
    bin/fastgpt-workflow
```

内置 Skill 从物理 Sandbox 的共享 Skill 根目录注入，用户文件和 Builder 事务状态位于当前会话目录。AgentLoop 只获得研究工具执行器；该执行器拒绝显式访问事务目录、`workflow.json` 和 CLI，Gateway 持有底层 `ISandbox` 并独占事务文件。当前 SDK 尚不支持指定 Linux 用户运行命令，因此这里是服务端逻辑能力边界，不是 Linux 用户、容器或独立物理 Sandbox 级别的安全隔离。

Checkpoint 只有在 `appId`、base checksum、manifest 和每个分片内容校验都一致时才恢复。Commit 成功、画布基线变化或 checkpoint 损坏都会清理旧事务。

## 7. 验收

- FastAgent 与 PiAgent 都支持可选 CompletionPolicy，默认行为不变。
- Builder 只启动一个主构建 AgentLoop；终止后最多追加一次无工具收尾 Agent 调用。
- 模型输出阶段总结、复杂度说明或手工操作建议时不会结束未提交任务。
- 需求提问、Mermaid 确认、修改后新 Mermaid 和取消均走结构化交互或工具。
- Mermaid 确认后不再出现技术阶段确认。
- 同一 Stage 或 Commit 目标第 10 次失败才终止，成功后清零。
- Commit 前必须 draft validate，Commit 后画布文档与 Workflow Core 目标一致。
- 最终答复由无工具 Agent 动态生成，不存在固定成功或失败回复。
