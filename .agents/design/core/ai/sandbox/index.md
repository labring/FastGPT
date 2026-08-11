# Agent Sandbox 当前设计

状态：当前实现

最后核对：2026-08-12

用户级实例、生命周期、Legacy 迁移以及本分支后续变更的最终契约统一见
[用户级 Sandbox 最终方案](./user-level-sandbox.md)。本文只维护当前代码入口和运行行为索引。

OpenSandbox Kubernetes PVC 的问题定论、生命周期设计和验证记录统一见
[OpenSandbox Kubernetes PVC 生命周期问题与设计](./opensandbox-pvc-lifecycle.md)。

## 目标与边界

Agent Sandbox 为 Agent 提供隔离的 Linux 运行环境、文件系统和工具调用能力，同时维护物理实例、业务归属、Provider 生命周期、归档恢复和 Skill 部署。

Sandbox 不负责 Agent 的模型循环、Workflow 调度或 Skill 版本创建。Agent Loop 只持有已经准备好的 `SandboxClient`，具体实例管理留在 Sandbox 模块。

## 分层

目录：`packages/service/core/ai/sandbox`

```text
interface
  对 Workflow、API、Skill Edit 暴露稳定入口
      |
application
  runtime / toolCall / file / resource / archive 编排
      |
infrastructure
  instance repository / provider adapter / runtime profile / volume
      |
provider: opensandbox | sealosdevbox
```

约束：

- 外部业务从 `interface/*` 引用，不直接依赖 infrastructure。
- `SandboxClient` 只用于运行态，可能创建或恢复实例。
- 历史资源 stop/delete 使用 resource service，不能通过运行态 client 触发隐式恢复。
- Mongo 读写集中在 instance repository。

## 实例身份

业务归属统一使用：

- `sourceType`：当前支持 App 和 Skill Edit。
- `sourceId`：App id 或 Skill id。
- `userId`：实例逻辑身份的一部分。App 使用有效用户 ID；Skill Edit 固定使用
  `ChatSourceTypeEnum.skillEdit`。
- `chatId`：只用于 App Sandbox 内的 session 目录，不参与实例或 Provider 资源 ID。
- `sandboxId`：Provider 侧的物理资源标识，不替代业务归属。

当前寻址规则：

| 场景 | sandboxId | 归属 |
| --- | --- | --- |
| App chat | `app-<hash(sourceId-effectiveUserId)>` | `sourceType=app`，`userId=effectiveUserId` |
| Skill Edit | `skilledit-<hash(sourceId-skillEdit)>` | `sourceType=skillEdit`，`userId=skillEdit` |
| Chat Agent Helper | 不支持 Sandbox | 调用时直接报错 |

`agent_sandbox_instances_v2` 使用 `(provider, sandboxId)` 唯一索引，并使用
`(sourceType, sourceId, userId)` 唯一约束逻辑身份。v2 不保留旧 ID 生成规则的兼容分支。

旧 `appId`、`type` 和 `metadata.skillId` 字段只用于 Legacy 数据识别与用户级 Sandbox 迁移。新运行态写入和业务查询只使用 `sourceType/sourceId`，不能新增旧字段兼容分支。

## Provider 与 Runtime Profile

当前 Provider：

- `opensandbox`
- `sealosdevbox`

`infrastructure/provider/runtimeProfile` 负责把 Provider 映射为默认镜像、工作目录、HOME、环境变量和创建参数。业务层不能根据 Provider 名称自行拼这些值。

当使用 Sandbox 时必须配置 `AGENT_SANDBOX_PROVIDER`；未知或缺失 Provider 显式报错。

公共 `stop()` 执行 Provider 自身的停止策略：OpenSandbox 删除远端计算实例但保留 FastGPT 管理的
volume、Mongo 记录和 S3 归档，Sealos Devbox 则暂停远端实例。业务级删除始终继续清理全部受管资源。

## 运行态生命周期

### 获取实例

`getSandboxClient` 的流程是：

1. 校验 sandboxId、sourceType 和 sourceId。
2. 读取当前 Provider 和可选 volume 配置。
3. 如果实例已归档，按策略恢复；保活接口可以显式禁止恢复。
4. 构造 `SandboxClient`，写入或刷新 running 实例记录。
5. 确保远端 Provider 实例可用。

