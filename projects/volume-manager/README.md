# volume-manager

FastGPT Agent 沙箱存储卷管理服务。负责按 FastGPT 分配的代际卷名 `claimName = fastgpt-session-<sandboxId>-<generationId>` 创建、挂载、卸载、列举和销毁持久化存储卷，支持 **Kubernetes（JuiceFS CSI 动态 PVC）** 和 **Docker（自托管 JuiceFS `--subdir` FUSE + 原生 `local` bind 命名卷）** 两种运行时。

## 核心安全与隔离设计

1. **零跨租户数据越权**：
   - 每个沙箱独占 JuiceFS `/workspaces/<claimName>` 子目录，强制以 `--subdir=/workspaces/<claimName>` 启动独立 FUSE 客户端进程，将该子目录锁定为 FUSE 根 inode（`ino=1`），物理阻断 `..` 向上遍历。
   - 默认挂载参数 `--buffer-size 64 --cache-size 0`，禁用宿主机共享本地盘缓存目录（`/var/jfsCache/<uuid>`）。
   - 代际卷名（`generationId`）：新建卷时校验子目录必须为空，防止历史残留复用导致跨沙箱串数据。
2. **Docker 防退化锁死（Fail-Closed）**：
   - 在启动 `juicefs mount` 前，将底层挂载点目录设为 `root:root` + `0500` 只读权限；一旦 FUSE 未挂载或崩溃，沙箱（`uid 10001`）写入立即触发 `Permission denied`，彻底杜绝静默退化写满宿主机磁盘。
   - 通过 Docker 原生 `local` bind 命名卷挂载，不在 `docker volume inspect` 中暴露任何 PG 或 S3 凭证。

## API

所有 `/v1/*` 路由需要在请求头中携带 `Authorization: Bearer <VM_AUTH_TOKEN>`。

### 1. 健康检查

```http
GET /health
```

响应：`{ "status": "ok" }`

### 2. 确保存储卷就绪（创建 / 唤醒重挂）

```http
POST /v1/volumes/ensure
Content-Type: application/json

{ "claimName": "fastgpt-session-<sandboxId>-<generation>", "storageSize": "1Gi", "deploymentId": "0123456789abcdef0123456789abcdef" }
```

- 卷已存在（Docker 模式下若未挂载会自动重挂 FUSE）：返回 `200`，`{ "claimName": "...", "created": false }`
- 卷新建：返回 `201`，`{ "claimName": "...", "created": true }`
- 同名卷已被其他部署占有：返回 `409 Conflict`

### 3. 停止时卸载空闲 FUSE（仅 Docker 模式）

```http
POST /v1/volumes/:claimName/unmount?deploymentId=0123456789abcdef0123456789abcdef
```

沙箱进入 `stopped` 时校验部署归属并释放该沙箱专属的宿主机 `juicefs` FUSE 进程内存（S3 数据保留，下次 `ensure` 自动重挂），响应 `204 No Content`。

### 4. 删除存储卷

```http
DELETE /v1/volumes/:claimName?deploymentId=0123456789abcdef0123456789abcdef
```

- K8s 模式：删除 PVC 并等待目标 UID generation 完全消失（由 JuiceFS CSI `reclaimPolicy: Delete` 清理子目录）。
- Docker 模式：确认没有容器引用后，先重挂失效 FUSE、清空租户文件、卸载并移除配额与挂载点，最后删除 Docker `local` bind 卷。存储清理失败时保留 Docker 卷元数据，供下次删除或 GC 重试。
- 响应：`204 No Content`（幂等）。

### 5. 列出受管存储卷（供孤儿卷反向对账 GC 使用）

```http
GET /v1/volumes?deploymentId=0123456789abcdef0123456789abcdef
```

响应：`{ "items": ["fastgpt-session-..."] }`。只返回带有匹配部署标签的卷。`deploymentId` 由 FastGPT 复用数据库中的部署实例 ID 自动传入，不依赖额外环境变量。

---

## Kubernetes 部署配置说明

Kubernetes 环境下的 JuiceFS StorageClass、挂载隔离以及 OpenSandbox 沙箱 Pod 网络隔离等部署编排配置均维护在商业版 Helm Chart（`pro/deploy/charts/fastgpt-pro`）中。

---

## Docker Compose 部署配置说明

1. **独立 PG 元数据库 + 独立 RustFS 对象存储**：
   - OpenSandbox 使用独立的 `fastgpt-sandbox-pg`（PostgreSQL）与 `fastgpt-sandbox-rustfs`（RustFS）容器，部署在独立的 `opensandbox` 网络中，不与 FastGPT 主业务向量库或对象存储混用。
   - 配置 `VM_JUICEFS_META_URL`、`VM_JUICEFS_ACCESS_KEY`、`VM_JUICEFS_SECRET_KEY` 后（`VM_JUICEFS_STORAGE` 与 `VM_JUICEFS_BUCKET` 默认指向内置专属 RustFS，也可按需覆盖为外部云对象存储），`fastgpt-volume-manager` 首次挂载前会自动幂等执行 `juicefs format --no-update`，自动在 `fastgpt-sandbox-rustfs` 中创建桶并初始化 `fastgpt-sandbox-pg` 元数据。
2. **Docker Compose `fastgpt-volume-manager` 服务配置要点（Linux 与 macOS OrbStack/Docker Desktop 通用）**：
   - `cap_add: [SYS_ADMIN]`
   - `devices: ["/dev/fuse:/dev/fuse"]`
   - `security_opt: ["apparmor:unconfined"]`
   - `volumes`:
     - `/var/run/docker.sock:/var/run/docker.sock`
     - `/var/lib/fastgpt/sandbox-mounts:/var/lib/fastgpt/sandbox-mounts:rshared`（容器内外统一使用相同路径，直接落在 Docker Linux 宿主机/VM 根文件系统下，原生支持 `shared` 挂载传播）
   - 环境变量：`VM_RUNTIME=docker`、`VM_JUICEFS_META_URL`、`VM_JUICEFS_ACCESS_KEY`、`VM_JUICEFS_SECRET_KEY`（可选 `VM_JUICEFS_STORAGE`、`VM_JUICEFS_BUCKET`）。
3. **Docker 网络策略**：OpenSandbox 保持 `network_mode = "bridge"`，`host_ip = "host.docker.internal"`，由 FastGPT 下发固定的私网、loopback、link-local 和宿主机别名拒绝规则，通过官方 egress sidecar 执行。当前 OpenSandbox Server 不支持自定义网桥与 `networkPolicy` 同时使用；不能仅依赖 `enable_icc=false` 认定隔离生效。Kubernetes 继续由集群网络策略隔离，不下发 Docker egress policy。
