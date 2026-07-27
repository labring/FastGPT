# 用户级 Sandbox 最终方案

状态：已实现，作为当前分支唯一技术方案

最后核对：2026-07-27

## 1. 目标与范围

普通 App Chat 的 Sandbox 隔离边界由 `appId + effectiveUid + chatId` 收敛为
`appId + effectiveUid`。同一 App、同一有效用户的多个 Chat 共享一个物理 Sandbox 和
Workspace，`chatId` 只用于区分 `sessions/<chatId>` 下的默认工作目录。

本方案同时定义用户级 Sandbox 必须依赖的最终契约：

- v2 实例身份、数据模型和生命周期状态机。
- App session、Skill runtime 和 Skill Edit 的路径边界。
- Legacy Workspace 向用户级 Sandbox 的迁移与发布屏障。
- Provider 或镜像变化时的运行时收敛。
- Sandbox 不可用时的 App Chat 降级。
- Workspace 文件直连预览。
- OpenSandbox 与 Sealos Devbox 的最终生命周期差异。

Sandbox 不负责 Agent 模型循环、Workflow 调度或 Skill 版本创建。Agent 和 ToolCall 只在确认本轮
需要且允许使用 Sandbox 后，获取已经准备好的 `SandboxClient`。

## 2. 核心不变量

### 2.1 实例身份

业务归属统一使用 `sourceType/sourceId/userId`，物理资源使用稳定 `sandboxId`：

| 场景 | 逻辑身份 | sandboxId |
| --- | --- | --- |
| App Chat | `app + appId + effectiveUid` | `app-<hash(appId-effectiveUid)>` |
| Skill Edit | `skillEdit + skillId + skillEdit` | `skilledit-<hash(skillId-skillEdit)>` |
| Chat Agent Helper | 不支持 Sandbox | 调用时显式报错 |

其中 hash 取 16 位小写十六进制。App 和 Skill Edit 都不把 `chatId` 放入实例 ID；不保留旧三参数
ID、无前缀 ID 或空 `userId` 的运行时兼容分支。

### 2.2 Workspace 路径

App Sandbox 的路径固定拆分为：

```text
workspaceRoot        = <provider workDirectory>
runtimeSkillsRoot    = <workspaceRoot>/projects
sessionWorkDirectory = <workspaceRoot>/sessions/<chatId>
```

- Sandbox 工具、用户输入文件和 Sandbox Editor 默认使用 `sessionWorkDirectory`。
- 已发布 Skill 版本部署到共享 `runtimeSkillsRoot`。
- App entrypoint 在 `workspaceRoot` 执行，并按物理 Sandbox 记录执行状态。
- Skill Edit 使用 Workspace 根目录，不参与 App session 目录模型。
- Session 目录是默认工作目录，不是同一 Sandbox 内的硬安全边界。
- Sandbox Editor 本轮只展示当前 session，不提供切回 Workspace 根目录的 UI。

### 2.3 生命周期

- `agent_sandbox_instances_v2` 是新运行时的唯一实例表。
- 顶层 `status` 是唯一权威生命周期状态。
- `metadata.operation` 只记录 operation token、持久阶段、心跳和错误，不承担第二套状态判断。
- 普通 runtime 不得连接 `legacyMigrating` 或其他过渡态实例。
- 单个 Chat 删除不删除共享 Sandbox，也不单独清理 `sessions/<chatId>`。
- App 或 Skill 删除负责清理所属 v2 与 Legacy 资源。

## 3. 数据模型

### 3.1 v2 实例

