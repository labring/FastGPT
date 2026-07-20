# 用户级 Sandbox 需求与技术设计

## 1. 背景

当前 App Chat 按 `appId + effectiveUid + chatId` 生成 Sandbox ID。同一 App、同一用户的不同 Chat 因此会创建不同物理 Sandbox，Workspace、归档对象和运行时初始化也彼此独立。

本需求将普通 App Sandbox 的业务隔离边界调整为 `appId + effectiveUid`，并在共享 Workspace 中通过 `sessions/<chatId>` 组织会话文件。Skill Edit 继续使用 Skill 级稳定 Sandbox，不参与 session 目录模型。

Notion 规格：<https://app.notion.com/p/39dded3f8cd8819cba9ff33b6f94fce9>

## 2. 已确认需求

### 2.1 隔离与路径

- App Sandbox ID 只由 `sourceId + effectiveUid` 生成，不再包含 `chatId`。
- 不同 App 或不同 effectiveUid 仍使用不同 Sandbox。
- `chatId` 只保留在运行时上下文中，不持久化到新实例表。
- App Workspace 路径拆分为：

```text
workspaceRoot        = <provider workDirectory>
runtimeSkillsRoot    = <workspaceRoot>/projects
sessionWorkDirectory = <workspaceRoot>/sessions/<chatId>
```

- Sandbox 工具和用户文件默认使用 `sessionWorkDirectory`。
- App entrypoint 在 `workspaceRoot` 启动，并按物理 Sandbox 维度记录执行 hash。
- Sandbox Editor 固定以 `sessionWorkDirectory` 作为文件树根目录；Workspace 根目录切换不在本次需求范围内。
- Session 目录只是默认工作目录，不作为硬安全边界。

### 2.2 Skill 与初始化并发

- Skill 包始终同步到共享 `runtimeSkillsRoot`。
- 继续使用 Sandbox ID 级 Redis 初始化锁串行化镜像源、Skill 同步、输入文件注入和 entrypoint 准备。
- 锁在初始化完成后释放；后续会话初始化可以重新同步和调整共享 `/projects`。
- 本需求不保证某次会话初始化完成后 `/projects` 在整个 Agent 执行期间保持不变。

### 2.3 实例与生命周期

- 新集合使用 `agent_sandbox_instances_v2`，旧 `agent_sandbox_instances` 只作为迁移数据源。
- 新实例记录不包含 `chatId`、`appId` 或旧 `type` 字段。
- 顶层 `status` 是 v2 实例生命周期的唯一权威状态；不再使用
  `metadata.archive.state` 或 `metadata.lifecycle.state` 表达第二套状态。
- `metadata.operation` 只记录当前状态迁移的操作令牌、执行阶段和错误上下文，不参与业务状态判断。
- Legacy Workspace 导入是本分支 migration 模块的核心生命周期流程，正式使用
  `legacyMigrating` 状态和 `legacyMigration` operation，但不设置 `metadata.migration`。
- migration 构建目标期间保持 `legacyMigrating`；全部 Workspace 安装完成后才一次性发布为
  `running`。普通 runtime 不得连接尚处于 `legacyMigrating` 的目标。
- App/Skill 删除可以在 Source Lease 和 Lifecycle Lease 下 fence 旧 operation，并把任意状态
  显式抢占为 `deleting`，但不得绕过仍持有有效 lease 的生命周期任务。
- 单个 Chat 删除不删除共享 Sandbox，也不单独删除对应 session 目录。
- App 删除继续删除该 App 下全部用户级 Sandbox、Workspace 和归档对象。

### 2.4 历史 Workspace 迁移

- 旧 Workspace 中直接位于 `projects/` 下、名称为 Skill Version ID 的运行时缓存目录不迁移。
- 其他文件保持原相对路径进入目标 session。
- `sessions/<chatId>` 不存在时，使用 staging + rename 提交为该目录。
- `sessions/<chatId>` 已存在时，将 staging 递归合并进 session；同名文件或类型冲突均以
  session 现有内容为准，旧内容直接舍弃。
- 单条旧记录安装成功后，同步删除旧 S3 归档并按 `_id` 删除旧实例记录。
- 旧记录仍存在就是该条迁移尚未完成或清理尚未完成的进度依据。

## 3. 数据模型

### 3.1 新实例集合

```typescript
type SandboxInstance = {
  provider: SandboxProviderType;
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
    | 'providerMigrating'
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
      type:
        | 'provision'
        | 'legacyMigration'
        | 'stop'
        | 'archive'
        | 'restore'
        | 'providerMigration'
        | 'delete';
      phase: string;
      previousStatus?: 'running' | 'stopped' | 'archived';
      startedAt: Date;
      heartbeatAt: Date;
      failedAt?: Date;
      error?: string;
      fromProvider?: SandboxProviderType;
      targetProvider?: SandboxProviderType;
    };
  };
};
```

