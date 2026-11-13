# Agent Sandbox 当前设计

状态：当前实现

最后核对：2026-11-12

纯 OpenSandbox `1.2.0` + JuiceFS 实时持久化、5 态生命周期、原生 `execd` 数据面、`opensandbox-proxy` 边缘网关与六维跨租户安全隔离的完整架构方案见
[FastGPT Agent Sandbox 新架构方案设计（纯 OpenSandbox）](./pure-opensandbox-architecture.md)。

用户级实例寻址、Session 目录边界与 Lease 分层的历史演进背景见
完整架构演进、JuiceFS 设计、安全隔离与多后端说明见
[FastGPT Agent Sandbox 新架构方案设计（纯 OpenSandbox）](./pure-opensandbox-architecture.md)；从 v2 9 态架构（含旧 RWO PVC / Docker 卷 / S3 归档 / Sealos Devbox）迁移至 `v3` JuiceFS 架构的完整方案见
[Agent Sandbox v2 -> v3（纯 OpenSandbox + JuiceFS）迁移方案设计](./v3-juicefs-migration.md)；端到端集成测试约定见
[Agent Sandbox 集成测试设计](./integration-testing.md)。
[Agent Sandbox v2 -> v3 迁移方案设计](./v3-juicefs-migration.md)。本文维护当前代码入口和运行行为索引。

## 目标与边界

Agent Sandbox 为 Agent 对话、Skill 开发调试、在线 IDE 和产物预览提供隔离的 Linux 容器运行环境、JuiceFS 持久化工作区和工具调用能力，同时维护物理实例、业务归属、5 态生命周期、双向对账 GC 和 Skill 部署。

Sandbox 不负责 Agent 的模型循环、Workflow 调度或 Skill 版本创建。Agent Loop 只持有已经准备好的 `SandboxClient`，具体实例管理留在 Sandbox 模块。

## 分层

目录：`packages/service/core/ai/sandbox`

```text
interface
  对 Workflow、API、Skill Edit 暴露稳定寻址、会话与清理入口
      |
application
  runtime / lifecycle / toolCall / file / preview / pty / resource / quota / skillEdit 编排
      |
infrastructure
  instance repository / opensandbox client & runtime profile / volume service
      |
opensandbox runtime (OpenSandbox Server 1.2.0 + execd:44772 + volume-manager)
```

约束：

- 外部业务优先从 `interface/*` 或公开 `application/*` 入口调用，不直接操作 `MongoSandboxInstance`。
- `SandboxClient`（`getSandboxClient`）用于运行态，可按需创建、从 `stopped` 唤醒或自愈重建远端容器；只读探测与连接使用 `connectRunningSandbox`，绝不隐式创建或唤醒已停止实例；边缘网关批量续期统一调用 `touchRunningSandboxInstances`。
- 资源停止、删除与孤儿回收统一通过 `application/resource.ts` 编排，在 `Sandbox Lifecycle Lease` 内通过持久化 checkpoint 推进。
- Mongo 读写集中在 `infrastructure/instance/repository.ts`。

## 实例身份

业务归属统一使用：

- `sourceType`：支持 `app`、`workflowBuilder`（独立构建编排沙盒）和 `skillEdit`。
- `sourceId`：App ID 或 Skill ID。
- `userId`：实例逻辑身份的一部分。App / Workflow Builder 使用有效用户 ID（`effectiveUserId`）；Skill Edit 固定使用 `ChatSourceTypeEnum.skillEdit`。
- `teamId`：实例所属团队 ID（`v3` 必填字段，创建时写入，运行时校验一致）。
- `chatId`：只用于 App Sandbox 内的 `/workspace/sessions/<chatId>` 子目录寻址，不参与实例或 Provider 资源 ID。
- `sandboxId`：Provider 侧的稳定业务会话标识（写入 OpenSandbox `metadata.sessionId`）。
- `instanceId`：OpenSandbox 返回的真实远端物理容器 ID（`sandbox.id`；`running` 稳定态必填，`stopped` 稳定态必须清空），用于快路径按 ID 直连（免 `listSandboxInfos` 列表扫描）、单写者校验与反向孤儿容器对账。
- `resourceLimits`：可选强类型资源规格子文档（`cpuCount / memoryMiB / storageSize / ephemeralStorageSize`）。
- `storage`：强类型存储挂载子文档（`volumes[]: { name, claimName, mountPath, readOnly }`，不保留冗余外层 `mountPath`；无持久卷时保持 `undefined`）。
- `context`：业务来源专属上下文子文档（当前 `skillEdit` 使用 `context.skillVersionId` 记录已部署的 `AgentSkillsVersion` ID，避免污染顶层通用字段）。