```typescript
type SandboxInstance = {
  provider: 'opensandbox' | 'sealosdevbox';
  sandboxId: string;
  sourceType: 'app' | 'skillEdit';
  sourceId: string;
  userId: string;
  status:
    | 'provisioning'
    | 'legacyMigrating'
    | 'running'
    | 'stopping'
    | 'stopped'
    | 'archiving'
    | 'archived'
    | 'restoring'
    | 'deleting';
  lastActiveAt: Date;
  createdAt: Date;
  limit?: SandboxLimit;
  storage?: SandboxStorage;
  metadata?: {
    teamId?: string;
    tmbId?: string;
    volumeEnabled?: boolean;
    image?: SandboxImage;
    sessionId?: string;
    skillIds?: string[];
    skillName?: string;
    versionId?: string;
    operation?: {
      id: string;
      type: 'provision' | 'legacyMigration' | 'stop' | 'archive' | 'restore' | 'delete';
      phase: string;
      previousStatus?: 'running' | 'stopped' | 'archived';
      startedAt: Date;
      heartbeatAt: Date;
      failedAt?: Date;
      error?: string;
    };
  };
};
```

约束：

- `(provider, sandboxId)` 唯一，约束 Provider 侧物理资源记录。
- `(sourceType, sourceId, userId)` 唯一，约束业务逻辑实例。
- 稳定态只有 `running/stopped/archived`，稳定态不得残留 operation。
- 每个过渡态必须匹配唯一 operation 类型。
- 过渡态接管按 `status + metadata.operation.heartbeatAt` 查询，空闲资源按
  `status + lastActiveAt` 查询。
- v2 不包含 `chatId`、旧 `appId/type`、`metadata.archive` 或 `metadata.migration`。

### 3.2 Legacy 实例

旧 `agent_sandbox_instances` 使用独立 Legacy Schema，只允许 migration repository、迁移预检和
Source 删除清理读取。普通 runtime、归档 cron、资源 API 和 Skill Edit 不得回退查询 Legacy 表。

已确认 Legacy 数据不存在 E2B 记录，因此当前 Provider 和迁移范围仅包含 OpenSandbox 与 Sealos
Devbox，不保留 E2B adapter 或数据兼容分支。

## 4. 运行时与文件行为

`prepareAgentSandboxRuntime` 根据标准 Chat source 生成稳定 ID，并返回 `sandboxClient`、
`workspaceRoot` 和当前 `workDirectory`。完整路径只通过 `SandboxClient.getRuntimePaths()` 暴露给
文件 API、IDE 和 migration，避免调用方自行拼接 Provider 路径。

App runtime 遵循以下规则：

1. shell 和文件工具以 `sessionWorkDirectory` 为默认目录。
2. 相对路径锚定当前 session；绝对路径必须位于 `workspaceRoot` 内。
3. 用户输入文件写入 `<sessionWorkDirectory>/user_files`。
4. 写文件、运行时文件注入和 HTTP 上传在调用 Provider `writeFiles` 前统一创建目标父目录。
5. Skill 包和 Skill entrypoint 使用共享 `runtimeSkillsRoot`，不进入 session 目录。
6. 内置 Skill 同步到 Sandbox HOME 下的 `.fastgpt/skills/<name>`，不进入用户 Workspace、编辑树、
   导出包或发布包。
7. App entrypoint 在 `workspaceRoot` 执行；同一脚本内容按 hash 幂等执行。

同一 Sandbox 的 prepare 使用 `agent-sandbox:init:<sandboxId>` Redis lease 串行化。锁覆盖 session
目录准备、输入文件注入、镜像源、Skill 同步、entrypoint 和 Skill 扫描；锁释放后，后续 Chat 可以
重新调整共享 `projects`，因此 `/projects` 不承诺在一次 Agent 执行期间保持不变。

## 5. 生命周期与并发

### 5.1 状态转换

| 操作 | 起始状态 | 过渡态 | 终态 |
| --- | --- | --- | --- |
| 首次创建 | 无记录 | `provisioning` | `running` |
| Legacy 导入 | 无记录或可接管目标 | `legacyMigrating` | `running` |
| 停止 | `running` | `stopping` | `stopped` |
| 归档 | `running/stopped` | `archiving` | `archived` |
| 恢复 | `archived` | `restoring` | `running` |
| 删除 | 可抢占状态 | `deleting` | 删除记录 |