约束：

- `provider + sandboxId` 唯一，约束单个 provider 的物理记录。
- App 与 Skill Edit 共用 unique index：`sourceType + sourceId + userId`。
- App 记录的 `userId` 是有效用户 ID；Skill Edit 记录的 `userId` 固定为
  `ChatSourceTypeEnum.skillEdit`，不使用发起编辑的真实用户 ID。
- v2 记录的 `userId` 必填；`chatId` 不写入实例记录。
- 稳定态候选索引使用 `status + lastActiveAt`；过渡态接管索引使用
  `status + metadata.operation.heartbeatAt`。不再为 `metadata.archive.*` 建立索引。

### 3.2 旧实例集合

旧集合保留独立 Legacy Schema，只供管理迁移模块使用。运行时 Repository、Skill Edit、归档 cron、资源 API 和清理逻辑不得再导入 Legacy Model；v2 身份寻址不兼容旧 sandboxId。

## 4. 运行时设计

### 4.1 ID 生成

- v2 统一使用 `generateSandboxId({ sourceType, sourceId, userId })`。
- 输出格式为 `sourceType + "-" + hash(sourceId + "-" + userId)`，hash 保留 16 位小写十六进制。
- App 使用有效用户 ID；Skill Edit 使用固定值 `ChatSourceTypeEnum.skillEdit`。
- App 与 Skill Edit 均不把 `chatId` 放入 ID；`chatId` 只映射到 App Sandbox 的 session 目录。
- 不保留旧三参数 ID 或无前缀 ID 的兼容分支。

### 4.2 Runtime Context

`prepareAgentSandboxRuntime` 返回：

```typescript
{
  sandboxClient;
  workspaceRoot;
  workDirectory;
}
```

其中 `workDirectory` 是当前 prepare step 的默认目录：App 使用
`sessionWorkDirectory`，Skill Edit 使用 `workspaceRoot`。完整的三个运行时路径只由
`SandboxClient.getRuntimePaths()` 暴露给文件 API、IDE 和迁移逻辑，不重复铺到 prepare context。

`SandboxClientQuery` 仍可接收 `chatId`，但仅用于构造运行时路径；`ensureAvailable` 不再将其写入实例记录。

### 4.3 工具和文件路径

- `SandboxClient.exec` 对 App 命令先确保 session 目录存在，再从 session 目录执行。
- read/write/edit/search/getFileUrl 的相对路径锚定到 session 目录。
- 绝对路径只允许位于 `workspaceRoot` 内，避免文件 API 越过当前 Sandbox Workspace。
- 输入文件写入 `<sessionWorkDirectory>/user_files`。
- Skill 注入和 Skill entrypoint 使用 `runtimeSkillsRoot`，不使用 session 目录。
- 现有按 `sandboxId` 的 Redis 初始化 lease 覆盖共享 `/projects` 写入；Chat 2 只能在 Chat 1
  初始化完成后重新同步或调整 Skill。
- App entrypoint 使用 provider 原生 execute，并在 `workspaceRoot` 执行。

### 4.4 Sandbox Editor

- Ticket 响应增加 `workspaceRoot` 和 `sessionWorkDirectory`。
- 前端文件树初始目录使用 `sessionWorkDirectory`。
- 本次不提供返回 `workspaceRoot` 的面包屑或根目录切换状态。
- 现有 proxy 和 ide-agent 协议不改动。Ticket 返回绝对路径，前端换算为 session
  相对路径后调用 IDE RPC。

## 5. 生命周期与删除

- 自动 stop/archive cron 可以保留独立 timer lock 避免重复扫描，但 timer lock 不承担资源正确性；
  每条记录执行前都必须获取 `Sandbox Lifecycle Lease`、重新读取记录并完成状态 CAS。
- 自动 stop/archive 候选查询只匹配稳定态；`legacyMigrating` 和其他过渡态不会成为候选。
- stop 只能将 `running` CAS 为 `stopping` 后调用 Provider；完成后再用匹配的
  `metadata.operation.id` 提交为 `stopped`。
- archive 将 `running/stopped` CAS 为 `archiving`。归档上传、Sandbox 删除和 volume 删除都以
  `metadata.operation.phase` 持久记录；全部完成后才能提交为 `archived`。
- `deleting` 只表示业务资源删除，不再复用为 archive 的内部阶段。归档清理失败时保留
  `archiving`，由同一操作重试或 stale recovery 接管。
- restore 只能将 `archived` CAS 为 `restoring`；正在执行 `archiving`、`deleting` 或其他过渡
  操作时不得恢复。
- 归档恢复成功并将 Mongo 记录切回运行态后，尽力删除已消费的 S3 归档；删除失败只记录日志，
  不回滚已经成功恢复的 Workspace。