上层在调用 `prepareAgentSandboxRuntime` 前完成普通 App 可用性判断或 Skill Edit 强可用性断言；
runtime preparation 不再接受绕过权限检查的布尔参数。随后根据标准 chat source 计算 sandboxId。

### 初始化并发

同一 sandbox 的初始化通过 Redis lease 串行化：

```text
agent-sandbox:init:<sandboxId>
```

锁覆盖文件部署、entrypoint 和 Skill 扫描，避免并发请求交错修改同一工作区。租约会自动续期，获取失败转换为标准 initializing 错误。

### Prepare pipeline

Sandbox 初始化使用 `prepareSandbox(context, ...steps)` 顺序组合步骤。可复用步骤包括：

- 创建或检查工作目录。
- 注入本轮输入文件到 `user_files`。
- 配置 npm/pnpm/yarn/bun/pip/uv 镜像。
- 同步内置 Skill。
- 注入已发布 Skill 版本。
- 执行 Sandbox 和 Skill entrypoint。
- 扫描 `SKILL.md`。

具体场景只组合需要的 step，不在通用 prepare 层读取业务数据库。

### 运行时配置收敛

App Agent 和 ToolCall 在实际使用 Sandbox 前调用 `ensureAppSandboxRuntimeReady`。Provider 或镜像变化时，
同一次 Workflow 先通过标准 archive/provider migration 收敛配置，再继续恢复 runtime；前端只消费
`upgrading -> lazyInit` 粗粒度状态。Skill Edit 保留显式确认和轮询升级。

### 命令、文件与连接

- OpenSandbox 命令统一消费 SSE，在 `execution_complete` 或 `error` 终态立即结束内部流；无终态 EOF、
  iterator 异常和调用方取消进入对应错误边界，不再等待 Provider 延迟关闭响应体。
- 目录、文件读写、枚举、删除和移动优先使用 `ISandbox` 文件 API；只在解压、递归扫描等需要 shell
  语义时执行命令，并通过 `workingDirectory` 传入已知工作目录。
- 每个 `SandboxClient` 独占 provider adapter，每次请求检查 Provider readiness；同一 client 内的并发
  检查复用 Promise。当前不使用跨请求 `ready` cache，避免连接被关闭后仍复用过期状态。

## Entrypoint

### Sandbox entrypoint

- 脚本来自 runtime 配置。
- 在工作目录执行。
- 按脚本 hash 记录成功状态；内容不变时不重复执行。
- 状态保存在 Sandbox HOME 的 runtime state，不写入用户工作区。
- runtime state 统一使用 `values: Record<string, string | string[]>`，让 hash、etag 和版本列表共享读写、
  校验、去重与空值清理逻辑。
- 失败、超时或状态写入失败记录日志但不阻断 Agent 主流程。

### Skill entrypoint

- 可选文件名固定为 Skill 版本根目录的 `entrypoint.sh`。
- 在对应版本目录执行。
- 成功状态按不可变 `versionId` 记录，只执行一次。
- 未选中的版本会从执行状态中清理。
- 输出和运行时间受统一限制，失败不写成功状态。

## Sandbox 工具

当前系统工具集合：

- `sandbox_shell`
- `sandbox_read_file`
- `sandbox_write_file`
- `sandbox_edit_file`
- `sandbox_grep`
- `sandbox_find`
- `sandbox_ls`
- `sandbox_get_file_url`

工具定义和名称位于 `packages/global/core/ai/sandbox`，执行实现在 `application/toolCall`。`runSandboxTools` 统一完成 JSON 参数解析、Zod 校验、工具选择和标准结果转换。

文件/命令输出遵循共享裁剪规则；read file 使用 offset/limit，内容搜索和路径搜索分别使用 grep/find，已经不存在旧 `sandbox_search` 兼容入口。

## Skill 部署

普通 Agent runtime 可以把选中的已发布 Skill 版本注入 Sandbox：

1. 校验团队资源和成员读取权限。
2. 下载当前版本 ZIP。
3. 校验解压总大小和路径穿越。
4. 以 versionId 部署到 runtime 的 projects 目录。
5. 清理不再选中的版本目录。
6. 执行版本 entrypoint。
7. 扫描 `SKILL.md`，把名称、描述和路径写入 Agent reminder。

Skill Edit 复用编辑器 Sandbox 中的当前工作区，不把编辑中的内容当成已发布版本重新下载。