每次生命周期操作先通过 Mongo CAS 抢占 operation，再执行 Provider、volume 或 S3 副作用；每个
副作用完成后持久化 phase，最后使用相同 operation ID 提交终态。失败保留过渡态、phase 和错误，
由原操作重试或满足隔离窗口后的 stale recovery 接管，不能直接把过渡态改回 `running`。

### 5.2 Lease 分层

锁顺序固定为：

```text
Source Mutation Lease -> Sandbox Lifecycle Lease
```

- Source Mutation Lease 串行化同一 App/Skill 的首次创建、Legacy 导入和业务删除。
- Sandbox Lifecycle Lease 以稳定 `sandboxId` 为键，跨 Provider 串行化单个物理身份的生命周期。
- Legacy migration job lease 只防止管理员重复调度，不承担单条资源正确性。
- prepare 初始化 lease 只保护运行时文件准备，不替代生命周期 lease。

长任务在每个远端副作用前后调用 lease `assertValid()`。Provider 的 create/start/stop/delete 必须
基于稳定 ID 保持幂等，重复删除或 404 按成功处理。App/Skill source 在创建、恢复、迁移前必须仍然
active；删除任务只处理已经持久标记删除的 source。

### 5.3 归档与删除

- v2 归档使用 `sandbox/archive/<sandboxId>/package.zip`。
- Legacy 归档继续使用 `agent-sandbox/<legacySandboxId>/package.zip`，不能直接改名为 v2 归档。
- restore 发布 `running` 后尽力删除已消费的 v2 S3 归档；清理失败不回滚已恢复 Workspace。
- App 删除清理全部用户级 v2 与 Legacy Provider 资源、volume、S3 和 Mongo 记录。
- Skill 删除清理 Skill Edit Sandbox；普通编辑 Chat 删除不删除共享 Skill Edit Sandbox。
- keepalive、存在性检查和历史资源 stop/delete 不得通过运行时 client 意外恢复 archived 实例。

## 6. Legacy Workspace 迁移

### 6.1 升级前提与预检

升级到当前镜像前，必须先在仍提供 `/api/admin/4150/init4150-beta6` 的上一版本完成 beta6 字段
归一化，再调用当前版本 `/api/admin/4160/initUserSandbox`。新入口默认 `dryRun=true`，不会自动
串联旧脚本。

管理员任务先对原始 Legacy 文档做整表预检。App 必须有合法的
`sourceType/sourceId/userId/chatId`，Skill 必须有合法的 `sourceType/sourceId`，且不得残留旧
`appId/type/metadata.skillId`。任一记录不合法时整次拒绝；预检通过前不写 v2、不连接 Provider、
不访问 S3。

### 6.2 两阶段迁移

迁移分为全量预归档和 Workspace 安装两个严格阶段：

1. 第一阶段为所有未完成 Legacy 记录生成或复用 S3 归档，确认归档后删除旧物理 Sandbox 和
   OpenSandbox volume，并提交 `archiveReady`。
2. 第一阶段继续收集全部失败；只要任一记录未完成归档、校验或资源删除，全局屏障就禁止第二
   阶段创建 migration 目标。
3. 第二阶段只从 Legacy S3 下载和安装 Workspace，不再连接或打包旧物理实例。
4. App 按 `sourceId + userId` 聚合到一个用户级目标；Skill Edit 搬到新的稳定 Skill ID。
5. 目标在安装期间保持 `legacyMigrating + legacyMigration operation`，普通 runtime 只能返回忙碌。
6. 所有分组文件至少提交 `installed` 后，才一次性发布目标为 `running`。
7. 发布后把 Legacy 阶段提交为 `completed`，保留旧 S3 和 Legacy Mongo 记录作为迁移备份。

第一阶段释放单个 Source Lease 后，正常用户请求可以先创建确定性的 v2 目标。第二阶段必须接管或
复用该目标，并按“目标内容优先”规则合并，不能覆盖已经产生的用户文件。

### 6.3 Workspace 安装规则