当前寻址规则：

| 场景 | sandboxId | 归属 | 容器内默认工作目录 |
| --- | --- | --- | --- |
| App Chat | `app-<hash(sourceId-effectiveUserId)>` | `sourceType=app`，`userId=effectiveUserId` | `/workspace/sessions/<chatId>` |
| Workflow Builder | `workflowbuilder-<hash(sourceId-effectiveUserId)>` | `sourceType=workflowBuilder`，`userId=effectiveUserId` | `/workspace/sessions/<chatId>` |
| Skill Edit | `skilledit-<hash(sourceId-skillEdit)>` | `sourceType=skillEdit`，`userId=skillEdit` | `/workspace` |
| Chat Agent Helper | 不支持 Sandbox | 调用时直接报错 | - |

`agent_sandbox_instances_v3` 当前声明 6 个索引（无历史 `deprecated` 索引）：
1. `{ sandboxId: 1 }`（`unique: true`）
2. `{ sourceType: 1, sourceId: 1, userId: 1 }`（`unique: true`）
3. `{ teamId: 1, status: 1 }`
4. `{ status: 1, lastActiveAt: 1 }`
5. `{ status: 1, 'operation.heartbeatAt': 1 }`
6. `{ 'storage.volumes.claimName': 1 }`（非唯一多键索引，支撑孤儿卷对账 GC 并兼容多卷共享挂载）

补充实例不变量：
- `app` / `workflowBuilder` 按 `(sourceType, sourceId, userId)` 隔离用户级会话沙盒；`skillEdit` 按 `(sourceType='skillEdit', sourceId, userId)` 共享可编辑技能工作区（不同用户/编辑器各自持有唯一映射）；当 Chat 沙盒不可用或超限配额时静默降级（不阻塞其余 Workflow/工具节点），`skillEdit` 则结构化报错阻断，Ticket/上传/下载/预览路由在服务端强制重验归属与可用性。
- `running` 快路径 touch 仅刷新 `lastActiveAt` 并以 `storage.volumes[0].claimName` 做 CAS 守卫，严禁回写或覆盖新 `generationId`；`AGENT_SANDBOX_OPENSANDBOX_VOLUME_NAME_PREFIX` 仅用于生成新 `claimName`，删除卷始终使用 Mongo 持久化的完整 `claimName`。

## Provider、Runtime Profile 与持久卷

唯一底层运行时为 `opensandbox`（已移除 `AGENT_SANDBOX_PROVIDER` 多提供方开关，配置 `AGENT_SANDBOX_OPENSANDBOX_BASEURL` 即启用；内聚在 `infrastructure/opensandbox/opensandbox.ts`，特例保留 `infrastructure/opensandbox/index.ts` 统一出口；基于 `@alibaba-group/opensandbox@^1.2.0`，固定启用 `useServerProxy: true`，并通过 `ConnectionConfig.withTransportIfMissing()` 共享底层 `undici` keep-alive 连接池）。