- 自动资源删除在 Lifecycle Lease 内重新检查最新 `status` 和 source active 状态。
- `deleteChatResourcesBySource` 不再调用 Chat 级 Sandbox 删除。
- 普通资源删除先使用 `Source Mutation Lease` 阻止首次创建和 Legacy 导入，再逐条使用
  `Sandbox Lifecycle Lease` 将最新记录 CAS 为 `deleting` 并清理 Provider、volume 和 S3。
- App 和 Skill 删除都在 source 临界区内同时查询并清理 v2 与 Legacy 记录。任何关键清理失败都
  向上抛出，由删除队列重试；在全部资源完成前不得硬删除 source。
- Legacy 导入失败时保留目标 `legacyMigrating`、旧 S3 和旧记录，管理员重试根据 migration
  operation 和 Legacy 阶段继续处理，不能把部分导入的 Workspace 暴露给普通 runtime。

### 5.1 App Provider 切换

1. 真实用户请求在恢复/创建前按 `sourceType=app + sourceId + userId` 查询逻辑记录；keepalive
   只检查当前 provider，不触发迁移。
2. 发现旧 provider 记录时获取 provider 无关的 `Sandbox Lifecycle Lease`，并在锁内重新读取
   `provider + status + metadata.operation`。
3. `running/stopped` 记录先通过标准 archive 状态机稳定进入 `archived`；任何过渡态必须恢复或
   接管原操作，不能提前创建新 provider 的空 Workspace。
4. 将 `archived` CAS 为 `providerMigrating` 并写入 operation。按 phase 校验目标 adapter、清理
   旧 provider 残留，随后用 `_id + oldProvider + providerMigrating + operation.id` CAS 更新同一条
   记录的 provider 和目标 runtime image，最终回到 `archived`，不创建第二条记录。
5. CAS 失败时重新读取：已经由同一 operation 或并发请求切到目标 provider 则继续，否则返回
   状态变化错误；旧 operation 不得覆盖新 operation 的结果。
6. 标准 restore 状态机在新 provider 恢复 Workspace；恢复成功后删除已消费的 S3 归档。
7. 部署切换期间必须保留旧 provider 的连接凭据；从 OpenSandbox 迁出时还需保留对应的
   volume-manager 配置，直到旧记录全部完成归档和远端资源清理。

## 6. 迁移设计

升级到当前版本镜像前，必须先在上一个仍包含 `/api/admin/4150/init4150-beta6` 的版本镜像中，
以 `dryRun=false` 完成 4.15.0-beta6 Sandbox 字段归一化。确认该任务完成后再升级当前版本镜像，
并执行 `initUserSandbox`。当前版本不再提供 beta6 入口，两个脚本也不会自动串联；
`initUserSandbox` 的整表预检会拒绝仍残留 `appId/type/metadata.skillId` 等旧字段的记录，防止跳过
前置迁移后写入 v2 集合。

已确认 Legacy 集合不存在 E2B 记录，因此当前 migration 只接受 OpenSandbox 和 Sealos Devbox，
不保留 E2B adapter 或历史 provider 兼容分支。

管理员迁移入口首先读取原始 Legacy 文档并执行整表结构预检。App 必须具备合法的
`sourceType/sourceId/userId/chatId`，Skill 必须具备合法的 `sourceType/sourceId`，公共字段
和可选配置必须符合 Legacy Zod Schema，且不得残留 beta6 已清理的 `appId/type/metadata.skillId`。
任一记录失败时直接拒绝整次任务，错误返回 `_id`、`sandboxId`、字段路径和原因；预检通过前
不写新表、不连接 Sandbox、不访问 S3，也不产生迁移 Track。

### 6.1 Skill Edit

1. 使用 `generateSandboxId({ sourceType: skillEdit, sourceId, userId: skillEdit })` 生成新的目标物理
   ID；不把旧无前缀 `sandboxId` 写入 v2。
2. 按 Skill 获取 `Source Mutation Lease` 并确认 source active，再按新目标 ID 获取
   `Sandbox Lifecycle Lease`。先创建 `legacyMigrating` v2 记录作为发布屏障，普通 runtime 不得抢先
   创建空 Sandbox。
3. Legacy 无 archive state 时正常打包；`archiving` 重新打包覆盖归档；`deleting` 重用已完成的
   S3 归档并在清理阶段重新删除旧资源；`restoring` 说明归档已经完成，直接重用 S3 归档；
   `failed` 保留在 Legacy 表并返回失败，不创建或发布 v2 目标。
4. Skill 复用 `pending -> archiveReady -> installed -> cleanupPending` 持久阶段。归档安装到新目标
   Workspace 根目录，只有 `installed` 已提交后才把目标发布为 `running`。
5. 发布成功后删除旧物理 Sandbox、OpenSandbox volume、旧 S3 归档和 Legacy 记录；任一步失败都
   保留 `cleanupPending` 供幂等重试。

### 6.2 App Workspace