- 每条 App Legacy Workspace 安装到目标 `sessions/<legacyChatId>`。
- staging 中直接位于 `projects/` 下、名称为 24 位十六进制 Version ID 的运行时缓存目录不迁移。
- 目标 session 不存在时使用 staging + rename 原子提交。
- 目标已存在时递归合并；同名文件或文件/目录类型冲突都保留目标现有内容。
- 目录存在不能推断安装成功，必须以持久化 `installed` 阶段为准。
- 失败保留目标、Legacy 记录和归档；重试从持久 phase 继续，不重复已经确认的副作用。
- `completed` 是 Legacy 迁移终态，后续迁移只预检、不重复安装。

Skill 分组并发度为 20；App 分组并发度为 5，组内按 `lastActiveAt` 从新到旧串行安装。

## 7. 运行时配置收敛

App Chat 和 Workflow 只在 Agent 或 ToolCall 节点确定本轮实际使用 Sandbox 后，比较目标 Provider
以及目标镜像的 `repository + tag`：

- 配置一致时直接创建、恢复或连接 runtime。
- 镜像变化时通过标准 archive 状态机保存 Workspace，再使用目标镜像恢复。
- Provider 变化时先校验目标 adapter，再在同一个 Lifecycle Lease 中归档旧资源，随后对原记录
  原子切换 Provider 和镜像，最后使用标准 restore 恢复。
- 活跃 operation 由当前请求等待或接管，不能并发启动第二条迁移链。
- App 迁移在本次 Workflow 内静默完成，只发送 `upgrading -> lazyInit` 粗粒度状态，不弹窗、
  不重放用户请求；失败按标准 Workflow 错误终止当前节点。
- Skill Edit 继续由用户显式确认升级并在页面轮询，不复用 App Chat 的静默交互。

迁移过程不新增数据库状态；它复用 archive、restore 和稳定 `archived` 状态。历史记录缺少
`metadata.image` 时按镜像不一致处理。

## 8. Sandbox 不可用时的 App Chat 降级

普通 App Chat 使用三种稳定不可用原因：

- `systemDisabled`：系统未配置或已下架 Sandbox。
- `appDisabled`：当前 App Agent/ToolCall 未开启 Sandbox。
- `teamPlanUnavailable`：应用团队套餐不提供 Sandbox，套餐查询失败也按该原因降级。

不可用时不注入 Sandbox system prompt、Sandbox tools 或依赖 Sandbox 的 Skill，不准备 runtime、
不执行 entrypoint，也不把关闭状态写成 Agent/ToolCall 错误；其他模型、工具、知识库和 Workflow
节点继续运行。Skill Edit 和 Skill 调试仍是 Sandbox 强依赖，保持结构化错误阻断。

`checkExist` 同时返回真实本地实例存在性和可选 `unavailableReason`，查询本身不能创建或恢复实例。
页面加载与对话期间不主动提示；只有用户点击现有虚拟机入口时刷新状态并显示统一 Toast。Ticket、
上传、下载和预览 API 仍在服务端重新校验可用性，不能依赖前端守卫。

## 9. Workspace 直连预览

HTML 预览和 `sandbox_get_file_url` 不再把文件上传到 S3，而是签发短期只读 URL：

```text
<previewProxy>/preview/<sandboxId>/<sessionId>/<workspaceRelativePath>
```

最终链路为：

```text
FastGPT 创建 Redis preview session
  -> agent-sandbox-proxy 校验 session 并向 FastGPT 解析 Provider endpoint
  -> fastgpt-ide-agent:1319 在 FASTGPT_WORKDIR 内流式读取文件
```

关键约束：

- `sandboxId` 必须匹配 `app|skilledit-<16 hex>`；随机 `sessionId` 为 24 位字母数字字符串。
- session TTL 为 2 小时，每个 Sandbox 最多 500 个活动 session。
- URL 是对应 Sandbox 整个 Workspace 的临时只读 bearer capability，不只授权 URL 中单个文件。
- session 只保存业务寻址上下文，不保存 Provider endpoint 或 IDE agent 密码。
- 支持 `GET`、`HEAD`、ETag 和单段 Range；禁止目录列表、路径穿越和逃逸 Workspace 的软链接。
- 响应使用 `no-referrer`、`nosniff` 和 `private, no-store`；公开预览 origin 必须与 FastGPT App
  origin 隔离。
