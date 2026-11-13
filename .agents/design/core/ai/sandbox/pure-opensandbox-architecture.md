# FastGPT Agent Sandbox 新架构方案设计（纯 OpenSandbox）

状态：已实现核心架构（Step 1~7 代码、Helm/Compose 模板与中英文部署文档已落地；仅剩 Step 0 真实 K8s 集群压测与在线验证项）

最后核对：2026-11-12

> **核心定调**：
> 1. **基线版本**：所有设计基于 OpenSandbox `1.2.0`（Docker runtime + Kubernetes `BatchSandbox`，不使用 Fast Sandbox）。
> 2. **存储（Docker 与 K8s 一致）**：每个沙箱一个独立 JuiceFS 子目录挂载到 `/workspace`，数据块存独立 S3 bucket，元数据存独立 PostgreSQL 库。K8s 由 JuiceFS CSI 动态 PVC 供给（保持 `storageClassShareMount: false` 独立 Mount Pod + `--subdir`）；Docker 由 `volume-manager` 内置官方 `juicefs` 客户端按沙箱启动独立 `--subdir` FUSE 挂载并包装为 Docker 原生 `local` bind 命名卷（不依赖第三方 `juicedata/juicefs` Docker 插件）。数据随写随落 S3（等价于实时归档），彻底取消独立的 S3 Zip 归档流程与 2x 空间预留。
> 3. **零跨租户数据访问（最高红线）**：从 FUSE 进程（独立 `--subdir`）、本地缓存隔离、代际卷名（`generationId`）、容器网络阻断（K8s Ingress/Egress 双封锁 + Docker 官方 egress 策略）、`CSP: sandbox` 不透明源隔离（强烈建议独立预览源部署）、服务端单向派生 `sandboxId` 六个维度彻底封死用户 A 访问用户 B 数据的路径。
> 4. **组件收敛**：删除独立包 `sdk/sandbox-adapter`（共享纯类型与常量迁入 `packages/global/core/ai/sandbox`，OpenSandbox 实现与工具内聚到 `packages/service/core/ai/sandbox/infrastructure/opensandbox/`）、删除 `sealosdevbox` 适配层、`projects/fastgpt-ide-agent`、旧 Rust `projects/agent-sandbox-proxy`、`archive.ts` 归档状态机与 `AGENT_SANDBOX_PROVIDER` 多提供方开关；保留并增强 `projects/volume-manager`（负责 K8s PVC / Docker JuiceFS 自托管卷的创建、挂载、卸载、删除与对账），新增轻量 Bun 边缘网关 `projects/opensandbox-proxy` 专职承载浏览器终端原生 WebSocket 与静态文件流式预览。
> 5. **访问链路**：控制面与 IDE 文件管理走 `FastGPT 主站 -> OpenSandbox Server Proxy（useServerProxy: true）-> execd（44772）`；交互终端与静态预览走 `Browser -> opensandbox-proxy（容器/Helm :1006，Compose 宿主机映射 3006:1006）-> OpenSandbox Server Proxy -> 容器`，不向公网或客户端暴露沙箱真实内网地址。
> 6. **Skill**：不做跨沙箱只读共享，每个沙箱启动时独立部署（沿用现有 `deploySkillPackage`）。
> 7. **旧数据**：新版运行时切换至 `agent_sandbox_instances_v3` 并加轻量未迁移门禁，通过 `systemMigrations` 两个串联手动任务完成 4 类旧源无损迁移与旧资源回收，详见 [Agent Sandbox v2 -> v3 迁移方案设计](./v3-juicefs-migration.md)。

---

## 1. 背景与目标

1. **移除 `sdk/sandbox-adapter` 独立包与 Sealos Devbox**：删除 `sdk/sandbox-adapter` 独立包（移除 `SealosDevboxAdapter`、`CommandFilesystemPolyfill` 及双 Provider 分支），将共享纯类型与常量内聚到 `packages/global/core/ai/sandbox`，将 `@alibaba-group/opensandbox@^1.2.0` 客户端直接内聚到 `packages/service/core/ai/sandbox/infrastructure/opensandbox/`。
2. **去掉归档包袱**：现有架构为「块存储 RWO PVC + 闲置 7 天后 zip 归档到 S3」，带来 9 状态机、归档/恢复分布式锁、归档前二次拉起容器、zip 需要 2x 磁盘空间、单节点云盘挂载数量上限等复杂度。新方案让持久卷本身直接落在 S3 上（Docker 与 K8s 一致），数据随写随落 S3，归档能力内建于存储层，不再需要独立的归档与恢复流程。
3. **去掉自研数据面组件**：用 OpenSandbox 原生 `execd`（`/files/*`、`/directories/list`、`/command`、`/pty`）替代 `fastgpt-ide-agent` 与 `agent-sandbox-proxy`，沙箱镜像不再需要内置 Rust Agent。
4. **Docker 与 K8s 双运行时统一**：业务代码与 OpenSandbox 调用契约 100% 一致，差异收敛在 `volume-manager` 与部署配置层。

---

## 2. 最终方案总览

### 2.1 架构图

```mermaid
flowchart LR
  B["浏览器: 对话 / IDE / 预览 / 终端"] -->|"对话 & IDE 文件 HTTP API"| F["FastGPT 主站 (多副本)"]
  B -->|"WS /terminal & GET /preview/:sessionId/*"| P["opensandbox-proxy (容器 :1006 / Compose 3006:1006, 可选 PREVIEW_PORT :1007)"]
  P -->|"verifyTicket / keepalive (x-agent-sandbox-proxy-secret)"| F
  F <-->|"沙箱记录 / 状态 / 租约"| M[("MongoDB")]
  F <-->|"PTY 绑定 / Preview 会话 / 分布式锁"| R[("Redis")]
  F -->|"ensure / umount / delete / list"| V["volume-manager (保留)"]
  V -->|"K8s: 创建 PVC sc=juicefs-sc"| K["K8s API"]
  V -->|"Docker: juicefs mount --subdir + 创建 local bind 命名卷"| DS["Docker daemon + rshared 挂载点"]
  F -->|"Lifecycle API + Server Proxy (HTTP)"| O["OpenSandbox Server 1.2.0"]
  P -->|"Server Proxy (WS /pty & HTTP /files/download)"| O
  O --> E["沙箱容器: execd 44772, /workspace = 独立 JuiceFS 子目录卷"]
  E -. "FUSE (K8s 独立 mount pod / Docker volume-manager 独立 FUSE 进程)" .-> J["JuiceFS 客户端 (--subdir)"]
  J -->|"数据块"| S3[("独立 S3 bucket")]
  J -->|"元数据"| PG[("独立 PostgreSQL 库")]
```

### 2.2 组件变化