1. 按 `sourceId + userId` 聚合 Legacy App 记录。
2. 每个 source 分组获取 `Source Mutation Lease`，确认 App source active 后再获取目标
   `Sandbox Lifecycle Lease`，创建或 CAS 确定性的用户级目标记录为 `legacyMigrating`，并写入
   `type=legacyMigration` 的 operation。普通 runtime 只能返回忙碌，不能接管成空 Workspace。
3. migration 模块直接在 `legacyMigration` operation 内按 phase 创建、启动或恢复目标 Sandbox，
   不通过普通 `getSandboxClient` 暴露未完成的目标。
4. Legacy `metadata.archive.state=archived/deleting/restoring` 的记录仅在 S3 对象存在时复用；Legacy
   `archived` 但对象缺失时迁移失败并保留旧记录，禁止连接已删除的远端实例并迁移空 Workspace。
   其他 Legacy 状态即使残留旧 S3 对象，也从当前 Workspace 重新打包并覆盖。
5. 每条 Legacy 记录持久保存 `pending -> archiveReady -> installed -> cleanupPending` 阶段。
6. 在目标 Sandbox 的 `.migration/<oldSandboxId>` 解压 staging。
7. 删除 staging 中直接位于 `projects/` 下且名称为 24 位十六进制 ID 的目录。
8. 目标 session 不存在时 rename staging 到 session；已存在时递归合并 staging，目录同名
   时继续向下合并，文件同名或文件/目录类型冲突时保留 session 现有内容。
9. 安装成功后必须先把阶段持久化为 `installed`；目标目录存在本身不能作为安装成功依据。
10. 同组全部 Legacy 记录至少进入 `installed` 后，才用匹配的 `metadata.operation.id` 把目标从
    `legacyMigrating` 一次性发布为 `running` 并清除 operation。
11. 单次任务按 `lastActiveAt` 降序读取全部 Legacy 记录，优先迁移最近活跃的 Workspace；Skill
    按 source 分组并把 Workspace 搬到新物理 ID，固定并发度为 20；App 固定并发度为 5，按
    `sourceId + userId` 分组后组间并发、组内按最近活跃时间顺序串行。
12. 目标发布后再把每条 Legacy 记录推进到 `cleanupPending`，同步删除旧 Sandbox、volume 和
    归档，确认完成后删除 Legacy 记录。清理失败不再阻止已完整安装的目标运行。

### 6.3 失败与重试

- 目标 Workspace 安装失败时保留 `status=legacyMigrating`，在 operation 中写入失败步骤、时间和
  错误，不删除该条旧记录或 S3。
- 目标 Workspace 安装成功后，旧 Sandbox、volume、S3 或 Legacy 记录任一清理步骤失败，
  保留 Legacy 记录的 `installed/cleanupPending` 阶段并记录具体步骤，重试从已持久阶段继续，
  不重复推断或安装 Workspace。
- 重试在 Source Lease 和 Lifecycle Lease 下接管旧 `legacyMigration` operation，生成新的
  operation ID，只查询仍存在的 Legacy 记录并从其持久阶段继续。
- 只有 Legacy 阶段已经是 `installed/cleanupPending` 时，S3 不存在才允许继续清理；目标目录存在
  但阶段仍为 `pending/archiveReady` 时不得删除 Legacy 记录。
- 迁移任务保留 job 级 singleton lease 避免重复调度；每个分组的正确性由 Source Mutation
  Lease 保证，不能依赖全局 lease 阻塞其他 source 的生命周期。
- 真实迁移完成本轮 App 处理后，批量暂停本轮失败且仍存在的 Legacy App Sandbox，并将旧记录
  状态更新为 `stopped`；暂停失败记录 `stop_failed_legacy` Track，保留旧记录供人工定位和重试。
  Skill 迁移失败不执行统一暂停；目标发布前继续保留旧物理 Sandbox，供修复归档状态后重试。
- 全部残留 Legacy 记录均为 `installed/cleanupPending` 时，说明迁移发布已经完成；无论目标当前是
  `running`、`stopped` 还是 `archived`，都只继续清理旧资源，不再抢占 `legacyMigrating`。
- 已发布目标只要仍有 `pending/archiveReady`，就视为发布屏障被破坏并终止，不再修改 Workspace。

## 7. 测试范围

- App ID 对相同 App + User 稳定，且不受 Chat ID 影响，并带 `app-` 前缀。
- 不同 App 或 User 生成不同 ID；Skill Edit 对同一 Skill 稳定并带 `skillEdit-` 前缀。
- 新表 App `userId` 使用有效用户 ID，Skill Edit `userId` 固定为 `skillEdit`。
- 新实例 Schema、类型、索引和写入均不包含 `chatId`、`metadata.archive` 或
  `metadata.migration`。
