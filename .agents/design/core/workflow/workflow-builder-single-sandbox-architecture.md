# Workflow Builder 单 Sandbox 架构设计

## 1. 背景与目标

Workflow Builder 当前在同一个 Builder 对话中创建两个物理 Sandbox：

1. 研究 Sandbox：注入内置 Skill、用户文件，并作为 Agent 通用 Sandbox tool 的执行环境。
2. 事务 Sandbox：保存当前 `workflow.json`、注入 Workflow CLI，并由服务端执行 `changeset plan` 与 `changeset apply`。

两个 Sandbox 的物理 ID 不同，因此首次工作流生成通常需要额外创建或恢复一次实例、获取一次初始化租约、准备一次文件系统。CLI 的纯计算成本很低，但这部分运行环境成本会直接计入 `Workflow CLI Apply` 的工具耗时。

本功能将 Builder 改为每个 `(appId, userId, builderChatId)` 只使用一个物理 Sandbox。在同一实例中提供两个逻辑能力：研究能力与事务执行能力。

### 1.1 目标

- 一个 Builder 对话最多只创建或恢复一个物理 Sandbox。
- Agent 可以研究 Skill、用户文件和外部资料，但不能直接读取或修改当前工作流事务文件。
- 当前工作流仍然只能通过 `workflow_cli_query` 与 `workflow_cli_apply` 访问和修改。
- 保留 Workflow Core、CLI、base checksum、target checksum、`appId` 和最终 `WorkflowDocument` 校验。
- 不保留双 Sandbox、旧 transaction chatId、旧 Builder fallback 或 feature flag 分支。
- 不修改 Workflow Core 和 Workflow CLI 的领域契约。

### 1.2 非目标

- 不改变普通 Agent、Skill Debug 或非 Builder 对话的 Sandbox 行为。
- 不让模型直接调用 CLI、导入 JSON、保存、发布或运行工作流。
- 不把工作流事务状态持久化为跨轮固定文件。
- 不以提示词作为访问控制。

## 2. 当前实现与根因

当前 `runWorkflowBuilder` 会先准备研究 Sandbox，并将原始 `SandboxClient` 注入 Agent Loop 的 `systemTools.sandbox`。随后第一次 `workflow_cli_query` 或 `workflow_cli_apply` 再以 `chatId:workflow-builder-transaction` 准备第二个事务 Sandbox。

```text
Builder 对话
  ├── research sandboxId
  │   └── Agent 可使用读写文件、搜索和 Shell 工具
  └── transaction sandboxId
      └── 服务端写 workflow.json 并执行 Workflow CLI
```

不能只把两个 sandboxId 改成相同。当前通用 Sandbox 工具含有 `sandbox_shell`、`sandbox_read_file`、`sandbox_write_file` 等能力；如果 Agent 与事务文件共享无权限隔离的文件系统，模型可以绕过 `workflow_cli_apply` 直接读写 `workflow.json`。

## 3. 目标架构

### 3.1 一个物理实例、两种能力

```text
一个 Builder Sandbox
  ├── research/                 owner: workflow_builder_research
  │   ├── skills/
  │   ├── user_files/
  │   └── scratch/
  │
  └── transaction/              owner: workflow_builder_transaction
      ├── workflow.json
      ├── workflow-cli/
      ├── runs/
      └── .lock
```

同一物理 Sandbox 内建立两个非特权 Linux 用户：

| 身份 | 可访问目录 | 调用者 | 权限 |
| --- | --- | --- | --- |
| `workflow_builder_research` | `research/` | Agent 的研究工具 | 读取、写入、Shell、网络访问 |
| `workflow_builder_transaction` | `transaction/` | 服务端 CLI Runner | Workflow CLI 查询、Plan、Apply |

目录权限必须由 Sandbox 内的 OS 权限保证：`research/` 与 `transaction/` 分别 `0700`，互不具备读取、写入或执行权限。事务目录、CLI bundle 和 `workflow.json` 不可被研究身份读取。

### 3.2 两个逻辑入口

```text
Agent
  └── WorkflowBuilderResearchExecutor
      └── 以 workflow_builder_research 身份执行受控研究工具

服务端 Workflow CLI Gateway
  └── WorkflowBuilderTransactionRunner
      └── 以 workflow_builder_transaction 身份执行 CLI
```