| 处理 | 组件 | 说明 |
| --- | --- | --- |
| ❌ 删除 | `sdk/sandbox-adapter` 独立包、`SealosDevboxAdapter` / `CommandFilesystemPolyfill` | 移除独立 SDK 包与双 Provider 抽象分支，共享纯类型入 `packages/global`，OpenSandbox 实现内聚至 `packages/service/core/ai/sandbox/infrastructure/opensandbox/` |
| ❌ 删除 | `projects/fastgpt-ide-agent`、旧 Rust `projects/agent-sandbox-proxy` | 容器内双 Agent 收敛为 OpenSandbox 原生 `execd`（44772）；旧 Rust 网关由轻量 Bun `projects/opensandbox-proxy` 替代 |
| ❌ 删除 | `archive.ts`、`upgrade.ts`（归档升级状态机）、`application/legacyMigration/*`、v1 `LegacySandboxInstance` Schema、`archiving/archived/restoring/legacyMigrating` 状态 | 数据随写随落 S3，状态机从 9 态收敛为纯粹的 `v3` 5 态；移除 4.15/4.16 历史迁移与 Skill Edit 升级确认弹窗 |
| ♻️ 保留并调整 | `projects/volume-manager` | K8s 模式按 JuiceFS StorageClass 创建 PVC（保留 UID generation 等待逻辑）；Docker 模式内置官方 `juicefs` `1.4.2` 客户端，负责 `--trash-days 0` 格式化、子目录预建、属主设置（`uid 10001`）、容量与 `--inodes 200000` 配额、`--subdir` + `--hide-internal --prefix-internal` FUSE 挂载、底层目录 `0500` 防退化锁死、创建 Docker `local` bind 命名卷、停止时卸载 FUSE 与删除时 `juicefs rmr` 批量清理；新增 `list` 接口供孤儿卷对账 |
| ♻️ 精简 | `projects/agent-sandbox` 镜像 | 移除 Rust 编译阶段，仅保留运行期工具链并注入 `/workspace/.fastgpt/{python,npm}` 用户态依赖持久化路径，继续以 `uid 10001`（`sandbox` 用户）非 root 运行 |
| ➕ 新增 | `projects/opensandbox-proxy`（Bun 边缘网关） | 容器/Helm 监听 `:1006`（Compose 默认宿主机映射 `3006:1006`，可选 `PREVIEW_PORT: 1007` 双端口隔离），承载终端原生 WebSocket 双向零拷贝透传（本地 HS256 Ticket 预验签、有界缓冲与流控背压、60s 批量 `keepalive`）与静态文件流式预览（30s 会话地址缓存、`Range` 透传、不透明源 `CSP: sandbox` 安全响应头） |
| ➕ 新增（主站内） | IDE 目录路由 `/api/core/ai/sandbox/fs/{list,mkdir,move,delete,exec}`、流式读写 `/api/core/ai/sandbox/{download,upload}`、预览签发 `/api/core/ai/sandbox/getFilePreviewLink`、代理联动 `/api/core/ai/sandbox/{getTicket,verifyTicket,keepalive}`、反向对账 GC（沙箱 + 卷） | 主站内实现，统一遵循 OpenAPI + `parseApiInput` + `authSandboxRuntimeSession`，零终端/预览长连接驻留主站 |
| ➕ 新增部署依赖 | 独立 PostgreSQL 库（元数据）、独立 S3 bucket（数据块） | K8s：JuiceFS CSI Driver；Docker：`volume-manager` 开启 `/dev/fuse` 与 `rshared` 挂载目录（无需安装第三方 Docker Volume Plugin） |

---

## 3. 存储设计（含跨租户防串数据硬约束）

### 3.1 公共：JuiceFS 文件系统（Docker 与 K8s 相同）

- **文件系统**：一个专用 JuiceFS 文件系统（如 `fastgpt-sandbox`），`juicefs format` 时指定：
  - **元数据**：独立 PostgreSQL 库（例如 `postgres://juicefs:***@pg:5432/fastgpt_sandbox_meta`），不复用 FastGPT 的 pgvector 库。
  - **数据**：独立 S3 bucket（独立强随机 AK/SK，只授予该 bucket 最小权限），bucket 上**禁止配置 lifecycle 过期规则**（JuiceFS 数据块为内部切片格式，被过期删除即数据损坏）。
  - **`--trash-days`**：设为 `0`（删除后立即释放对象存储块与 PG 元数据，不在回收站滞留）。
- **卷命名与代际隔离（防残留复用）**：
  - 沿用现有代码的代际命名规则：`claimName = <volumeNamePrefix>-<sandboxId>-<generationId>`（默认前缀 `fastgpt-session`，8 位随机十六进制后缀，持久化在 Mongo 实例记录的 `storage.volumes[0].claimName` 中）。
  - `stopped -> running` 唤醒时直接复用 Mongo 中已持久化的 `claimName`；首次创建或 `deleting` 彻底删除后重建时生成全新 `generationId`，并在新建子目录时断言目录为空，**从物理上杜绝任何历史清理残留或重置数据库导致的新旧沙箱串数据**。
- **每沙箱独立 `--subdir` FUSE 实例（核心安全边界）**：
  - 每个沙箱对应文件系统内一个独立子目录 `/workspaces/<claimName>`，并设置目录硬配额（由 `AGENT_SANDBOX_STORAGE_SIZE_GI` 配置，主站默认 `1GiB`；Helm 可单独配置，写满返回 `ENOSPC / EDQUOT`）。
  - **挂载时必须以 `--subdir=/workspaces/<claimName>` 启动独立 FUSE 客户端进程**：FUSE 进程在协议层将该子目录锁定为根 inode（`ino=1`），FUSE 进程自身无法向上 `..` 寻址父目录或其他租户子目录，严禁多租户共享挂载根目录 `/` 的单 FUSE 进程。
- **本地缓存隔离（防跨沙箱缓存块串读/投毒）**：
  - 由于同一 JuiceFS 文件系统的 UUID 相同，多个 FUSE 进程绝不能共用同一个宿主机 `--cache-dir` 目录。
  - 默认建议设置 `--buffer-size 64 --cache-size 0`（仅使用 64MiB 内存读写缓冲，关闭本地磁盘块缓存，直接走同内网 S3）；若需开启磁盘缓存，K8s Mount Pod 必须使用 Pod 独占 `emptyDir`，Docker 必须按 `<claimName>` 隔離独立缓存目录并在删卷时清理。
- **写入语义**：不开启 `--writeback`；数据在 `close/fsync` 时上传 S3 后才提交元数据，数据随写随落 S3，无需独立归档。
- **元数据备份**：开启 JuiceFS 元数据自动备份，同时对独立 PG 库做常规备份。

### 3.2 Kubernetes：JuiceFS CSI 动态 PVC

- **StorageClass**：`juicefs-sc`，`reclaimPolicy: Delete`，JuiceFS Secret（`metaurl` / `bucket` / `AK/SK`）放在 CSI 所在命名空间，沙箱命名空间不可见。
- **隔离模式**：保持 CSI 默认 `storageClassShareMount: false`（每 PV 独立 Mount Pod + `--subdir` 挂载），**不开启**共享 Mount Pod，确保每个沙箱的 FUSE 进程只挂载自己的子目录。
- **Mount Pod 资源调优**：通过 StorageClass 参数或 CSI ConfigMap 调低每个 Mount Pod 的默认 `requests/limits`（例如 `requests: cpu 50m, memory 128Mi`，`limits: cpu 500m, memory 512Mi`），并在 `mountOptions` 中传入 `prefix-internal`、`buffer-size=64`、`cache-size=0`、`hide-internal`。
- **每沙箱 PVC**：由 `volume-manager` 创建，`claimName = <volumeNamePrefix>-<sandboxId>-<generationId>`（默认前缀 `fastgpt-session`），`storage` 由 `AGENT_SANDBOX_STORAGE_SIZE_GI` 配置（主站默认 `1Gi`，Helm 默认 `2Gi`），`accessModes: [ReadWriteOnce]`。保留 `K8sVolumeDriver` 现有的 `readPvc` + `waitForPvcGenerationEnd` + `UID precondition` 删除逻辑，防止同名或快速重建时的 `Terminating` 竞态。

### 3.3 Docker：`volume-manager` 自托管 `--subdir` FUSE + 原生 `local` 命名卷

> **为什么不使用 `juicedata/juicefs` Docker Volume Plugin？**
> 1. 第三方 Docker Managed Plugin 需宿主机手动执行 `docker plugin install`，离线/私有化/信创环境极难交付；
> 2. 插件存在 FUSE 进程崩溃后静默退化写入宿主机本地目录写满磁盘的已知缺陷；
> 3. `docker volume inspect` 会明文暴露传入 `-o` 的 PG `metaurl` 密码与 S3 `AK/SK`。
>
> 因此改为由 `fastgpt-volume-manager` 容器内置官方 `juicefs` 客户端二进制，自托管每沙箱 `--subdir` FUSE 挂载并包装为 Docker 原生 `local` bind 命名卷。ARM64 客户端依赖 glibc，runner 使用 Debian slim。