- App/Skill 共享复合 unique index 正确。
- Runtime Context 正确拆分 Workspace、Skill 和 Session 路径。
- shell、文件工具、输入文件、HTTP 上传下载和预览使用正确路径。
- App entrypoint 使用 Workspace 根目录，Skill 使用 `/projects`。
- Editor Ticket 返回两个运行时路径，前端固定以 session 为文件树根目录。
- migration 使用 `legacyMigrating` 发布屏障；普通 runtime 不会连接或改写未完成目标。
- Legacy 导入失败保留 migration operation 和旧记录阶段，重试更换 operation ID 后继续。
- source 删除在两层 lease 下把 `legacyMigrating` 抢占为 `deleting`，旧 operation 不能再提交。
- Chat 删除不删除共享 Sandbox；App 删除仍删除。
- Skill 迁移使用新的 `skillEdit-...` 物理 ID 搬迁 Workspace，并在发布后清理旧资源与 S3。
- App 迁移覆盖默认目录、新 session 优先的冲突合并、重试、单条清理和最终状态清理。

## 8. TODO

- [x] 更新 Notion 规格与实施状态。
- [x] 编写仓库内需求和技术设计。
- [x] 新增 Legacy Model，并将运行时 Model 切换到 `agent_sandbox_instances_v2`。
- [x] 调整新实例 Zod Schema、Mongo Schema、索引和 Repository。
- [x] 新增用户级 Sandbox ID 和 Runtime Path helper。
- [x] 调整 SandboxClient、归档恢复和 Skill Edit 读写，移除实例级 `chatId`。
- [x] 调整 Agent runtime、Skill 注入、entrypoint 和输入文件路径。
- [x] 调整 Sandbox 工具的命令与文件路径解析。
- [x] 调整 upload/download/preview/ticket/checkExist API 和 Editor 初始目录。
- [x] 调整 Chat 删除、App 删除、自动 stop/archive/delete 生命周期。
- [x] 串行化真实用户级迁移与自动 stop 的远端副作用。
- [x] 删除旧归档脚本，新增只处理 v2 集合的 `initSandboxArchiveV2`。
- [x] 补齐 App Sandbox 跨 provider 归档、CAS 切换和恢复闭环。
- [x] 增加同步 S3 归档删除与存在性检查。
- [x] 实现 Skill Edit Legacy 记录迁移。
- [x] 实现 App Workspace 分组迁移、staging、新 session 优先合并和逐条清理。
- [x] 编写并运行局部单元测试。
- [x] 运行相关 TypeScript 检查。
- [x] 最后运行全量测试。
- [x] 更新 Notion 实施进度。

## 9. 生命周期并发深度重构（已确认）

### 9.1 问题分析

当前实现同时存在三类 Redis lease：

- 用户级 Legacy 迁移使用全局 lease。
- Provider 切换使用 Sandbox ID 级独立 lease。
- Skill/Entrypoint 初始化使用 Sandbox ID 级初始化 lease。

其中初始化 lease 只保护 Workspace 文件同步，职责明确，可以继续保留。其余生命周期操作仍存在以下结构性问题：

1. `stop`、普通删除、归档、恢复和 Provider 切换没有统一使用同一个资源互斥域。
2. 部分流程先执行远端副作用，再尝试 Mongo CAS。CAS 失败只能阻止本地状态写入，不能撤销已经发生的远端 `stop/delete`。
3. Redis lease 续期失败只会在任务返回后抛错，不能停止正在执行的异步任务。
4. `Promise.race` 形式的 timeout 不会取消底层归档或删除任务，旧任务可能在调用方已经返回失败后继续运行。
5. App/Skill 删除与 Legacy 迁移没有完整的持久删除 fence，迁移可能在 source 已删除后重新创建 v2 记录。
6. Legacy App 迁移以“目标 session 已存在”推断安装成功，无法区分成功重试和新运行时提前创建的同名目录。

因此本轮不再继续给单个调用点补锁，而是统一生命周期状态和资源操作协议。

### 9.2 正确性不变量

重构后的实现必须满足：

1. 同一个稳定 `sandboxId` 在任意时刻最多只有一个远端生命周期操作执行，Provider 切换前后使用同一个互斥 key。
2. 所有不可逆远端操作必须先完成 Mongo 状态抢占，再调用 Provider。
3. 每次状态转换携带唯一 `metadata.operation.id`；后续成功、失败和恢复只能更新同一轮操作。
4. Redis lease 只减少重复执行。即使 lease 丢失、进程退出或请求超时，Mongo 状态和幂等远端操作仍能收敛。
5. App/Skill 进入删除流程后，运行时、Provider 迁移和 Legacy 迁移都不得重新创建其 Sandbox。
6. Legacy 记录只有具备持久 `installed` 标记时，才能在旧 S3/远端资源已经不存在的情况下直接进入清理。
7. cron timer lock 只负责避免重复扫描；每条候选记录在执行前仍需重新读取并抢占生命周期状态。

### 9.3 锁分层

只保留两类资源正确性互斥：

#### Source Mutation Lease