- `infrastructure/opensandbox/runtimeProfile.ts` 与 `config.ts` 负责映射完整镜像地址+tag（`AGENT_SANDBOX_OPENSANDBOX_IMAGE`，当前基线 `v0.4.0`）、工作目录（`/workspace`）、启动入口（`/home/sandbox/entrypoint.sh`）、环境变量、网络策略和资源规格；容器内 `$HOME` 按远端物理 `sandbox.id` 动态解析并缓存（兼容 `nonroot` 与 `root` 镜像）。
- 每个沙盒拥有独立代际卷名 `claimName = <volumeNamePrefix>-<sandboxId>-<generationId>`（默认前缀 `fastgpt-session`，8 位随机十六进制后缀，持久化在 `storage.volumes[0].claimName`），通过 `projects/volume-manager`（`v0.4.0`）提供统一存储语义：
  - **Kubernetes 模式**：创建 `StorageClass=juicefs-sc` 的动态 RWO PVC（独立 CSI Mount Pod + `--subdir` 挂载，`mountOptions: [buffer-size=64, cache-size=0, hide-internal]`），保留 PVC UID precondition 与 `Terminating` 等待逻辑。
  - **Docker 模式**：`volume-manager` 内置官方 `juicefs`（`1.4.2`）静态二进制（`juicefs format --trash-days 0` 立即释放已删数据），先将宿主机挂载点 `/var/lib/fastgpt/sandbox-mounts/<claimName>` 锁死为 `root:0500`（防止 FUSE 异常时退化写盘），规整元数据库连接串并剥离敏感凭证至子进程环境变量（兼容 PostgreSQL / MySQL / OceanBase / Redis / TiKV / SQLite3，对 `postgres/mysql` 默认注入 `max_open_conns=4&max_idle_conns=1&max_idle_time=60`，外接云对象存储支持静态 AK/SK 或云主机 IAM Role），再设置 `juicefs quota set --capacity <GiB> --inodes 200000` 目录容量与 inode 双重硬配额，启动独立 `juicefs mount -d --hide-internal --prefix-internal --subdir=/workspaces/<claimName> --buffer-size=64 --cache-size=0` FUSE 进程（隐藏并加 `.jfs` 前缀隔离内部虚拟控制文件），经 `:rshared` 传播后包装为 Docker 原生 `local` bind 命名卷；删除卷清空工作区时直接调用 `juicefs rmr` 进行元数据级批量递归清理。
- 数据随写随落独立私有对象存储桶（默认内置 RustFS/MinIO，支持外接 S3/OSS/COS/OBS 等；元数据默认存独立 PostgreSQL 库，支持多后端），无需 S3 Zip 打包归档或恢复状态机。
- 公共 `stop()` 删除远端 OpenSandbox 容器（Docker 模式下同时调用 `unmountSessionVolume` 卸载空闲 FUSE 进程释放内存），保留持久卷与 Mongo 记录；业务级 `delete()` 销毁远端容器、删除持久卷（含 JuiceFS 子目录与配额）并移除 Mongo 记录。

## 运行态生命周期（5 态状态机）

生命周期状态收敛为 5 个状态：

- **稳定态**：`running`、`stopped`（Mongo 中 `operation` 必须为空）。
- **过渡态**：`provisioning`、`stopping`、`deleting`（Mongo 中必须绑定对应 `provision / stop / delete` 类型的 `operation` checkpoint）。

### 锁分层与并发协同

所有分布式租约均收敛到单个逻辑 `sandboxId` 粒度，采用「短 TTL（`30s`）+ 自动续租（`5s`）」策略（活进程自动续期，Pod 崩溃最多 `30s` 自动释放锁），严格锁序为（生命周期操作本身严禁反向等待 `Init Lease`）：

```text
Agent Sandbox Init Lease (agent-sandbox:init:<sandboxId>, 仅运行态内容准备与 Skill Edit 初始化持有，有界排队 180s)
  -> Sandbox Lifecycle Lease (agent-sandbox:lifecycle:<sandboxId>, 前台请求有界排队 60s / 后台 cron 非阻塞 waitTimeoutMs=0)
```