- **容器与宿主机准备**：
  - `projects/volume-manager/Dockerfile`（`v0.4.0`）内置官方 `juicefs` `1.4.2` 客户端二进制；
  - `docker-compose.yml` 中 `fastgpt-volume-manager` 配置 `cap_add: [SYS_ADMIN]`、`devices: [/dev/fuse:/dev/fuse]`，并挂载 `/var/lib/fastgpt/sandbox-mounts:/var/lib/fastgpt/sandbox-mounts:rshared`（通过 `rshared` 将容器内 FUSE 挂载传播到宿主机）与 `/var/run/docker.sock`；
  - 沙箱容器（`fastgpt-agent-sandbox:v0.4.0`）本身不挂载 `/dev/fuse`，不授予任何特权，继续以 `uid 10001` 非 root 运行。
- **`volume-manager` `ensure(claimName)` 流程**：
  1. **锁死底层挂载点目录（防 FUSE 崩溃退化写盘）**：创建 `/mounts/<claimName>`，在未挂载 FUSE 前将其设为 `root:root` 属主且权限设为 `0500`（只读无写权限）。一旦 FUSE 未挂载或异常退出，沙箱容器（`uid 10001`）写入立即返回 `EACCES`，绝不写入宿主机本地磁盘。
  2. **预建 JuiceFS 子目录与双重配额**：在 JuiceFS 内创建 `/workspaces/<claimName>`（若为新建请求且目录已非空则报错拒绝），设置属主 `10001:10001`，执行容量与 inode 数量配额（防零字节文件炸弹撑爆元数据库）：
     ```bash
     juicefs quota set "$META_URL" --path "/workspaces/${claimName}" --capacity 2 --inodes 200000
     ```
  3. **启动该沙箱专属的 `--subdir` FUSE 进程**：
     ```bash
     juicefs mount -d \
       --hide-internal \
       --prefix-internal \
       --subdir="/workspaces/${claimName}" \
       --buffer-size=64 \
       --cache-size=0 \
       "$META_URL" "/mounts/${claimName}"
     ```
     等待挂载点就绪（校验 `/mounts/${claimName}` 已成为独立 FUSE 挂载点且对 `10001` 可写）。
  4. **创建 Docker 原生 `local` bind 命名卷**：调用 Docker Engine API `POST /volumes/create`：
     ```json
     {
       "Name": "<claimName>",
       "Driver": "local",
       "DriverOpts": {
         "type": "none",
         "o": "bind",
         "device": "/var/lib/fastgpt/sandbox-mounts/<claimName>"
       },
       "Labels": {
         "app": "fastgpt",
         "fastgpt.sandbox.claim": "<claimName>"
       }
     }
     ```
- **停止与唤醒时的 FUSE 进程生命周期**：
  - 沙箱进入 `stopped`（闲置销毁容器）时，可调用 `volume-manager` 卸载 `/mounts/<claimName>`（停止该沙箱的 FUSE 进程，使 `stopped` 沙箱占用的宿主机内存归零，同时 S3 中的数据完好保留）；下次唤醒 `ensure(claimName)` 时若发现卷已存在但未 mount，自动重新执行第 3 步 `juicefs mount --subdir`。
- **删除（`remove(claimName)`）流程**：
  1. 确认没有容器引用该卷，再检查 FUSE；失效挂载必须先卸载并重挂，不能把 `ENOTCONN` 当作文件不存在；
  2. 读取挂载点下的租户顶层条目（过滤 `.jfs*` 虚拟控制文件），非空时调用 `juicefs rmr <entryPath...>` 直接执行元数据级批量递归清理（避免 Node 用户态递归 `unlink` 的数万次 FUSE 往返），随后卸载 FUSE、删除配额与宿主机空挂载点；
  3. 最后调用 `docker volume rm <claimName>`；前面任一步失败均保留 Docker 卷元数据，确保显式删除和反向 GC 可以重试。
- **本地开发与生产统一**：容器内外统一挂载 `/var/lib/fastgpt/sandbox-mounts:/var/lib/fastgpt/sandbox-mounts:rshared`（位于 Docker Linux 宿主机/VM 根文件系统下，Linux 与 macOS OrbStack / Docker Desktop 均原生处于 `shared` 传播模式，无需额外路径映射或 `local-dev` 降级分支），仅需配置 `VM_JUICEFS_META_URL`。

### 3.4 容器内目录与双层运行态状态约定

| 路径 | 是否持久化 | 说明 |
| --- | --- | --- |
| `/workspace/sessions/<chatId>` | ✅ | App / Workflow Builder 会话默认工作目录 |
| `/workspace/**` | ✅ | 用户 / Agent 创建的文件（含项目局部 `node_modules`、`.venv`） |
| `/workspace/projects/<versionId>` | ✅（按版本覆盖） | Skill 每次启动按版本独立部署；已存在且版本一致直接跳过下载解压 |
| `/workspace/.fastgpt/{runtime,python,npm}` | ✅（系统隐藏目录） | `runtime/state.json` 持久化工作区级 `sandboxEntrypoint` / `skillEntrypoint` 状态并绑定容器 `image`（镜像升级后自动失效重跑）；`PYTHONUSERBASE=/workspace/.fastgpt/python`（配合 `PIP_BREAK_SYSTEM_PACKAGES=1`，不设 `PIP_USER=1` 以兼容 `.venv`）与 `NPM_CONFIG_PREFIX=/workspace/.fastgpt/npm` 使空闲回收唤醒后用户安装的包继续可用；文件树、归档下载与技能发布包均自动屏蔽 `.fastgpt` |
| `$HOME=/home/sandbox`、apt 安装、下载缓存 | ❌ 随容器重建 | `$HOME/.fastgpt/runtime/state.json` 记录随容器销毁清空的镜像源配置（`mirrors.ts`）与系统内置技能（`$HOME/.fastgpt/skills/*`），容器唤醒重建后自动补齐；`pip/npm` 下载缓存保留在容器本地盘避免向 JuiceFS 产生双倍小文件写入放大 |

### 3.5 JuiceFS 元数据库与对象存储多后端适配规范（Community `v1.4.2`）

#### 1. 元数据库（Metadata Engine）兼容矩阵

| 数据库 / 引擎 | 推荐程度 | `VM_JUICEFS_META_URL` / CSI `metaurl` 格式 | 关键约束与注意事项 |
| --- | --- | --- | --- |
| **PostgreSQL**（默认推荐） | ✅ 首选 | `postgres://user:pass@host:5432/juicefs?sslmode=disable` | JuiceFS 仅注册 `postgres` 驱动名（`volume-manager` 已自动将 `postgresql://` 归一为 `postgres://`）；内网无 TLS 需显式加 `sslmode=disable`；建议同地域同可用区内网 RTT `< 2ms`，禁止与主站 pgvector 高负载库混用同一 database（多套环境共用库可用 `?search_path=` 或 `?table_prefix=` 隔离） |
| **MySQL / MariaDB** | ✅ 原生支持 | `mysql://user:pass@(host:3306)/juicefs` 或标准 URL `mysql://user:pass@host:3306/juicefs` | JuiceFS 原生要求 Go MySQL DSN 括号语法且仅注册 `mysql` 驱动名；Docker 模式下 `volume-manager` 已支持 `mariadb:// -> mysql://` 归一及无括号标准 URL 自动转为 `@tcp(host:port)`（K8s CSI `juicefs-secret` 仍需直接写 `mysql://user:pass@(host:3306)/db`） |
| **OceanBase / SeekDB（MySQL 模式）** | ✅ 原生支持 | `mysql://root@tenant#cluster:pass@(host:2881)/juicefs`（或 URL 编码 `root%40tenant`） | 必须使用 **MySQL 租户模式**（Oracle 租户不支持）；`volume-manager` 已兼容含 `@`、`#` 的租户用户名及密码中的 `@`、`:` 并剥离至 `META_PASSWORD` |
| **Redis / Valkey** | ⚠️ 可选（高性能但耗内存） | `redis://:pass@host:6379/1` 或 `rediss://...` | **严禁使用默认淘汰策略缓存实例**：必须开启 `appendonly yes`（AOF 持久化）且 `maxmemory-policy noeviction`，不支持 Redis Cluster 多分片事务；不能附加 `max_open_conns` 等未知查询参数（否则 `redis.ParseURL` 报错） |
| **TiKV** | ✅ 原生支持（大规模） | `tikv://pd1:2379,pd2:2379/fastgpt-sandbox` | 适合超大规模集群，无需用户名密码剥离与 SQL 连接池参数 |
| **SQLite3** | ⚠️ 仅单机开发调试 | `sqlite3:///var/lib/fastgpt/jfs-meta.db` | 单文件锁竞争，不支持 K8s 多节点共享 |
| **openGauss / 人大金仓（KingbaseES PG 模式）** | ⚠️ 协议兼容（需实测认证） | `postgres://user:pass@host:5432/juicefs?sslmode=disable` | 底层走 `pgx` 驱动：openGauss 需将客户端认证由私有 `sha256` 调整为 `md5` 并开启 PG 兼容模式，生产需做 `npm install / git` 压测验证 |
| **达梦（DM8）/ MongoDB** | ❌ 不支持 | — | JuiceFS 社区版 `v1.4.2` 无 `dm://` 与 `mongodb://` 元数据驱动（达梦仅 JuiceFS 企业版支持） |