- Key：`agent-sandbox:source:<sourceType>:<sourceId>`。
- 用于某个 source 的首次 provisioning、Legacy 导入、App 删除和 Skill 删除。
- 保护“检查 source 可运行 -> 创建第一条 v2 记录”和“标记 source 删除 -> 查询并清理新旧记录”的完整边界。
- 同一 App 的不同用户只有首次创建 Sandbox 时需要该锁；已有实例的正常运行不获取 source 锁。
- Legacy 全量任务仍可保留 job 级 singleton lease 防止重复执行，但 job lease 只负责调度，不作为资源正确性依据。

#### Sandbox Lifecycle Lease

- Key：`agent-sandbox:lifecycle:<sandboxId>`，不包含 provider。
- 用于 provisioning、stop、archive、delete、restore、Provider 切换和 stale retry。
- 获取后必须重新读取 Mongo 状态，禁止使用获取锁前的资源快照直接执行远端操作。
- 多资源操作按 `sandboxId` 排序后逐个执行，不同时持有大量资源锁。

统一锁顺序为：`Source Mutation Lease -> Sandbox Lifecycle Lease`。任何路径不得反向获取。

初始化 lease `agent-sandbox:init:<sandboxId>` 继续只保护 `/projects`、输入文件和 entrypoint 准备，不参与生命周期状态转换。

### 9.4 生命周期状态

#### 唯一权威状态

v2 实例统一使用顶层 `status` 表达生命周期。`status` 同时作为业务判断、Mongo 查询、索引和
CAS 抢占条件，不再引入 `metadata.lifecycle`，也不再通过 `metadata.archive.state` 叠加第二套
状态：

```typescript
type SandboxStatus =
  | 'provisioning'
  | 'legacyMigrating'
  | 'running'
  | 'stopping'
  | 'stopped'
  | 'archiving'
  | 'archived'
  | 'restoring'
  | 'providerMigrating'
  | 'deleting';
```

状态分为两类：

- 稳定态：`running`、`stopped`、`archived`。
- 过渡态：`provisioning`、`legacyMigrating`、`stopping`、`archiving`、`restoring`、
  `providerMigrating`、`deleting`。

不设置通用 `failed` 状态。不同操作失败后的资源确定性和恢复方式不同，统一落入 `failed`
会丢失正在执行的操作语义。远端调用已经开始后发生错误，记录保留在原过渡态，由
`metadata.operation` 保存错误并供下一执行者接管。

#### 操作上下文

`metadata.operation` 不是状态，只是当前过渡操作的持久 fencing token 和恢复日志：

```typescript
type SandboxOperation = {
  id: string;
  type:
    | 'provision'
    | 'legacyMigration'
    | 'stop'
    | 'archive'
    | 'restore'
    | 'providerMigration'
    | 'delete';
  phase: string;
  previousStatus?: 'running' | 'stopped' | 'archived';
  startedAt: Date;
  heartbeatAt: Date;
  failedAt?: Date;
  error?: string;
  fromProvider?: SandboxProviderType;
  targetProvider?: SandboxProviderType;
};
```

- 所有过渡态必须存在 `metadata.operation`，稳定态不得保留未完成 operation。
- `operation.id` 每次抢占时重新生成，旧执行者只能用自己的 ID 提交，不能覆盖接管者结果。
- `phase` 记录已持久完成的幂等步骤，不能通过远端目录或资源“看起来存在”推断步骤完成。
- `previousStatus` 仅用于明确允许回滚的操作，不作为当前状态来源。
- Legacy Workspace 导入使用正式的 `legacyMigrating` 状态和 `legacyMigration` operation。
  migration 模块负责 phase 和重试，不再设置正交的 `metadata.migration` 标记。

`agent_sandbox_instances_v2` 是尚未上线的全新表，直接以本设计作为唯一数据契约：

- 不读取或写入旧 `metadata.archive`。
- 不读取或写入 `metadata.migration`。
- 不对 v2 提供旧状态 fallback、双读、schema 回填或兼容迁移。
- 不为尚未产生的 v2 历史数据保留兼容分支。
- Legacy 集合继续使用独立 Legacy Schema；migration 模块直接读取旧记录，并且写入 v2 前
  必须转换为本节定义的新模型。v2 Repository 和 runtime 不读取 Legacy Schema。
- `initUserSandbox` 的旧表 Workspace 搬迁仍是本分支直接实现的核心业务流程，不属于 v2
  schema 兼容。

#### 状态转换表