- **取消跨用户的 `Source Mutation Lease`（Store-Load 屏障无锁协同）**：不同用户的首次创建与容器修复互不阻塞。首次创建在 `Lifecycle Lease` 内先插入 `provisioning` 占位记录，再复检业务源 `deleteTime === null`（若业务已被软删除则原子回撤 `provisioning + claimed` 记录并拒绝分配远端资源）；业务删除端在主事务提交 `deleteTime != null` 后扫描实例记录，并逐实例有界等待 `Lifecycle Lease` 完成彻底清理。
- **取消 5m / 20m 故障隔离锁死窗口**：在途活跃操作由自动续租的 Redis `Lifecycle Lease` 互斥保护；一旦后续前台请求或恢复任务取得 `Lifecycle Lease`，说明前序执行者已正常退出或崩溃超过 `30s`，立即按 Mongo `operation.phase` 与 `operation.id` CAS 幂等恢复或回滚。

### 获取与激活实例（`getSandboxClient` -> `ensureSandboxRuntime`）

1. **团队归属校验**：校验 `sandboxId/sourceType/sourceId` 与业务源 `teamId` 一致（未迁移的 `v2` 记录由运行期保护门控拦截）。
2. **Running 快路径（无锁）**：若记录已处于 `running` 且 `image` 字符串与当前配置一致，通过 CAS 刷新 `lastActiveAt`（校验 `claimName` 未变），携带持久化的 `instanceId` 调用 `opensandbox.connectRunning()`（10s 快速就绪预算 + 通过 `execd /files/info` 探测 `/workspace` 目录及 JuiceFS FUSE 挂载健康度）；若远端容器返回 404、非 Running 或 `/workspace` 挂载断连（`ENOTCONN`），自动转入慢路径销毁异常容器、重挂卷并重建容器。
3. **慢路径（单实例 `Lifecycle Lease` 有界排队）**：
   - **异常过渡态即时收敛**：若上次 `provisioning` 中断，由 `recoverSandboxActivationWithinLease` 立即收敛（`providerEnsured` 且远端仍 `Running` 则补交 `running`；否则释放远端容器、Docker 模式下尽力卸载空闲会话卷并保留持久卷回滚到 `stopped`）；若处于 `stopping` 则立即续跑完成停止。若前序排队请求已将实例拉起为 `running`，当前请求重读后直接复用连接并刷新活跃时间。
   - **镜像就地升级（In-place Upgrade）**：若实例记录的 `image` 字符串与当前配置不一致，触发 `onUpgrade` 回调；若当前为 `running` 先在锁内停止旧容器（保留原 `claimName` 持久卷），更新记录 `image` 后继续走 `provisioning` 用新镜像拉起容器并挂载原卷（App Chat 与 Skill Edit 行为统一，无需前端弹窗确认或轮询）。
   - **Quota 守卫与 Store-Load 屏障**：首次创建或从 `stopped` 唤醒时校验系统总配额与团队配额，超限直接返回 409；首次创建写入 `provisioning` 占位后立即复检 source 存活。
   - **Provisioning 激活**：若远端残留异常容器则先销毁确认消失，随后复用 Mongo 中已持久化的 `claimName`（首次创建则生成带新 `generationId` 的 `claimName`），调用 `ensureSessionVolume(claimName)` 确保卷与 FUSE 挂载已就绪并由 `buildVolumeConfig(claimName)` 构造挂载声明，调用 `adapter.ensureRunning()` 拉起容器，将 OpenSandbox 返回的物理 `sandbox.id` 持久化为 `instanceId` 并原子提交为 `running`。

### Prepare pipeline

同一沙盒的运行态内容初始化通过 `agent-sandbox:init:<sandboxId>` 租约串行化（租约自动续期；并发子调用占用时有界等待重试，等待超时或租约异常再转换为标准 initializing 错误），使用 `prepareSandbox(context, ...steps)` 顺序组合：