#### 2. 对象存储（Object Storage）兼容矩阵

| 存储后端 | `--storage` 取值 | `--bucket` 格式示例 | 关键约束与注意事项 |
| --- | --- | --- | --- |
| **RustFS / MinIO / Sealos S3**（默认） | `minio` | `http://fastgpt-sandbox-rustfs:9000/fastgpt-sandbox` | **Path-Style** 必填完整 `http(s)://endpoint/bucket`（只填桶名会去连 AWS 公网）；自签 HTTPS 证书可加 `?tls-insecure-skip-verify=true` |
| **AWS S3** | `s3` | `https://<bucket>.s3.<region>.amazonaws.com` | Virtual-Hosted 风格；支持 EC2 IAM Role / EKS IRSA 免静态 AK/SK |
| **阿里云 OSS** | `oss` | `https://<bucket>.oss-<region>-internal.aliyuncs.com` | 生产强烈建议使用同地域 `-internal` 内网 Endpoint（免流量费且低延迟）；支持 ECS RAM 角色免静态 AK/SK |
| **腾讯云 COS** | `cos` | `https://<bucket>-<APPID>.cos.<region>.myqcloud.com` | 桶名**必须携带 `-<APPID>` 后缀** |
| **华为云 OBS / 火山引擎 TOS / 百度 BOS / 金山 KS3** | `obs` / `tos` / `bos` / `ks3` | `https://<bucket>.obs.<region>.myhuaweicloud.com` 等对应地域域名 | 使用原生驱动名性能与兼容性优于通用 `s3` 兼容层 |
| **Ceph RGW / 通用 S3 兼容私有云** | Path-Style 用 `minio`；Virtual-Hosted 用 `s3` | `http(s)://endpoint/bucket` 或 `https://bucket.endpoint` | **Cloudflare R2** 虽可用 `s3`，但因 `ListObjects` 字典序限制会影响 `juicefs gc / fsck`，生产优先选标准 S3 / OSS / COS / RustFS |

**对象存储硬性安全与权限红线**：
1. **必须独立私有桶（Private Bucket）**：严禁复用 `fastgpt-public` 公开桶，且桶上**严禁配置 Lifecycle 自动过期删除规则**（JuiceFS 按 4MiB 切片落盘，切片过期会导致文件静默损坏）。
2. **最小权限 IAM 子账号需预先建桶**：`juicefs format` 在桶不存在时会尝试 `CreateBucket`；企业子账号通常仅授予单桶读写删权限（`GetObject / PutObject / DeleteObject / ListBucket`），需在云控制台**提前手动创建好空 Bucket**，避免首次挂载时报 `AccessDenied`。

#### 3. `volume-manager` 已落地的兼容与连接池保护机制

- **单挂载进程 SQL 连接池自动收敛（[`DockerVolumeDriver.ts`](../../../../projects/volume-manager/src/drivers/DockerVolumeDriver.ts)）**：
  - 由于每个活跃沙箱独占一个 `juicefs mount -d --subdir=...` FUSE 进程，而 JuiceFS SQL 引擎默认 `max_open_conns=0`（不限）且 `max_idle_conns=2*GOMAXPROCS`（8 核机器上 50 个活跃沙箱即可占满 800 个空闲连接打爆默认 `max_connections=100` 的 PG），`buildJuicefsCommandCredentials` 对 `postgres` 与 `mysql` 自动追加缺省查询参数 **`max_open_conns=4&max_idle_conns=1&max_idle_time=60`**（单位秒，用户显式传入同名参数时保留用户值不覆盖）；对 `redis` / `rediss` / `tikv` / `sqlite3` 不追加任何未知参数。
- **DSN 协议归一与敏感凭证剥离（[`DockerVolumeDriver.ts`](../../../../projects/volume-manager/src/drivers/DockerVolumeDriver.ts)）**：
  - 先按首个 `/` 或 `?` 切分 authority 与路径查询串（防止 `?query` 中的 `@` 干扰解析），将密码剥离到子进程环境变量 `META_PASSWORD`，将对象存储密钥剥离到 `ACCESS_KEY` / `SECRET_KEY`，确保宿主机 `ps aux` 中的守护进程命令行零明文凭证。
- **云主机 IAM Role 免静态密钥支持（[`env.ts`](../../../../projects/volume-manager/src/env.ts)）**：
  - 默认内置 `minio` / `fastgpt-sandbox-rustfs` 强制要求配置静态 `VM_JUICEFS_ACCESS_KEY` 与 `VM_JUICEFS_SECRET_KEY`；当切换为外部云对象存储（如 `s3` / `oss` / `cos` / `obs` 且非默认内置桶）时，允许成对配置静态 AK/SK，或**同时留空**以走云平台实例角色（IAM Instance Profile / ECS RAM Role），禁止只配其一。

---

## 4. 生命周期设计

### 4.1 状态机（9 态收敛为 5 态）

```mermaid
stateDiagram-v2
  [*] --> provisioning: 首次使用 / 唤醒
  provisioning --> running: ensure volume -> create sandbox (运行态就绪后执行业务 prepare)
  provisioning --> stopped: 失败回滚
  running --> stopping: 闲置超时
  stopping --> stopped: 删除容器 (保留卷，Docker 可选 umount FUSE)
  stopped --> provisioning: 再次使用 (复用 Mongo 中的 claimName)
  running --> deleting: App / 用户 / 团队删除
  stopped --> deleting
  deleting --> [*]: 删除容器 + 删除卷与 JuiceFS 子目录 + 删除记录
```

### 4.2 关键流程

1. **启动 / 唤醒**：
   - 获取生命周期租约 -> `provisioning` -> 读取 Mongo 中已有的 `claimName`（首次创建则通过 `createSessionVolumeClaimName` 生成带随机 `generationId` 的新 `claimName` 并持久化到 `storage`）-> `volume-manager.ensure(claimName, storageSize)` -> `Sandbox.create`（挂载卷到 `/workspace`，`timeoutSeconds: null`，`metadata: { app: 'fastgpt', deploymentId, sessionId: sandboxId }`，就绪检查探测 `execd /files/info` 确认 `/workspace` 可访问）-> 将 OpenSandbox 返回的物理 `sandbox.id` 持久化为 Mongo `instanceId` 并提交为 `running` -> 随后在 `Init Lease` 内执行镜像源 / Skill 部署 / entrypoint 等业务初始化。挂载即可用，无恢复步骤。
2. **闲置停止**：
   - cron 扫描 `running` 且超过闲置阈值的记录 -> `stopping` -> `deleteSandbox` -> 确认远端容器已终止 -> （Docker 模式下通知 `volume-manager` 卸载空闲 FUSE 挂载点释放内存）-> `stopped`。无需打包上传。