- HTML 资源必须使用 `./assets/...` 等相对路径；`/assets/...` 根路径不保留 preview URL 前缀。
- preview 与 Workspace 冷归档是独立能力，S3 archive 流程不受影响。

FastGPT、proxy 和包含 1319 preview listener 的 runtime image 必须协调发布，不支持新旧版本混合
滚动兼容。

## 10. Provider 与模块边界

### 10.1 Provider 最终契约

- OpenSandbox `stop()` 删除远端计算实例，不调用 pause；它不删除 FastGPT 管理的 volume、Mongo
  记录或 S3 归档。后续使用相同业务 `sandboxId` 创建新远端实例并重新挂载原 volume。
- Sealos Devbox `stop()` 继续调用 pause，因此公共 `stop()` 只表示“执行 Provider 停止策略”，
  不承诺复用同一个远端实例。
- OpenSandbox 已绑定 client 时通过 `Sandbox.kill()` 删除，cron 的未绑定 adapter 通过
  `SandboxManager.killSandbox()` 删除；两条路径都等待远端消失并保持幂等。
- `close()` 只释放本地 transport，不改变远端生命周期。
- Provider 默认镜像、工作目录、HOME、环境变量和创建参数统一由 runtime profile 解析，业务层
  不按 Provider 名称自行拼配置。

### 10.2 模块边界

Sandbox 模块保持单向依赖：

```text
interface -> application -> infrastructure -> sandbox-adapter
```

- 外部生产代码只从 `interface/*` 使用稳定能力。
- application 负责编排，不直接访问 Mongoose Model。
- v2 与 Legacy Mongo 读写集中在 `infrastructure/instance` repository。
- Legacy migration 按 `service/workspace/cleanup/types` 拆分，阶段判断留在 application。
- 对外聚合只使用目录 `index.ts`，不保留非 `index.ts` 的兼容转发文件。
- 架构测试阻止反向依赖、外部绕过 interface 和 Sandbox 内部循环导入。

具体入口和当前工具集合见 [Agent Sandbox 当前设计](./index.md)。

## 11. 验证范围

用户级 Sandbox 改动至少覆盖：

- App/Skill ID 稳定性、source 唯一索引和 v2 schema 状态约束。
- Runtime Context、session/Skill 路径、父目录创建和 Editor 路径换算。
- Source/Lifecycle/init lease、operation fencing、stale 接管和 Provider 幂等。
- stop、archive、restore、delete、Provider/镜像迁移的副作用顺序和失败恢复。
- Legacy 整表预检、全量预归档屏障、目标内容优先合并、发布屏障和幂等重试。
- App 三种不可用原因的静默降级，以及 Skill Edit 强依赖行为。
- preview session、鉴权、TTL/限额、HTTP Range、路径穿越和软链接逃逸。
- App/Chat/Skill 删除边界以及 v2/Legacy S3 key 隔离。

## 12. 收敛 TODO

- [x] 用户级 ID、v2 schema、共享 Workspace 和 session 默认目录落地。
- [x] 生命周期状态机、operation runner、Lease 分层和 Source fence 落地。
- [x] Legacy 两阶段迁移、备份保留、v2 归档 key 与管理员入口落地。
- [x] App Provider/镜像静默迁移和 Skill Edit 显式升级交互落地。
- [x] App Chat 不可用降级、文件 API 服务端兜底和三语提示落地。
- [x] Workspace 直连预览、proxy 与 runtime listener 落地。
- [x] OpenSandbox/Sealos stop 契约和 sandbox-adapter 结构收敛。
- [x] Sandbox 模块依赖边界、Repository 和公共 interface 收敛。
- [x] 将阶段性技术方案合并到本文并删除重复文档。