- 创建或检查工作目录（App 为 `/workspace/sessions/<chatId>`，Skill Edit 为 `/workspace`）。
- 注入本轮输入文件到 `user_files`（同一会话沙盒内跨父子/兄弟节点按文件 URL 去重分配文件名，相同 URL 复用原名，不同 URL 的同名文件自动递增后缀并同步回写 `name` / `sandboxPath`，避免互相覆盖）。
- 配置 npm/pnpm/yarn/bun/pip/uv/apt 镜像源。
- 同步内置 Skill 到 `$HOME/.fastgpt/skills/<name>`。
- 增量注入已发布 Skill 版本到共享 `/workspace/projects/<versionId>`（持久卷中已存在对应 `versionId` 目录时跳过 S3 下载解压，保留其他节点或会话已安装的版本目录，重建目录前先失效其旧 entrypoint 标记；Skill Edit 初始化则经容器临时目录 `/tmp` 流式落盘解压到 `/workspace` 根，不污染工作区文件树）。
- 执行 Sandbox 与 Skill `entrypoint.sh`。
- 扫描 `SKILL.md` 生成 Agent 提示信息。

## Entrypoint、状态分层与用户态依赖持久化

运行态状态按目标文件的存储生命周期拆分为两层（统一使用 `values: Record<string, string | string[]>`）：

- **容器根文件系统状态（`$HOME/.fastgpt/runtime/state.json`，随容器重建重置）**：用于 `mirrors.ts`（镜像源配置）与 `skill/builtin.ts`（系统内置技能 `$HOME/.fastgpt/skills/<name>`），确保容器休眠唤醒重建后自动补齐容器本地配置。
- **工作区持久化状态（`/workspace/.fastgpt/runtime/state.json`，随 JuiceFS 持久化并绑定容器 `image` 标识）**：用于 **Sandbox entrypoint**（按应用与节点记录脚本成功 hash）与 **Skill entrypoint**（按不可变 `versionId` 记录成功状态），并注入 `PYTHONUSERBASE=/workspace/.fastgpt/python`、`PIP_BREAK_SYSTEM_PACKAGES=1`、`NPM_CONFIG_PREFIX=/workspace/.fastgpt/npm` 与 `PATH` 前缀（下载缓存保持在容器本地盘，不落 JuiceFS），使空闲 `stop()` 唤醒后无需重跑初始化脚本且用户态安装的 Python/Node 包直接可用；镜像升级时因 `image` 变化自动失效重跑。
- **`.fastgpt` 系统目录隔离**：`listSandboxSessionDirectory`、工作区归档下载、系统默认 `.gitignore` 及 `packageSkillInSandbox` 均自动屏蔽/排除 `.fastgpt` 目录，防止系统状态与缓存依赖污染文件树或打入发布的技能版本包。
- **Skill Edit 热启动与打包发布**：
  - `initSkillEditRuntimeSandbox` 在 `Agent Sandbox Init Lease` 内重读实例最新 `context.skillVersionId` 并与 `targetVersionId` 对比：一致时直接复用持久卷工作区（跳过 S3 下载解压，防止并发打开页面互相擦除目录）；版本切换时先清空工作区内容（保留挂载点目录）再解压目标版本包。
  - `packageSkillInSandbox` 结合系统默认 `.gitignore` 与工作区 `.gitignore` 过滤 `node_modules/.venv/.fastgpt` 等目录，校验未忽略文件总大小后在 `$HOME/.fastgpt/tmp` 下打包并校验 zip 结构。

## Sandbox 工具

当前系统工具集合（定义位于 `packages/global/core/ai/sandbox`，实现位于 `application/toolCall`）：

- `sandbox_shell`
- `sandbox_read_file`
- `sandbox_write_file`
- `sandbox_edit_file`
- `sandbox_grep`
- `sandbox_find`
- `sandbox_ls`
- `sandbox_get_file_url`

`runSandboxTools` 统一完成 JSON 参数解析、Zod 校验、工具选择和标准结果裁剪。OpenSandbox 命令执行统一消费 SSE，在收到 `execution_complete` 或 `error` 终态事件时立即终止底层流。

## 在线 IDE、跨源预览与交互式终端（原生 `execd` 数据面 + `opensandbox-proxy` 边缘网关）