3. **删除**：
   - `deleting` -> 删除容器并确认远端已消失 -> `volume-manager.remove(claimName)`（K8s：删除 PVC，由 `reclaimPolicy: Delete` 清理 JuiceFS 子目录；Docker：`docker volume rm` + `umount` + 删除 `/workspaces/<claimName>` 子目录与配额）-> 删除 Mongo 记录。
4. **镜像升级（Runtime Image Upgrade）**：
   - 删除原 `upgrade.ts` 基于归档恢复的升级状态机，以及 Skill Edit 前端的 `upgradeRequired` 弹窗确认与轮询交互。
   - 当检测到实例记录的 `image` 与当前配置的 `AGENT_SANDBOX_OPENSANDBOX_IMAGE` 不一致时：
     - 若处于 `stopped`：下次唤醒在 `provisioning` 阶段直接用新镜像创建容器并挂载原 `claimName`（0 额外耗时）；
     - 若处于 `running`：在 `prepareSandboxRuntime` 生命周期租约内直接删除旧容器（保留原 JuiceFS 卷），随后以新镜像重新创建容器挂载同一 `claimName` 并重跑 entrypoint（秒级静默完成，App Chat 与 Skill Edit 行为统一）。
5. **Skill 发布版本包与工作区存储边界**：
   - 取消的是「沙箱工作区生命周期归档（`sandbox/archive/<sandboxId>/package.zip`）」；
   - 保留「Skill 发布版本包（`MongoAgentSkillsVersion.storageKey`）」在业务 S3 中的不可变 `.zip` 存储；App 沙箱启动时按选中的 `versionId` 部署到 `/workspace/projects/<versionId>`（由于 `/workspace` 持久化在 JuiceFS，已存在对应 `versionId` 目录时直接跳过下载解压）。
6. **并发与可靠性机制**：
   - 两层单实例租约（`Agent Sandbox Init Lease -> Sandbox Lifecycle Lease`，`30s` 短 TTL + `5s` 自动续租；前台有界排队，后台 cron 非阻塞 try-lock）、创建与业务软删除之间的 Mongo Store-Load 屏障（无需跨用户 `Source Mutation Lease`）、基于 `operation.id + phase` 的即时幂等恢复与回滚（停止计算资源、保留 `storage` 与卷回到 `stopped`）、Quota 配额守卫。

### 4.3 单写者保证（重要）

- JuiceFS CSI 不走云盘 attach 流程，K8s 不会阻止两个节点上的 Pod 同时挂载同一个 RWO PVC；Docker 命名卷同样允许多容器挂载。
- 因此「同一时刻只有一个容器写同一工作区」必须由 FastGPT 保证：
  - 创建前必须持有 `Sandbox Lifecycle Lease`，且调用 OpenSandbox 确认旧实例已处于 `Terminated / UnExist (404)`（K8s 删除有优雅退出期，严禁发起删除后未等消失就立即新建）。
  - 每次创建容器后将 OpenSandbox 分配的唯一物理 `sandbox.id` 写入 Mongo `instanceId`（停止时清空），用于快路径按 ID 直连、单写者校验与反向孤儿容器对账。

### 4.4 双向对账 GC

- **正向**：cron 扫描 Mongo 中超时的 `running` / 卡住的中间态（`provisioning / stopping / deleting`），按状态与持久化 checkpoint 续跑或回滚（无内存状态，主站重启后自动继续）。
- **反向（沙箱）**：`listManagedOpenSandboxes`（按 `metadata.app = 'fastgpt'` 与 `metadata.deploymentId` 过滤）与 Mongo 对账，在 `Lifecycle Lease` 内清理创建时间超过宽限期（`10 分钟`）且在 Mongo 中不存在、已处于 `stopped` 稳定态，或远端物理容器 `id` 与稳定 `running` 记录 `instanceId` 不一致的残留容器；同时日常连接、复用、停止、删除也强制校验 `app + deploymentId + sessionId` 归属。
- **反向（卷）**：`volume-manager` 提供 `GET /v1/volumes` 列出带 FastGPT label 的 PVC / Docker 卷，与 Mongo `storage.volumes[0].claimName` 对账；采用 Redis **两阶段标记清除**（首次发现未引用写入 `sandbox:gc:orphan-volume:<claimName>`，满 `30 分钟` 宽限期后二次查询 Mongo 确认仍无引用再删除），彻底杜绝并发创建窗口误删。

---

## 5. 访问链路与防越权设计

```mermaid
sequenceDiagram
    participant Browser as 浏览器
    participant Proxy as opensandbox-proxy (容器:1006 / 宿主:3006)
    participant FastGPT as FastGPT 主站
    participant Server as OpenSandbox Server Proxy
    participant Execd as 沙箱 execd 44772

    Browser->>FastGPT: 1a. POST /api/core/ai/sandbox/fs/*, upload, download, getFilePreviewLink, getTicket (禁传 sandboxId)
    Note over FastGPT: 鉴权并由服务端派生 sandboxId = getRunningSandboxId(...)
    FastGPT->>Server: IDE 文件与工具调用 /sandboxes/{id}/proxy/44772/... (useServerProxy: true)
    Server->>Execd: /directories/list, /files/*, /command
    Browser->>Proxy: 1b. WS /terminal?ticket=...&since=... 或 GET /preview/:sessionId/*path
    Proxy->>FastGPT: GET /api/core/ai/sandbox/verifyTicket + POST /keepalive (x-agent-sandbox-proxy-secret)
    Proxy->>Server: WS /pty/{ptyId}/ws 或 GET /files/download (Range)
    Server->>Execd: 原生 PTY 二进制帧 / 流式文件读取
```