这里的“两个入口”不代表两个 Sandbox 或两个通用 Adapter。

- `WorkflowBuilderResearchExecutor` 是新的 Agent 工具执行器。它替代 Builder 当前直接暴露的原始 `SandboxClient`。
- `WorkflowBuilderTransactionRunner` 是现有 `createWorkflowCliGateway`、`applyWorkflowBuilderPlanInSandbox`、CLI plan/apply 链路的收敛名称和职责，不向 Agent 暴露。

两者共享同一个底层 `ISandbox` 和同一个 sandboxId，但拥有不同 OS 身份、目录根和调用权限。

### 3.3 为什么不能只依赖路径前缀

仅在程序里要求“研究工具只能传 `research/` 路径”不构成边界：绝对路径、`../`、软链接和 Shell 都可能绕过前缀判断。

因此 Research Executor 必须同时满足：

1. 不向 Agent 暴露底层 `ISandbox` 或完整 `SandboxClient`。
2. 文件读取、写入、搜索、列目录、编辑和 Shell 都以 `workflow_builder_research` 身份运行。
3. 所有路径结果必须归一化到 `research/`；文件 URL 仅允许来自该目录。
4. 事务目录仅允许 `workflow_builder_transaction` 及服务端初始化过程访问。
5. Sandbox 镜像中不得给研究身份配置 `sudo`、CAP_DAC_OVERRIDE 或可提权入口。

## 4. 运行流程

### 4.1 初始化

```text
Builder 请求到达
  → 以 builderChatId 获取一个 SandboxClient
  → 获取一次 Sandbox 初始化租约
  → 创建两个 Linux 用户和两个 0700 目录
  → 复制内置 workflow-builder Skill 与用户文件到 research/
  → 注入固定版本 Workflow CLI 到 transaction/
  → 写入本轮前端传入的 WorkflowDocument 到 transaction/workflow.json
  → 返回 SharedWorkflowBuilderSandboxContext
```

`SharedWorkflowBuilderSandboxContext` 至少包含：

```ts
type SharedWorkflowBuilderSandboxContext = {
  sandboxClient: SandboxClient;
  sandbox: ISandbox;
  researchDirectory: string;
  transactionDirectory: string;
  transactionRunDirectory: string;
  transactionLauncherFile: string;
};
```

本轮只初始化一次。研究工具和 CLI 工具都从这个 Context 取底层 Sandbox，不再调用第二次 `ensureAgentSandboxRuntime`。

### 4.2 Agent 研究

```text
模型调用 sandbox_read_file / sandbox_shell 等研究工具
  → Agent Loop 调用 WorkflowBuilderResearchExecutor
  → Executor 验证参数和研究目录路径
  → 以 workflow_builder_research 身份执行
  → 返回研究结果
```

`sandbox_shell` 不允许继续调用现有的裸 `SandboxClient.exec`。它必须强制以研究身份执行，并使用研究目录作为工作目录。即使模型提交 `cat ../transaction/workflow.json`，OS 权限也必须拒绝。

### 4.3 Workflow CLI 查询

```text
模型调用 workflow_cli_query
  → Gateway 取得 SharedWorkflowBuilderSandboxContext
  → TransactionRunner 以 workflow_builder_transaction 身份运行 CLI inspect/list/show
  → 返回结构化只读结果
```

### 4.4 Workflow CLI Apply

```text
模型调用 workflow_cli_apply(ChangeSet)
  → Gateway 写 transaction/runs/<id>/changeset.json
  → TransactionRunner 执行 changeset plan
  → 服务端 Core 校验 WorkflowPlan
  → LLM 语义审查
  → TransactionRunner 执行 changeset apply
  → 服务端读取 transaction/workflow.json
  → 校验 appId、Schema、base/target checksum
  → 返回验证后的 WorkflowDocument 给画布
```

事务执行前必须用本轮前端传入的 WorkflowDocument 覆盖 `transaction/workflow.json`。这样同一 Sandbox 的历史文件不能成为下一轮的工作流事实来源。

`workflow_cli_apply` 必须在 `transaction/.lock` 上获取独占锁，覆盖写入、Plan、Apply、读取结果和清理临时目录处于同一个锁范围内。

## 5. 开发流程

### 阶段 0：前置验证