内置 Skill 同步到 Sandbox HOME 下的 `.fastgpt/skills/<name>`，不进入用户 workspace、编辑器树、导出包或发布包。同步状态按文件内容 etag 记录，内容未变化时跳过覆盖。

## 资源停止、删除与归档

- 不活跃的 running 实例由 cron 停止并标记为 stopped。
- 删除资源时同步清理 Provider 实例、Mongo 记录、可选 volume 和 S3 归档。
- App chat 删除只清理聊天记录和 chat S3 文件，不删除共享 Sandbox，也不清理 Sandbox 内的 `sessions/<chatId>` 目录。
- App 删除清理该 source 下全部用户级 v2 与 Legacy Sandbox，包括 Provider 实例、Mongo 记录、可选 volume 和 S3 归档。
- Skill 删除清理 Skill Edit 相关 Sandbox；普通编辑聊天删除不直接删除共享 edit-debug Sandbox。
- stopped 实例可进入冷归档；恢复时通过 archive 状态机避免与归档、删除并发。
- keepalive 只刷新 running 实例；stopped、stopping、不存在或 archived 状态均幂等结束，不创建、恢复或
  返回生命周期错误。只读存在性检查同样不能拉起 archived Sandbox。

## 可用性降级

普通 App Chat 在系统关闭、App 未开启或团队套餐不可用时，不注入 Sandbox prompt、tools 和依赖
Sandbox 的 Skill，也不准备 runtime；其他对话能力继续运行。关闭原因通过
`systemDisabled/appDisabled/teamPlanUnavailable` 表达。

Skill Edit 和 Skill 调试保持强依赖。文件 API 在服务端重新校验可用性，`checkExist` 只查询本地
记录并返回可选关闭原因，不创建或恢复实例。

## Workspace 预览

HTML 预览和 `sandbox_get_file_url` 使用 Redis preview session 签发短期只读 URL。公开请求经
`agent-sandbox-proxy` 回查 FastGPT，再由 Sandbox 内 `fastgpt-ide-agent:1319` 在 Workspace 范围内
流式返回文件；预览不再上传临时文件到 S3，也不改变 Workspace 冷归档流程。

## API 与权限

Sandbox 文件、ticket、preview、keepalive 等 API 位于 `projects/app/src/pages/api/core/ai/sandbox`。API 边界负责：

- 使用 `parseApiInput` 校验请求。
- 将外部资源参数转换为标准 `sourceType/sourceId`。
- 校验 App、Skill、outlink 和团队权限。
- 签发或验证带 source、user、chat 和权限声明的 ticket。

内部 runtime 接口假定调用方已经完成普通 App 可用性判断或 Skill Edit 强可用性断言，不再重复
查询团队套餐。

## 主要代码入口

| 能力 | 路径 |
| --- | --- |
| Runtime 接口 | `packages/service/core/ai/sandbox/interface/runtime.ts` |
| Tool 接口 | `packages/service/core/ai/sandbox/interface/toolCall` |
| Resource 接口 | `packages/service/core/ai/sandbox/interface/resource` |
| Preview 接口 | `packages/service/core/ai/sandbox/interface/preview` |
| Migration 接口 | `packages/service/core/ai/sandbox/interface/migration` |
| Runtime client | `packages/service/core/ai/sandbox/application/runtime/client.ts` |
| 初始化 pipeline | `packages/service/core/ai/sandbox/application/runtime/prepare.ts` |
| Skill runtime | `packages/service/core/ai/sandbox/application/runtime/skill` |
| 资源服务 | `packages/service/core/ai/sandbox/application/resource.ts` |
| 归档服务 | `packages/service/core/ai/sandbox/application/archive.ts` |
| Legacy migration | `packages/service/core/ai/sandbox/application/legacyMigration` |
| 实例仓储 | `packages/service/core/ai/sandbox/infrastructure/instance` |
| Provider profile | `packages/service/core/ai/sandbox/infrastructure/provider/runtimeProfile` |

## 验证范围

Sandbox 改动应按影响范围覆盖：

- source/sandboxId 寻址和 schema 索引。
- Provider runtime profile。
- client 创建、恢复、停止、删除和归档状态。
- 初始化 lease、prepare 顺序和 entrypoint 幂等性。
- 各 Sandbox 工具的参数、输出裁剪和错误路径。
- Skill 包权限、大小、路径安全、部署、扫描和内置 Skill etag 同步。