| 场景 | 实现方案 | 安全与性能约束 |
| --- | --- | --- |
| **Agent 工具调用与初始化快路径** | 主站 -> SDK（`useServerProxy: true`，共享 `undici` keep-alive 连接池）-> `execd` `/command`、`/files/*` | 1. 路径由 `resolveSandboxRuntimePath` 严格限制在工作区内；<br>2. `OpenSandboxAdapter.writeFiles` 对多文件内存数据走单次 `multipart/form-data` `POST /files/upload` 批量上传（异常时有界并发逐文件回退）；<br>3. `getAgentSkillInfos` 将多目录扫描合并为单条带 `-prune`（`node_modules / .venv / venv / .fastgpt`）的 `find` 命令 |
| **IDE 目录树 / 文件读写** | 主站 API（`fs/*` + 流式 `download/upload`）-> `execd` `/directories/list`、`/files/*`；替代原 `1318 /fs` WebSocket | 1. **目录树必须采用 `depth: 1` 按目录展开懒加载**（顶层自动隐藏 `.fastgpt`），严禁对持久化 `/workspace` 直接调用深层 `listDirectory` 扫穿 PG 元数据；<br>2. **二进制流式读写与乐观锁**：`download` 单文件直接返回原始字节流与弱 `ETag`，`upload` 先调 `getFileInfo` 校验 `oldEtag` 防止静默覆盖 Agent 后台修改；<br>3. **刷新时机**：每次 Tool Call 结束、终端命令结束或编辑器面板重新聚焦时刷新当前展开目录 |
| **文件 / HTML 预览** | 主站 `getFilePreviewLink` / `sandbox_get_file_url` 签发 24 位随机 `sessionId`（`^[a-z][a-zA-Z0-9]{23}$`，TTL 2h，单沙箱上限 500）+ `opensandbox-proxy` `GET\|HEAD /preview/:sessionId/*path` -> `execd /files/download`（支持 `Range`） | 1. **统一 `/workspace` 单用户沙箱边界**：签发前与边缘代理两端均执行词法路径规整（拒绝控制字符、反斜杠与任何 `..` 路径段，空路径或末尾 `/` 默认补全 `index.html`，拼接至 `rootDirectory = /workspace`）；沙箱安全隔离边界是按 `(sourceType, sourceId, userId)` 独占的单用户非特权无凭证容器实例本身；<br>2. **30 秒内存会话缓存 + 故障自愈重试**：`opensandbox-proxy` 首次请求回调主站 `verifyTicket?previewSessionId=...` 并缓存上游地址 30s（容量 5000，并发冷启动去重合并；遇容器重建导致的 `502/503/504` 自动清缓存重试 1 次），HTML 并发加载数十个静态资源零重复主站/数据库查询；<br>3. **不透明源 CSP 防护与跨源部署建议**：强制下发 `Content-Security-Policy: sandbox allow-scripts allow-forms allow-popups;`（严禁包含 `allow-same-origin`）、`X-Content-Type-Options: nosniff`、`Access-Control-Allow-Origin: *`；生产强烈建议将 `AGENT_SANDBOX_PROXY_URL`（或双端口模式下的 `AGENT_SANDBOX_PREVIEW_PROXY_URL`）部署在独立于主站的源（不同域名或端口） |
| **Skill 调试终端** | 主站 `POST /api/core/ai/sandbox/getTicket` 签发 60s HS256 JWT `ticket` + 浏览器原生 `WebSocket` 直连 `opensandbox-proxy` `GET /terminal?ticket=...&since=...` -> `execd /pty/<id>/ws` | 1. **仅限 `skillEdit` 写权限会话**：首次创建通过分布式互斥锁串行化并 CAS 维护 Redis `sandbox:pty:state:<sandboxId>` 绑定（`exec /bin/bash` 加载标准环境）；<br>2. **边缘秒级拦截与原生帧零拷贝透传**：`opensandbox-proxy` 在 HTTP Upgrade 前本地预验签 HS256 `ticket`（非法/过期直接返回 `401`），建连后经 `verifyTicket` 解析上游并双向透传 `0x00~0x03` 二进制帧与 JSON 控制帧（`resize / signal / ping / offset / exit`），支持预连接有界队列（64 帧 / 64KiB）、8MiB 背压保护与 `?takeover=1&since=<offset>` 无损断线续传；<br>3. **批量活跃续期**：`opensandbox-proxy` 每 60s 汇总存在活跃终端或预览流量的 `sandboxId` 回调 `POST /api/core/ai/sandbox/keepalive` 刷新 `lastActiveAt` |

---

## 6. 安全与跨租户隔离矩阵

| 维度 | 方案与硬约束 |
| --- | --- |
| **存储凭证隔离** | JuiceFS 的 PG / S3 凭证只存在于 K8s CSI 命名空间 Secret，或 Docker 下的 `volume-manager` 进程环境变量中；主站不挂载任何沙箱卷，沙箱容器内无任何存储凭证；Docker 原生 `local` bind 卷不在 `docker volume inspect` 中包含任何密钥；S3 AK/SK 只授予独立 bucket 权限，启动时强制校验非默认弱口令 |
| **FUSE 与缓存隔离** | 每个沙箱独立 `--subdir=/workspaces/<claimName>` FUSE 进程（K8s `storageClassShareMount: false`）；默认 `--cache-size=0` 禁用本地盘缓存（或每卷独立缓存目录），杜绝多沙箱共用 `/var/jfsCache/<uuid>` |
| **容器权限** | 沙箱禁止 `privileged`，drop 危险 capabilities，开启 `no-new-privileges`，以 `uid 10001` 非 root 运行；FUSE 只发生在 K8s Mount Pod / Docker `volume-manager` 层 |
| **网络隔离（K8s）** | Helm 管理的 `CiliumNetworkPolicy` 实施 **Ingress + Egress 双封锁**：<br>1. **Ingress**：沙箱 Pod **仅允许来自 `opensandbox-server` Pod 的入站连接**（覆盖 `44772` `execd` 与沙箱内用户自启 Web 服务端口），拒绝任何其他沙箱 Pod 东西向互访；<br>2. **Egress**：仅允许公网与 `kube-dns`，显式拒绝私网 CIDR、`entities: ["cluster", "host", "remote-node"]` 与云 metadata 地址（PG / S3 / 其他沙箱均不可达）；<br>3. 不向 OpenSandbox 下发 `networkPolicy`（避免注入需要 `NET_ADMIN` 的 egress sidecar） |
| **网络隔离（Docker）** | OpenSandbox 使用 `network_mode = "bridge"`，FastGPT 强制下发私网、loopback、link-local 和宿主机别名拒绝规则，由官方 egress sidecar 执行。当前 Server 拒绝自定义网桥与 `networkPolicy` 组合；`enable_icc=false` 在本地 OrbStack 实测不能单独保证隔离，因此不保留未使用的自定义网桥配置。容器网络隔离须验证实际连通性，不能仅依据配置值验收。 |
| **`execd` 访问** | 统一只经 OpenSandbox Server Proxy（`useServerProxy: true`），主站与 OpenSandbox Server 之间强制强随机 `apiKey` 鉴权；Docker 模式配置 `[docker] host_ip = "host.docker.internal"` 配合 `extra_hosts` 访问宿主机映射端口 |
| **容量限制（工作区）** | Docker 与 K8s 均为 JuiceFS 目录硬配额（由 `AGENT_SANDBOX_STORAGE_SIZE_GI` 配置，主站默认 `1GiB`）：K8s = PVC `storage`，Docker = `volume-manager` 设置的 `juicefs quota`；Docker 底层挂载点设为 `root:0500` 防止 FUSE 异常时写入宿主机磁盘 |
| **容量限制（容器可写层）** | K8s 通过 SDK `resource` / `resourceRequests` 传入容器 `ephemeral-storage`（默认按 `AGENT_SANDBOX_STORAGE_SIZE_GI + 0.5` Gi 自动计算，`/workspace` 不计入）；Docker 可选 `overlay2` + XFS `pquota` 的 `storage-opt size` |

---

## 7. Docker 与 Kubernetes 配置对照

| 配置项 | Docker（单机 Compose） | Kubernetes（Helm） |
| --- | --- | --- |
| **OpenSandbox runtime** | `[runtime] type = "docker"` | `[runtime] type = "kubernetes"`，`workload_provider = "batchsandbox"` |
| **工作区卷名** | `<volumeNamePrefix>-<sandboxId>-<generationId>`（默认 `fastgpt-session-...`） | `<volumeNamePrefix>-<sandboxId>-<generationId>`（默认 `fastgpt-session-...`） |
| **卷供给方式** | `volume-manager` 执行 `juicefs mount --subdir` + 创建 Docker `local` bind 命名卷 | `volume-manager` 创建 JuiceFS 动态 PVC（`sc=juicefs-sc`） |
| **建目录 / 配额 / 回收** | `volume-manager`（内置官方 `juicefs` CLI） | JuiceFS CSI Driver（`reclaimPolicy: Delete`） |
| **FUSE 客户端位置** | `volume-manager` 容器（经 `:rshared` 传播至宿主机） | 独立 CSI Mount Pod（`storageClassShareMount: false`） |
| **数据最终位置** | 独立 S3 bucket（元数据在独立 PG） | 独立 S3 bucket（元数据在独立 PG） |
| **单沙箱工作区容量** | JuiceFS 目录硬配额 | JuiceFS 目录硬配额 |
| **网络隔离** | 默认 `bridge` + FastGPT 固定拒绝规则 + OpenSandbox 官方 egress sidecar | `CiliumNetworkPolicy`（Ingress 仅放行 `opensandbox-server` + Egress 仅放行公网/DNS） |
| **业务代码** | 完全一致 | 完全一致 |

统一的沙箱创建代码（Docker / K8s 完全一致）：