目的：确认所有当前 Sandbox provider 镜像可执行多用户隔离。

1. 对当前支持的 OpenSandbox、Sealos Devbox、E2B 镜像执行最小探针。
2. 验证可创建非特权用户、设置目录 owner/mode，并以指定用户执行命令。
3. 验证研究身份无法读取、列出、软链接访问或 Shell 访问事务目录。
4. 验证事务身份不能读取研究目录中的用户文件，除非服务端显式复制需要的输入。
5. 若任一 provider 不支持 OS 用户隔离，该 provider 不得进入该版本的 Builder 支持范围；不能退回双 Sandbox 或提示词隔离。

交付物：provider 能力矩阵和最小集成测试。

### 阶段 1：定义共享 Context 与目录初始化

修改 `pro/admin/src/service/core/ai/workflowBuilder/sandbox.ts`：

1. 删除 transaction chatId 派生和第二个 Sandbox prepare action。
2. 新建单 Sandbox 初始化函数，返回 `SharedWorkflowBuilderSandboxContext`。
3. 创建 `research/`、`transaction/`、运行目录和锁文件。
4. 设置不同 owner、`0700` 权限和只读 CLI bundle 权限。
5. 把 Skill、用户文件复制到研究目录；把 CLI、当前 WorkflowDocument 写入事务目录。
6. 所有临时 ChangeSet 和 Plan 文件放在 `transaction/runs/<nanoid>/`，在 finally 中删除。

完成标准：一个 Builder 请求中只有一次 `prepareAgentSandboxRuntime`、一次初始化租约和一个 sandboxId。

### 阶段 2：引入 Research Executor

当前 Agent Loop 的 `systemTools.sandbox` 只接受 `SandboxClient`，两种 provider 都会直接调用 `runSandboxTools`。这无法安全表达 Builder 的受限研究身份。

修改共享 Agent Loop 接口，但不改变非 Builder 的产品行为：

1. 在 `packages/service/core/ai/llm/agentLoop/domain/tool.ts` 定义 `AgentLoopSandboxExecutor`。
2. 让 `AgentLoopSystemTools.sandbox` 接收 executor，而不是直接接收 `SandboxClient`。
3. 将现有 `runSandboxTools({ sandboxClient })` 封装为普通 Agent 使用的默认 executor。
4. 在 fastAgent 与 piAgent 的 Sandbox tool 分发处统一调用 executor，不能保留一条 Builder 专用旁路。
5. 在 Pro 新建 `WorkflowBuilderResearchExecutor`，实现同一套 Sandbox 工具协议，但所有操作都通过研究身份和研究目录执行。

Research Executor 必须覆盖当前已注册的工具：

- `sandbox_read_file`
- `sandbox_write_file`
- `sandbox_edit_file`
- `sandbox_ls`
- `sandbox_find`
- `sandbox_grep`
- `sandbox_shell`
- `sandbox_get_file_url`

完成标准：Builder 的 Agent Loop 不再持有完整 `SandboxClient`；普通 Agent 的 Sandbox 工具测试保持通过。

### 阶段 3：收敛事务 Runner

修改 Builder 服务层：

1. `runner.ts` 只准备一次共享 Context，并把 Research Executor 注入 Agent Loop。
2. `cliGateway.ts` 从共享 Context 获取 TransactionRunner；删除 `getTransactionSandbox`。
3. `apply.ts` 不得再次调用 `ensureAgentSandboxRuntime`；只使用 TransactionRunner 运行 CLI Apply。
4. `handler.ts` 只接收最终验证后的 `WorkflowDocument`，不感知研究目录或事务目录。
5. `sandbox.ts` 中 CLI query、plan、apply 使用 transaction 用户和 transaction 目录。

完成标准：从 Builder Handler 到 CLI Apply 的完整链路不再出现 `:workflow-builder-transaction`。

### 阶段 4：删除双 Sandbox 实现

这是替换，不是兼容。

1. 删除 `getWorkflowBuilderTransactionChatId`。
2. 删除独立 transaction Sandbox 的创建、恢复、初始化和测试桩。
3. 删除 Builder 代码中任何“旧 Sandbox 不存在时创建第二个 Sandbox”的 fallback。
4. 不增加开关、环境变量、版本字段、双读写或运行时迁移逻辑。
5. 已存在的旧 transaction Sandbox 不迁移、不读取；由现有资源归档机制自然回收。
6. 已打开的 Builder 聊天下一次请求按新模型准备单 Sandbox；历史聊天文本继续保留，但不恢复旧事务文件。