| 操作 | 抢占转换 | 成功转换 | 关键阶段示例 |
| --- | --- | --- | --- |
| 首次创建 | 无记录 -> `provisioning` | `provisioning` -> `running` | `claimed`、`providerEnsured` |
| 启动已停止实例 | `stopped` -> `provisioning` | `provisioning` -> `running` | `claimed`、`providerEnsured` |
| Legacy Workspace 导入 | 无记录/稳定态 -> `legacyMigrating` | `legacyMigrating` -> `running` | operation 使用 `claimed`、`targetEnsured`；每条 Legacy 记录独立保存安装阶段 |
| 停止 | `running` -> `stopping` | `stopping` -> `stopped` | `claimed`、`providerStopped` |
| 归档 | `running/stopped` -> `archiving` | `archiving` -> `archived` | `claimed`、`archiveUploaded`、`providerDeleted` |
| 恢复 | `archived` -> `restoring` | `restoring` -> `running` | `claimed`、`archiveInstalled` |
| Provider 切换 | `archived` -> `providerMigrating` | `providerMigrating` -> `archived` | `claimed`、`targetAdapterValidated` |
| source 删除 | 任意状态 -> `deleting` | 删除 Mongo 记录 | `claimed`、`providerDeleted`、`volumeDeleted`、`archiveDeleted` |

过渡态不能被普通 runtime、keepalive 或 cron 直接改写成稳定态，只能由持有匹配
`operation.id` 的当前操作完成或由 stale recovery 接管。

接管同一过渡态时必须生成新的 `operation.id`，但保留已经提交的 `phase`，不能重置为
`claimed`。各流程从持久阶段继续：

| 状态与已提交 phase | 接管后的下一步 |
| --- | --- |
| `provisioning.providerEnsured` | 直接提交 `running`，不重复创建 provider |
| `stopping.providerStopped` | 直接提交 `stopped` |
| `archiving.archiveUploaded` | 继续删除 provider/volume |
| `archiving.providerDeleted` | 直接提交 `archived`，禁止重建空 provider 覆盖归档 |
| `restoring.archiveInstalled` | 直接提交 `running`，不重复下载或解压 |
| `providerMigrating.targetAdapterValidated` | 直接原子切换 provider 并回到 `archived` |
| `deleting.providerDeleted/volumeDeleted/archiveDeleted` | 从下一项清理步骤继续 |

旧 provider 上中断的 `restoring` 不能直接开始 provider 切换。超过隔离窗口或明确记录错误后，
先重新 fencing `restore`，幂等删除旧 provider 的半成品容器和 volume，但保留 S3 归档；提交回
`archived` 后再进入 `providerMigrating`。

### 9.5 统一资源操作协议

每个生命周期操作统一执行：

1. 获取 `Sandbox Lifecycle Lease`。
2. 在 lease 内重新读取当前记录；会创建或恢复远端资源的入口还必须重新检查 source active。
3. 用 `_id + provider + sandboxId + status` CAS 到过渡态，并原子写入完整
   `metadata.operation`。
4. 执行有明确 timeout、可重试且幂等的 Provider/volume/S3 操作。
5. 每个可恢复阶段完成后，用 `_id + status + metadata.operation.id` CAS 更新 `phase` 和
   `heartbeatAt`。
6. 最终用 `_id + status + metadata.operation.id` CAS 到稳定态，并删除
   `metadata.operation`；删除操作最终按相同条件删除 Mongo 记录。
7. 任意关键步骤失败都保留过渡态、已提交 phase 和 operation 错误，交给同一操作重试或
   stale recovery 接管；不得用清空状态后继续的策略绕过发布屏障。

运行态活跃时间刷新可以保留无锁 CAS 快路径，但只能匹配 `running`。stop 必须先从 `running` CAS 到 `stopping`：

- keepalive/touch 先成功时，stop 的 `lastActiveAt` CAS 失败，不调用远端 stop。
- stop 先抢占时，运行态看到 `stopping` 后等待或重试，不把记录直接写回 running。

### 9.6 Source 删除 Fence

App/Skill 删除和首次 provisioning 必须使用同一个 Source Mutation Lease：

1. 首次 provisioning 获取 source 锁后重新确认 source 存在且没有 `deleteTime`，然后先写入 `provisioning` 记录，再调用远端创建。
2. 已有实例的运行态 touch 只能更新现存 `running` 记录，不允许走 upsert；锁外读到的记录若在等待 Lifecycle Lease 时被删除，本次请求直接失败，后续请求只能持有 Source Lease 后重新进入首次 provisioning。
3. App/Skill 删除获取 source 锁后重新确认 `deleteTime` 已设置，并在锁内同时查询 v2 和 Legacy 记录；未标记删除时禁止执行任何外部清理。
4. 删除取得 source 锁后逐条等待 Lifecycle Lease；只有旧生命周期任务释放或确定丢失 lease、
   且满足无法取消请求的隔离窗口后，才能 fencing 旧 operation，并从任意 status CAS 为
   `deleting`。
5. 每条资源在 Lifecycle Lease 内按最新 provider 清理，失败必须抛出以便删除队列重试，不能被 `Promise.allSettled` 静默吞掉。
6. source 只有在所有关键外部资源清理完成后才能硬删除。硬删除后，“source 不存在”继续作为禁止 provisioning 的持久 fence。
7. Source active 查询通过 application 层注入的 guard 完成，避免底层 Repository 直接依赖 App/Skill service。