```typescript
const sandbox = await Sandbox.create({
  connectionConfig: {
    domain: openSandboxServerUrl,
    apiKey: openSandboxApiKey,
    useServerProxy: true // 统一经 Server Proxy 访问 execd
  },
  image: sandboxImage,
  entrypoint: ['/home/sandbox/entrypoint.sh'],
  timeoutSeconds: null, // 不自动过期，由 FastGPT 统一回收（batchsandbox 不写 expireTime）
  resource: { cpu: '1', memory: '2048Mi' }, // K8s 另配 resourceRequests 与 ephemeral-storage
  metadata: { app: 'fastgpt', deploymentId, sessionId: sandboxId },
  volumes: [
    {
      name: 'workspace',
      pvc: {
        claimName, // <volumeNamePrefix>-<sandboxId>-<generationId>（默认 fastgpt-session-...），由 volume-manager 预先创建
        createIfNotExists: false,
        deleteOnSandboxTermination: false
      },
      mountPath: '/workspace',
      readOnly: false
    }
  ]
});
```

---

## 8. OpenSandbox 1.2.0 相关事实（已核对源码 / SDK）

1. **SDK 版本状态**：`packages/service/package.json` 直接依赖 `@alibaba-group/opensandbox: ^1.2.0`（原独立包 `sdk/sandbox-adapter` 已移除并内聚至 `packages/service/core/ai/sandbox/infrastructure/opensandbox/`）。1.2.0 新增了独立的 `ConnectionConfig.uploadFetch`（流式上传期间不设固定 30s 总超时，仅在发送完毕后限制响应头等待时间）以及 `execd` 原子文件写入（#2433）。
2. **Docker 不支持生命周期钩子**：`preStart / periodic` 在 Docker runtime 会被拒绝，初始化逻辑继续由 FastGPT 经 `execd` 执行。
3. **Docker 的 `pvc` 后端**：映射为 Docker 命名卷；本方案在 Docker 下由 `volume-manager` 创建 `Driver: "local"` 的 bind 命名卷指向已挂载 `--subdir` 的宿主机路径，因此无需使用 OpenSandbox 的 `subPath`，且必须设置 `createIfNotExists: false`。
4. **`timeoutSeconds: null`**：`batchsandbox` 不写 `expireTime`，Docker 与 K8s 均可用。
5. **终端 `/pty`**：`execd` 原生提供 `POST /pty`、`GET /pty/{sessionId}`、`DELETE /pty/{sessionId}` 与双向 WebSocket `/pty/{id}/ws`（支持 PTY / pipe 模式、resize、signal、断线重放、`takeover`），Server Proxy（`proxy.py`）原生支持 WebSocket 转发。
6. **Server Proxy 编码路径透传**：1.2.0 修复了编码路径透传（`%2F`、`%23` 等）与代理请求阻塞事件循环问题，预览路径可直接复用。

---

## 9. 风险与待验证项（PoC 先行）

| 风险 / 待验证 | 说明 | 应对措施 |
| --- | --- | --- |
| **JuiceFS 动态 PV 子目录属主** | 沙箱以 `uid 10001` 运行，需确认 K8s 新 PV 根目录对 `10001` 可写 | PoC 验证；通过 StorageClass `mountOptions`（如 `subdir` 权限参数）或 CSI `pathPattern` 设置属主与权限 |
| **Mount Pod 资源与节点 Pod 配额** | 为保证 `--subdir` 进程级隔离保持每 PV 独立 Mount Pod，会占用节点 Pod 数量与内存 | 显式下调 Mount Pod `requests`（`50m / 128Mi`）与 `--buffer-size 64 --cache-size 0`；压测单节点密度 |
| **Mount Pod / FUSE 进程崩溃** | 已挂载沙箱的 `/workspace` 变为 `Transport endpoint is not connected` | FastGPT `ping / readiness` 检查探测 `/workspace` 可访问性，异常时自动重建沙箱容器（数据已在 S3 不丢） |
| **小文件性能与 IDE 目录树** | `npm install` / `git` 及包含 `node_modules` 的目录扫描会密集访问 PG 元数据 | PG 与集群同内网部署；IDE 目录树改为 `depth: 1` 按需懒加载，严禁全量递归扫描 `node_modules/.venv` |
| **元数据库可靠性** | PG 元数据丢失 = 全部 S3 数据块不可还原 | 独立 PG 库 + 常规备份 + 开启 JuiceFS 元数据自动备份到 S3 |
| **多容器同时写同一卷** | RWO 对 JuiceFS 不形成底层块设备互斥 | FastGPT 生命周期租约 + 确认旧容器 `UnExist (404)` 后再创建新容器 + `instanceId` 对账 |
| **Docker `rshared` FUSE 传播** | `volume-manager` 容器内挂载需通过 `:rshared` 传播到宿主机 | 覆盖主流 Linux 发行版与 macOS（OrbStack / Docker Desktop），统一挂载 `/var/lib/fastgpt/sandbox-mounts:/var/lib/fastgpt/sandbox-mounts:rshared`；底层目录预设 `root:0500` 防止未挂载时写入宿主机盘 |

---

## 10. 已否决方案（保留评审结论）

| 方案 | 否决原因 |
| --- | --- |
| **Docker：安装 `juicedata/juicefs` 卷插件** | 需宿主机手动 `docker plugin install`，离线/信创环境难交付；插件内 FUSE 崩溃会静默退化写爆宿主机磁盘；`docker volume inspect` 明文暴露 PG 密码与 S3 AK/SK |
| **Docker / K8s：单共享 FUSE 进程挂载根目录 + subPath（或 `storageClassShareMount: true`）** | 单个 FUSE 进程内存里持有所有租户的完整 inode 树与元数据缓存，隔离级别低于每沙箱独立 `--subdir` FUSE 进程，且单 FUSE 进程故障影响整节点所有沙箱 |
| **Docker：每沙箱普通 local named volume（不进 JuiceFS）** | 数据只在单机磁盘，没有 S3 实时落盘与异地持久性，与 K8s 能力不一致 |
| **RWO 块存储 PVC + 停前 S3 Zip 归档（现有架构）** | 9 状态机复杂；归档需二次拉起容器；zip 打包/解压需要 2x 磁盘空间；块存储受云厂商单节点挂载盘数限制 |
| **保留 `fastgpt-ide-agent` + `agent-sandbox-proxy`** | 强绑定定制镜像，与 `execd` 双 Agent 功能重叠，额外维护两个 Rust 工程与独立代理端口 |
| **容器本地盘 + `tar.gz` 流式检查点到 S3** | 容器异常终止会丢失上次检查点后的改动，需自研检查点 / fencing / 增量检测逻辑 |
| **S3 FUSE CSI（`s3fs` / `rclone` / `mountpoint-s3`）** | `1 文件 = 1 对象`，无原子 `rename` / 随机写 / 文件锁，`git`、`npm`、`sqlite` 不可靠，无原生目录硬配额 |
| **Fast Sandbox（Firecracker，checkpoint 到 S3）** | 仅支持 K8s 且需裸金属 KVM、XFS reflink 状态盘、特权 Fastlet；模板模式不支持按次传 `env / resourceLimits / volumes`；每次暂停需上传数 GiB 内存快照；不支持 Docker |
| **K8s BatchSandbox pause（rootfs 提交到 OCI 仓库）** | 存储在镜像仓库而非 S3，提交 Job 需 UID 0 访问 containerd，异常终止不保证持久，不支持 Docker |

---

## TODO

- [ ] **Step 0（PoC 验证）**：
  - [ ] K8s：验证 JuiceFS CSI（PG 元数据 + 独立 S3 bucket，`storageClassShareMount: false`）动态 PVC 在 OpenSandbox 1.2.0 `batchsandbox` 下挂载 `/workspace`：`uid 10001` 可写、目录硬配额生效、Mount Pod 资源（`buffer-size=64`、`cache-size=0`、`hide-internal`）与启动耗时、`npm install / git` 性能基线、`CiliumNetworkPolicy` Ingress/Egress 阻断横向 `44772` 访问。
  - [x] Docker：验证 `volume-manager`（`v0.4.0`）内置官方 `juicefs` `1.4.2` 二进制 + `--hide-internal` + `:rshared` 挂载 `--subdir` + 底层目录 `root:0500` 防退化 + Docker 原生 `local` bind 命名卷经 OpenSandbox `pvc` 后端挂载：`uid 10001` 可写、`juicefs quota` 生效、`stopped` 时 `umount` 释放内存与唤醒重挂、Docker 官方 egress 策略阻断私网与其他沙箱访问。