控制面与 IDE 文件管理请求由 **FastGPT 主站 API -> OpenSandbox Server Proxy（`useServerProxy: true`）-> 容器内 `execd:44772`** 处理；高频长连接终端与静态文件流式预览由独立 **Bun 边缘服务 `projects/opensandbox-proxy`（容器与 Helm Service 监听 `:1006`，Docker Compose 默认宿主机映射 `3006:1006`，可选 `PREVIEW_PORT: 1007` 双端口隔离）-> OpenSandbox Server Proxy -> 容器** 直接承载，客户端禁止直接传入 `sandboxId`：

1. **IDE 目录与二进制流式文件路由（`/api/core/ai/sandbox/fs/{list,mkdir,move,delete,exec}` + `/api/core/ai/sandbox/{download,upload}`）**：
   - 需登录鉴权的文件路由将相对路径锚定到当前 `sessionWorkDirectory`，允许访问自身容器内合法绝对路径（如 `/tmp/...`），严格拒绝 `..` 路径穿越，并禁止删除、移动或覆盖根路径（`.`、`sessionWorkDirectory`、`workspaceRoot`、`/`）；顶层 `workspaceRoot` 自动隐藏 `.fastgpt` 系统目录。
   - `list` 强制使用 `depth: 1` 单层按需懒加载，严禁全量递归扫描持久化 `/workspace` 打穿 JuiceFS PG 元数据；多文件内存写入走 `OpenSandboxAdapter.writeFiles` 单次多部分 `POST /files/upload` 快速路径（异常时有界并发逐文件回退），多目录 `SKILL.md` 扫描合并为单条带 `-prune` 的 `find` 命令。
   - `download` 单文件直接流式返回原始字节及弱 ETag（`W/"<size>-<mtimeMs>"`），目录流式打包为 ZIP（自动跳过符号链接与顶层 `.fastgpt`）；`upload` 遵循 OpenSandbox 官方 `writeFiles` 原子写（#2433）支持流式字节直接写入与 `oldEtag` 乐观并发检查，冲突返回 `409`（`SandboxFileConflictError`）；`move` 遵循 `execd` 官方原生语义（目标已存在时拒绝覆盖）；`delete` 对指向目录的符号链接只删除链接本身而不递归删除目标目录。
2. **Workspace 只读流式预览（主站 `/api/core/ai/sandbox/getFilePreviewLink` + `opensandbox-proxy` `GET|HEAD /preview/:sessionId/*path`）**：
   - 主站使用 Redis Lua 脚本原子签发 24 位随机字母数字 `sessionId`（`^[a-z][a-zA-Z0-9]{23}$`，TTL 2 小时，单沙盒上限 500 个活跃 session），对外构建简短预览地址 `${previewProxyBaseUrl}/preview/<sessionId>/<path>`（默认由 `AGENT_SANDBOX_PROXY_URL` 自动归一化派生，双端口模式支持 `AGENT_SANDBOX_PREVIEW_PROXY_URL` 覆盖）。
   - `opensandbox-proxy` 首次请求回调主站内部接口 `GET /api/core/ai/sandbox/verifyTicket?previewSessionId=...`（`x-agent-sandbox-proxy-secret` 常量时间校验）并在内存缓存上游地址 30 秒（失败清缓存重试 1 次），词法校验路径不越界后直接流式转发 `execd /files/download`（支持 `HEAD` 与 `Range` `206 Partial Content`），零主站重复查询、零 `realpath` Shell 开销，并强制下发 `X-Content-Type-Options: nosniff` 与不含 `allow-same-origin` 的 `Content-Security-Policy: sandbox allow-scripts allow-forms allow-popups;`（opaque Origin 隔离）。
3. **交互式 PTY 终端（主站 `POST /api/core/ai/sandbox/getTicket` + `opensandbox-proxy` `WS /terminal?ticket=...&since=...`）**：
   - 仅限 `skillEdit` 且具备 `WritePermissionVal` 的会话使用。
   - 主站 `getTicket` 确保容器内 `execd` bash PTY 会话存在并签发 60s HS256 JWT `ticket`；浏览器使用原生 `WebSocket` 直连 `opensandbox-proxy /terminal`（本地预验签拦截非法票据 -> `verifyTicket` 解析上游 -> 原生双向透传 `0x00~0x03` 二进制流与 JSON 控制帧 + 双向流控背压 + 断线 `since` 无损续传）；`opensandbox-proxy` 每 60s 批量回调 `POST /api/core/ai/sandbox/keepalive` 续期活跃沙盒 `lastActiveAt`。