### 9.7 Legacy 迁移阶段

每条 Legacy App/Skill 记录增加持久迁移阶段：

```text
pending -> archiveReady -> installed -> cleanupPending -> deleted
```

- `archiveReady`：已获得可校验的 S3 归档。
- `installed`：Workspace 已成功提交到目标 session 或 Skill Workspace，并已把结果写回 Legacy 记录。
- `cleanupPending`：允许重试旧 Sandbox、volume、S3 和 Legacy 记录清理。
- 只有 `installed/cleanupPending` 可以在 S3 不存在时直接清理。
- 目标 session/Workspace 存在但 Legacy 仍是 `pending/archiveReady` 时，不得推断迁移完成。

Skill Legacy 迁移和 Skill 删除共用对应 Skill 的 Source Mutation Lease，并在迁移前确认 Skill source 未进入删除状态。

### 9.8 Lease 丢失和超时

- `withRedisLease` 需要向任务暴露 `assertValid()` 或 `AbortSignal`，续期确认失败后阻止进入下一步远端副作用。
- 不再使用无法取消底层任务的 `Promise.race` 作为生命周期操作终止依据。
- Provider `create/start/stop/delete` 必须以稳定 `sandboxId` 保证幂等；重复删除和 404 视为成功。
- stale retry 同时检查 `metadata.operation.id`、`heartbeatAt` 和 `status`。归档和恢复采用 45 分钟保守隔离窗口，覆盖安装工具、扫描、压缩、上传和解压命令链；stop 使用 15 分钟窗口。
- 对无法取消的 Provider 请求，只有确认请求已超时结束或超过保守隔离窗口后，才允许恢复与删除重试竞争。

### 9.9 已确认决策

1. `agent_sandbox_instances_v2` 是尚未上线的全新表，以新 schema 作为唯一契约，不增加任何
   旧状态兼容、双读、回填或 fallback 逻辑。
2. Source active guard 由 App/Skill application 层注入，复用 source 不存在或
   `deleteTime` 已设置的语义，不新增 tombstone 集合。
3. OpenSandbox 和 Sealos Devbox 全部纳入本轮重构；adapter 层统一稳定 ID 幂等语义，
   删除不存在的资源和 404 统一视为成功。已确认 Legacy 集合不存在 E2B 记录，本轮不提供 E2B
   数据迁移兼容。
4. 顶层 `status` 是唯一生命周期状态；`metadata.operation` 仅承担 fencing、阶段恢复和错误
   诊断职责，不引入 `metadata.lifecycle`。
5. Legacy Workspace 导入直接重构为正式的 `legacyMigrating` 状态和 `legacyMigration`
   operation，不增加 `metadata.migration` 或 v2 兼容分支；全部安装完成前不发布目标 Sandbox。
6. v2 Sandbox ID 使用 `sourceType-<hash(sourceId-userId)>`；Skill Edit 的 `userId` 固定为
   `ChatSourceTypeEnum.skillEdit`，不保留旧 ID 和空 userId 兼容。

### 9.10 重构 TODO

- [x] 确认 v2 全新数据契约、source fence 实现、Provider 幂等约束和唯一状态模型。
- [x] 定义顶层 status 状态机、operation 上下文和状态转换表。
- [x] 调整 v2 schema，删除 `metadata.archive/metadata.migration`，增加完整过渡 status 和
  `metadata.operation`。
- [x] 定义 Repository 抢占、阶段提交、完成和 stale 接管 CAS API。
- [x] 新增 Source Mutation Lease、provider 无关的 Sandbox Lifecycle Lease helper 和锁上下文。
- [x] 重构 runtime provisioning/touch，禁止过渡态被直接写回 running。
- [x] 重构 stop、archive、restore、delete 和 stale retry，统一为先 CAS 后远端操作。
- [x] 将 Provider 切换并入同一 Lifecycle Lease 和状态机。
- [x] 将首次 provisioning、Legacy 导入和 App/Skill 删除纳入 Source Mutation Lease，并增加 source active/deleted guard。
- [x] 统一 v2 Sandbox ID 的 sourceType 前缀，并让 Skill Edit 使用固定 enum userId。
- [x] 为 Legacy App 记录增加持久迁移阶段，删除基于目录存在的成功推断。
- [x] 为 lease 丢失提供主动检查/取消能力，移除非取消式生命周期 timeout。
- [x] 补充并发抢占、lease 丢失、进程中断、phase 恢复、清理重试和 Provider 幂等测试。
- [x] 运行 Sandbox 局部测试、Mongo Repository 测试、App 删除测试和相关类型检查。
- [x] 最后运行全量测试；全量并发下 3 个无关用例出现超时/隔离抖动，单独复跑 27/27
  通过。