- [x] **Step 1（SDK 内聚与 Provider 瘦身）**：
  - [x] 移除 `sdk/sandbox-adapter` 独立包、`sealos-devbox` 与 `CommandFilesystemPolyfill`；将共享纯类型与常量迁入 `packages/global/core/ai/sandbox`，将 `@alibaba-group/opensandbox@^1.2.0` 客户端实现内聚到 `packages/service/core/ai/sandbox/infrastructure/opensandbox/`，固定 `useServerProxy: true`。
- [x] **Step 2（存储与生命周期收敛）**：
  - [x] `volume-manager` K8s 模式对齐 JuiceFS StorageClass（保留 `K8sVolumeDriver` 的 UID generation 等待逻辑）；Docker 模式实现 `juicefs mount --subdir` + `local` bind 卷 + `umount` + 子目录与配额清理，新增 `list` 接口；
  - [x] 保留 `<volumeNamePrefix>-<sandboxId>-<generationId>` 代际命名（默认 `fastgpt-session`）；
  - [x] 删除 `archive.ts`、`upgrade.ts`（归档升级状态机）、`application/legacyMigration/*`、v1 `LegacySandboxInstance` Schema 及 `/api/admin/4160/initUserSandbox` 等历史兼容代码，状态机收敛为 `provisioning / running / stopping / stopped / deleting`；
  - [x] 镜像变更收敛为在生命周期锁内直接删旧容器、以新镜像挂原卷重建（移除 Skill Edit 前端升级确认弹窗）。
- [x] **Step 3（访问链路替换、边缘网关收敛与安全加固）**：
  - [x] 新增 `/api/core/ai/sandbox/fs/*` 与流式 `/api/core/ai/sandbox/{download,upload}` 路由，IDE 目录树（改为 `depth: 1` 懒加载并屏蔽 `.fastgpt`）与文件读写（增加 `oldEtag` 乐观并发检查）对接 `execd`；
  - [x] 新建 Bun 边缘服务 `projects/opensandbox-proxy`（容器/Helm `:1006`、Compose 宿主机 `3006:1006` + 可选 `PREVIEW_PORT: 1007` 双端口隔离），承载静态文件流式预览（30s 会话缓存、`Range` 透传、不透明源 `CSP: sandbox`）与终端原生 WebSocket 双向零拷贝透传（`0x00~0x03` 二进制帧、`since` 断线续传、60s 批量 `keepalive`）；
  - [x] 主站保留收敛后的 `getTicket.ts`、`verifyTicket.ts`、`keepalive.ts` 与 `getFilePreviewLink.ts`；删除 `projects/fastgpt-ide-agent`、旧 Rust `projects/agent-sandbox-proxy` 及主站内临时中转路由，精简 `projects/agent-sandbox/Dockerfile` 并落地 `/workspace/.fastgpt` 状态与依赖持久化、`writeFiles` 单请求多文件批量上传及单次 `find -prune` 技能扫描。
- [x] **Step 4（双向对账 GC）**：
  - [x] 实现沙箱容器与持久卷的正反向对账 GC（10m 容器宽限期 + 30m 卷两阶段标记清除）。
- [x] **Step 5（部署配置、文档与集成验收测试）**：
  - [x] Helm 增加 JuiceFS CSI / StorageClass / Secret 及 `CiliumNetworkPolicy` Ingress+Egress 配置说明；
  - [x] Docker Compose 增加独立 PG database、独立 MinIO/RustFS bucket、`volume-manager` `/dev/fuse` + `:rshared` 挂载及 Docker `bridge` / egress 策略兼容约束说明（修改部署 `.yml/.yaml` 前需单独获得用户确认）；
  - [x] 补齐 OpenSandbox 集成测试（`fastgpt.integration.test.ts`、`skill-import.integration.test.ts`）与端到端验收测试套件（`.agents/test/`）。
- [x] **Step 6（v2 -> v3 系统迁移与旧资源回收，详见 [v3-juicefs-migration.md](./v3-juicefs-migration.md)）**：
  - [x] 新版集合切换至 `agent_sandbox_instances_v3` + 轻量 `v2` 未迁移运行时门禁；
  - [x] `volume-manager` 旧卷窄权限探测/删除接口 + `tasks/4180/` 两阶段 `manual: true` 数据迁移与旧资源回收任务（覆盖 K8s 旧 PVC / Docker 旧 local 卷 / S3 zip / Sealos Devbox）。
- [x] **Step 7（JuiceFS 元数据库与对象存储多后端适配及部署文档）**：
  - [x] `volume-manager` 代码与单测适配（`projects/volume-manager/src/env.ts`、`src/drivers/DockerVolumeDriver.ts`）：支持 `postgresql:// -> postgres://` 与 `mariadb:// -> mysql://` 协议归一、MySQL/OceanBase Go DSN 与无括号标准 URL 双向兼容（含 `root@tenant#cluster` 多符号用户名）、`postgres/mysql` 默认注入单挂载进程连接池限制（`max_open_conns=4&max_idle_conns=1&max_idle_time=60`，不污染 Redis/TiKV/SQLite3），以及外接云对象存储允许同时省略静态 AK/SK 以复用 IAM Role / RAM 角色；
  - [x] **已补充部署与配置文档（中英文同步：`document/content/self-host/config/sandbox/opensandbox.mdx` & `.en.mdx`、`pro/deploy/charts/fastgpt-pro/README.md` & `README.zh-CN.md`）**：
    - [x] **外接元数据库配置指南与兼容表**：补充 PostgreSQL（`?sslmode=disable`、同地域内网低延迟要求、多套环境共用库 `?table_prefix=` / `?search_path=` 隔离）、MySQL/MariaDB、OceanBase（必须 MySQL 租户模式及 `root@tenant#cluster` DSN 写法）、Redis（强制要求 `appendonly yes` + `maxmemory-policy noeviction`、不支持 Cluster）配置示例；明确说明 openGauss / 人大金仓的认证兼容前提，以及**不支持达梦（DM8）与 MongoDB** 作为 JuiceFS 元数据库；
    - [x] **外接对象存储配置指南与兼容表**：补充内置 RustFS/MinIO（`VM_JUICEFS_STORAGE=minio` + Path-Style 完整 URL `http(s)://endpoint/bucket`、自签证书 `?tls-insecure-skip-verify=true`）、AWS S3（`s3` Virtual-Hosted URL）、阿里云 OSS（`oss` 推荐 `-internal` 内网 Endpoint）、腾讯云 COS（`cos` 桶名必带 `-<APPID>`）、华为云 OBS（`obs`）、火山引擎 TOS（`tos`）等配置对照，以及云主机 IAM Role / ECS RAM 角色免静态 AK/SK 说明；
    - [x] **存储安全与运维排障提示**：强调沙箱桶必须为**独立私有桶**（严禁共用 `fastgpt-public`，严禁配置 Lifecycle 自动过期删除策略），提醒使用最小权限 IAM 子账号（无 `CreateBucket` 权限）时必须**提前手动创建好空 Bucket**；
    - [x] **Kubernetes 部署文档与 `juicefs-secret` 调优说明**：K8s 模式下挂载由 JuiceFS CSI Mount Pod 直接读取 `kube-system` 的 `juicefs-secret` 执行（不经过 `DockerVolumeDriver`），已在 `pro/deploy/charts/fastgpt-pro/README*.md` 与 `opensandbox*.mdx` 补充 `mountOptions: [prefix-internal, ...]` 及 `metaurl` 追加 `?max_open_conns=4&max_idle_conns=1&max_idle_time=60` 的高并发防连接耗尽说明。