## 资源停止、删除与双向对账 GC

定时任务由 `application/cron.ts` 注册：

- **正向闲置停止（每 10 分钟）**：扫描 `lastActiveAt` 超过闲置阈值的 `running` 实例，以非阻塞 `Lifecycle Lease`（`waitTimeoutMs = 0`，遇活跃请求自动跳过）停止远端容器（Docker 下卸载空闲 FUSE）并置为 `stopped`。
- **正向卡死操作自愈（每 10 分钟）**：扫描 `operation.heartbeatAt` 超过 `60s` 静默阈值或已处于回滚阶段的过渡态记录，以非阻塞 `Lifecycle Lease` 尝试接管（仍在途自动续租的活跃任务静默跳过；崩溃遗留任务按持久化 `phase` 幂等续跑停止、删除或激活回滚/补交）。
- **反向孤儿资源对账 GC（每 30 分钟，`reconcileOrphanSandboxResources`）**：
  - **孤儿容器对账（`reconcileOrphanSandboxContainers`）**：调用 `listManagedOpenSandboxes` 列出当前部署（`metadata.app = 'fastgpt'` 且 `metadata.deploymentId = <instanceId>`）下创建时间超过 **10 分钟宽限期**的容器，与 Mongo 记录比对；在 `Lifecycle Lease` 内二次确认后，清理无 Mongo 记录、记录已处于 `stopped` 稳定态，或远端物理容器 `id` 与稳定 `running` 记录持久化的 `instanceId` 不符的残留容器。
  - **孤儿卷对账（`reconcileOrphanSandboxVolumes`）**：调用 `volume-manager` `GET /v1/volumes` 列出全部受管卷，与 Mongo `storage.volumes.claimName` 比对；采用 Redis **两阶段标记清除**（首次未命中写入 `sandbox:gc:orphan-volume:<claimName>`，满 **30 分钟宽限期**后二次查询 Mongo 确认仍无引用再调用 `deleteSessionVolume`），防止并发创建窗口误删。
- **业务删除边界**：
  - App Chat 单会话删除只清理聊天记录和会话文件，不删除用户级共享 Sandbox。
  - App 删除或 Skill 删除通过 `deleteSandboxResourcesBySource` / `deleteSkillEditSandboxes` 清理该 source 下全部 Sandbox 容器、持久卷和 Mongo 记录。

## 可用性降级与 Quota

### 可用性降级

普通 App Chat 在系统未启用、App 未开启或团队套餐不支持时，通过 `systemDisabled / appDisabled / teamPlanUnavailable` 静默降级（不注入 Sandbox prompt、tools 和依赖 Sandbox 的 Skill，其他对话能力继续运行）。Skill Edit 与 Skill 调试保持强依赖。`checkExist` 只查询本地记录并返回可选关闭原因，不创建或唤醒实例。

App 会话的 `summary.hasAgentSandbox` 记录曾成功准备 runtime 的事实：Workflow 在文件、Skill 和 entrypoint 准备完成后先更新已存在的根会话标记，再发送 `ready`，供流式期间的独立文件请求鉴权（优先读取累计 summary，再读取 Chat Test 本轮根节点 metadata 或应用节点配置，系统/团队权限始终生效；后续轮次未使用 Sandbox 或就绪后出错均不撤销累计标记）。

### Quota