完成标准：代码库中 Workflow Builder 不再出现第二个派生 transaction chatId 或第二次 runtime prepare。

### 阶段 5：验证与观测

新增或更新测试：

1. 同一 Builder 对话只创建一个 sandboxId。
2. 研究身份不能读取、写入、列出、软链接访问 transaction 目录。
3. 事务身份不能读取研究用户文件。
4. Agent 仍可读取 Skill、用户文件并进行受限 Shell/网络研究。
5. `workflow_cli_query` 只能读取 transaction/workflow.json。
6. `workflow_cli_apply` 仍能完成 Plan、Core 校验、语义审查、CLI Apply 和目标 checksum 校验。
7. 并发 Builder 请求无法交叉覆盖 transaction/workflow.json。
8. fastAgent 和 piAgent 都使用新的 Sandbox executor。
9. 普通 Agent Sandbox 工具回归测试通过。

增加 Builder 阶段耗时日志：

```text
sandboxPrepareMs
researchToolMs
cliPlanMs
coreValidateMs
semanticReviewMs
cliApplyMs
workflowReadbackMs
```

增加每轮 `sandboxInstanceCount`。单 Builder 对话的目标值为 `1`。

## 6. 文件改动清单

| 文件或目录 | 改动 |
| --- | --- |
| `pro/admin/src/service/core/ai/workflowBuilder/sandbox.ts` | 单实例初始化、目录与 OS 用户隔离、Research Executor、TransactionRunner |
| `pro/admin/src/service/core/ai/workflowBuilder/runner.ts` | 一次 Sandbox 准备，注入 Research Executor，删除 transaction promise |
| `pro/admin/src/service/core/ai/workflowBuilder/cliGateway.ts` | 复用共享 Context 的事务执行能力 |
| `pro/admin/src/service/core/ai/workflowBuilder/apply.ts` | 删除第二次 runtime prepare，只执行事务 Apply 与最终校验 |
| `pro/admin/src/service/core/ai/workflowBuilder/handler.ts` | 删除 transaction Sandbox 参数传递，仅保留最终文档应用 |
| `packages/service/core/ai/llm/agentLoop/domain/tool.ts` | 定义 Sandbox Executor 领域接口 |
| `packages/service/core/ai/llm/agentLoop/provider/fastAgent/*` | 使用 Sandbox Executor 调度工具 |
| `packages/service/core/ai/llm/agentLoop/provider/piAgent/*` | 使用 Sandbox Executor 调度工具 |
| `packages/service/core/ai/sandbox/application/toolCall/*` | 提供普通 Agent 的默认 executor 工厂 |
| `pro/admin/test/core/ai/workflowBuilder/*` | 单实例、权限、CLI 事务与性能观测测试 |
| `packages/service/test/core/ai/llm/agentLoop/*` | fastAgent/piAgent executor 回归测试 |

## 7. 验收标准

- Builder 普通问答、文件研究、CLI 查询、CLI 生成和 Apply 都只关联一个物理 sandboxId。
- `transaction/workflow.json` 无法通过任何 Agent 可见工具读取或修改。
- 模型即使输出绝对路径、`../`、软链接、Shell 命令，也不能跨越研究目录。
- CLI Apply 成功后画布拿到的仍是服务端验证后的 WorkflowDocument。
- 不存在双 Sandbox 分支、旧 transaction chatId、兼容开关或 fallback。
- 运行详情可分段展示耗时，能够证明 Sandbox 启动和 CLI/LLM 各自的时间占比。

## 8. 风险与决策

最大风险不是代码改动，而是 provider 是否支持可靠的同实例多用户权限隔离。若 provider 镜像不能提供该能力，不能用提示词或路径字符串替代；应先补齐镜像能力，再发布单 Sandbox Builder。

该方案会改动 Agent Loop 对 Sandbox tool 的执行接口，因此必须同时覆盖 fastAgent 和 piAgent。这里的共享接口改造是为了支持“受限执行器”这一新能力，不是为了保留旧 Builder 方案。Builder 本身不会保留双 Sandbox 或兼容逻辑。