- 两级配额：系统总上限（`systemEnv.agentSandboxMax` / env `AGENT_SANDBOX_MAX`，默认 100）与团队配额（`systemEnv.agentSandboxMaxPerTeam` / env `AGENT_SANDBOX_MAX_PER_TEAM`，默认不限）。配额检查与状态写入之间为非加锁软限制，允许高并发激活窗口内的少量瞬时超额。
- App 会话与 Skill Edit 共用同一计数池：统计 Mongo 中处于活跃状态（**`provisioning / running / stopping`**）的实例数；`stopped / deleting` 不计入配额。
- 准入点位于 `prepareSandboxRuntime` 的新建与 `stopped -> provisioning` 唤醒路径；已处于 `running` 的快路径与释放路径（`stop / delete / checkExist / keepalive`）不重复占额或阻塞。

## 主要代码入口

| 能力 | 路径 |
| --- | --- |
| Runtime 寻址与准备入口 | `packages/service/core/ai/sandbox/application/runtime/index.ts` |
| Session 保活与存在性接口 | `packages/service/core/ai/sandbox/interface/session.ts` |
| 业务源删除清理接口 | `packages/service/core/ai/sandbox/interface/resource/sourceCleanup.ts` |
| 运行态激活与镜像收敛编排 | `packages/service/core/ai/sandbox/application/runtime/service.ts` |
| Runtime Client | `packages/service/core/ai/sandbox/application/runtime/client.ts` |
| 初始化 Pipeline 与 Entrypoint | `packages/service/core/ai/sandbox/application/runtime/prepare.ts`、`entrypoint.ts`、`state.ts` |
| Skill 注入、扫描与编辑运行态 | `packages/service/core/ai/sandbox/application/runtime/skill/*`、`application/skillEdit/*` |
| 生命周期执行器与异常收敛 | `packages/service/core/ai/sandbox/application/lifecycle/runner.ts`、`service.ts` |
| 资源停止、删除与双向对账 GC | `packages/service/core/ai/sandbox/application/resource.ts`、`cron.ts` |
| 分布式租约与配额守卫 | `packages/service/core/ai/sandbox/application/lease.ts`、`quota.ts`、`ownership.ts` |
| IDE 文件、预览与 PTY 终端编排 | `packages/service/core/ai/sandbox/application/file.ts`、`preview.ts`、`pty.ts` |
| 内置 Sandbox 工具集 | `packages/service/core/ai/sandbox/application/toolCall/*` |
| 实例 Schema 与仓储 | `packages/service/core/ai/sandbox/infrastructure/instance/schema.ts`、`repository.ts` |
| OpenSandbox 客户端与 Profile | `packages/service/core/ai/sandbox/infrastructure/opensandbox/opensandbox.ts`、`runtimeProfile.ts`、`config.ts`、`index.ts` |
| 持久卷服务与 Volume Manager | `packages/service/core/ai/sandbox/infrastructure/volume/service.ts`、`projects/volume-manager` |
| 边缘终端与预览网关 | `projects/opensandbox-proxy` |
| 主站 Sandbox API 路由 | `projects/app/src/pages/api/core/ai/sandbox/*` |

## 验证范围

Sandbox 改动应按影响范围覆盖：

- `source/sandboxId` 单向派生寻址、schema 5 态约束与索引。
- Quota 检查与计数口径（系统/团队配额、`provisioning/running/stopping` 活跃状态、释放路径豁免）。
- `OpenSandboxAdapter` 状态映射、`connectRunning` 快路径、`ensureRunning` 慢路径与 `writeFiles` 批量上传/降级。
- 5 态生命周期流转、容器丢失自动修复、镜像就地升级保留原卷、正向自愈与反向孤儿容器/卷 GC。
- 初始化 lease、`prepareSandbox` 顺序、`$HOME` 与 `/workspace/.fastgpt` 双层 `state.json` 幂等性（含镜像绑定失效）、`.fastgpt` 目录屏蔽与 Skill 热启动/导出 `.gitignore` 过滤。
- IDE `fs/*` 路由（`depth: 1` 懒加载、`oldEtag` 乐观锁）、`opensandbox-proxy`（Ticket 预验签、原生 PTY WS 透传与 `since` 重放、30s 预览缓存与失效重试、`Range` 流式转发、CSP 隔离、双端口模式）及主站 `getTicket / verifyTicket / keepalive` 联动。
