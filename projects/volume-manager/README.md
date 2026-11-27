# volume-manager

FastGPT Agent 沙箱存储卷管理服务。负责按 FastGPT 分配的精确 `claimName` 列出、检查、创建和销毁持久化存储卷，支持 Kubernetes PVC 和 Docker Volume 两种运行时。

## 技术栈

- **Runtime**: [Node.js](https://nodejs.org)（`^22.23.4 || ^24.22.1 || ^26.12.1`，镜像默认 `node:24.22.1-alpine`）+ [pnpm](https://pnpm.io)（`10.x`）
- **HTTP 框架与客户端**: [Hono](https://hono.dev)（`@hono/node-server`）+ [undici](https://undici.nodejs.org)
- **参数校验**: [Zod](https://zod.dev)
- **日志**: `@fastgpt-sdk/otel/logger`
- **测试**: [Vitest](https://vitest.dev)

## 快速开始

```bash
# 开发模式（热重载，tsx watch）
pnpm dev

# 构建（tsdown）
pnpm build

# 生产启动（node dist/index.js）
pnpm start

# 运行测试（vitest run）
pnpm test
```

## API

所有 `/v1/*` 路由需要在请求头中携带 `Authorization: Bearer <VM_AUTH_TOKEN>`（恒定时间校验，失败返回 `401`）。

### 所有权标签与安全防护

本服务创建的 Kubernetes PVC 与 Docker named volume 均统一携带所有权标签（见 `src/utils/ownership.ts`）：

- `app=fastgpt`
- `managed-by=fastgpt-volume-manager`

`POST /v1/volumes/ensure`、`GET /v1/volumes/:claimName` 与 `DELETE /v1/volumes/:claimName` 均会校验目标卷的所有权标签；若同名卷已存在但缺少完整托管标签，服务拒绝操作并返回 **`403 Forbidden`**，避免误操作外部资源。

4.18.0 过渡期（移除窗口 `>= 4.19.0`）在 `GET /v1/volumes/:claimName` 与 `DELETE /v1/volumes/:claimName` 上支持可选查询参数 `?allowLegacyUnlabeled=true`，用于只读核验或清理迁移期前遗留的无标签（或仅含部分 FastGPT 标签）存量卷；即便开启该参数，仍会严格拒绝携带其他平台标记（`app.kubernetes.io/*`、`com.docker.compose.*`、`k8s-app`、`helm.sh/chart` 或冲突的 `app` / `managed-by`）的外部卷。

### 健康检查

```http
GET /health
```

响应：`200 OK`，`{ "status": "ok" }`（无需鉴权）

### 列出托管存储卷

```http
GET /v1/volumes
```

响应：`200 OK`，`{ "items": ["fastgpt-session-..."] }`

按 `app=fastgpt` 与 `managed-by=fastgpt-volume-manager` 标签过滤并校验名称格式；Kubernetes 模式下自动跳过处于 `Terminating`（存在 `deletionTimestamp`）的 PVC。

### 检查存储卷是否存在

```http
GET /v1/volumes/:claimName[?allowLegacyUnlabeled=true]
```

只读核验目标持久卷是否存在且归属本服务（绝不触发新建卷）：

- 卷存在且归属合法（Kubernetes 下处于活跃非 `Terminating` 态）：返回 `200`，`{ "claimName": "..." }`
- 卷不存在（或 Kubernetes 下正在删除）：返回 `404`
- 卷存在但不归属本服务：返回 `403`
- `claimName` 格式非法：返回 `400`

### 确保存储卷存在

```http
POST /v1/volumes/ensure
Content-Type: application/json

{ "claimName": "fastgpt-session-<sandboxId>-<generation>", "storageSize": "1Gi" }
```

`claimName` 由 FastGPT 生成并先持久化；volume-manager 不根据会话 ID 推导名称。
`storageSize` 可选，仅 Kubernetes 模式下创建新 PVC 时有效，未传入时使用 `1Gi`。

- 卷已存在且归属合法：返回 `200`，`{ "claimName": "...", "created": false }`
- 卷新建（自动写入托管所有权标签）：返回 `201`，`{ "claimName": "...", "created": true }`
- 请求体非法：返回 `400`
- 同名卷存在但不归属本服务：返回 `403`
- Kubernetes 下同名 PVC 处于 `Terminating` 等待释放超时：返回 `504`

### 删除存储卷

```http
DELETE /v1/volumes/:claimName[?allowLegacyUnlabeled=true]
```

- 删除成功或卷本就不存在（幂等）：返回 `204 No Content`
- `claimName` 格式非法：返回 `400`
- 卷存在但不归属本服务：返回 `403`
- Kubernetes 下等待 `Terminating` 超时：返回 `504`

Kubernetes 模式下，`204` 表示目标 PVC generation 已完成删除（携带 `preconditions.uid` 发起删除并轮询至 PVC 对象不存在或已被新的 UID generation 替换），不是仅表示 API Server 接受了 DELETE 请求。Docker 模式保持 Docker API 原有的同步删除语义。

## 环境变量

### 服务与运行时变量（`src/env.ts` 校验）

| 变量 | 必填 | 默认值 | 说明 |
|------|------|--------|------|
| `VM_AUTH_TOKEN` | ✅ | - | API 鉴权 Token |
| `VM_RUNTIME` | | `kubernetes` | 运行时：`kubernetes` 或 `docker` |
| `PORT` | | `3000` | HTTP 监听端口 |
| `VM_DOCKER_SOCKET` | | `/var/run/docker.sock` | Docker socket 路径（docker 模式） |
| `VM_DOCKER_API_VERSION` | | `v1.44` | Docker Engine API 版本（docker 模式） |
| `VM_K8S_NAMESPACE` | | `opensandbox` | PVC 所在命名空间（k8s 模式） |
| `VM_K8S_PVC_STORAGE_CLASS` | | `''` | PVC StorageClass（k8s 模式） |

### 日志变量（`@fastgpt-sdk/otel/logger` 读取）

日志级别由 `@fastgpt-sdk/otel/logger` 的 `LOG_*` 环境变量统一控制（不存在 `VM_LOG_LEVEL` 变量）：

| 变量 | 必填 | 默认值 | 说明 |
|------|------|--------|------|
| `LOG_ENABLE_CONSOLE` | | `true` | 是否开启控制台日志输出 |
| `LOG_CONSOLE_LEVEL` | | `info` | 控制台日志级别：`trace` / `debug` / `info` / `warning` / `error` / `fatal` |
| `LOG_ENABLE_OTEL` | | `false` | 是否开启 OpenTelemetry 日志上报 |
| `LOG_OTEL_URL` | | `http://localhost:4318/v1/logs` | OpenTelemetry OTLP 日志接收地址 |
| `LOG_OTEL_SERVICE_NAME` | | `fastgpt-volume-manager` | OpenTelemetry 服务名 |
| `LOG_OTEL_LEVEL` | | `warning` | OpenTelemetry 日志上报级别 |

## Kubernetes 部署要求

### StorageClass

volume-manager 默认不显式设置 `storageClassName`（使用集群默认 StorageClass）；如需指定，可通过 `VM_K8S_PVC_STORAGE_CLASS` 覆盖。参考配置：

```yaml
apiVersion: storage.k8s.io/v1
kind: StorageClass
metadata:
  name: fastgpt-local
provisioner: rancher.io/local-path
reclaimPolicy: Delete
volumeBindingMode: WaitForFirstConsumer
```

关键特性说明：

- `reclaimPolicy: Delete`：PVC 删除时自动清理底层数据
- `volumeBindingMode: WaitForFirstConsumer`：延迟绑定，等待 Pod 调度后再绑定节点

也可使用集群现有的其他 StorageClass，需支持 `ReadWriteOnce` accessMode。

### RBAC 权限

volume-manager 需要在 `VM_K8S_NAMESPACE` 命名空间内操作 PVC，最小权限如下：

```yaml
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
rules:
  - apiGroups: [""]
    resources: ["persistentvolumeclaims"]
    verbs: ["get", "list", "create", "delete"]
```

volume-manager 使用集群内 ServiceAccount 认证，无需挂载外部 kubeconfig。

### 部署检查清单

- [ ] 命名空间 `opensandbox`（或自定义值）已存在
- [ ] 如配置 `VM_K8S_PVC_STORAGE_CLASS`，对应 StorageClass 已创建并可用
- [ ] ServiceAccount + Role + RoleBinding 已创建
- [ ] Secret 中包含有效的 `VM_AUTH_TOKEN`

## 项目结构

```text
src/
├── index.ts              # 入口，Hono + @hono/node-server 初始化、鉴权与优雅停机
├── env.ts                # 环境变量校验
├── routes/
│   └── volumes.ts        # /v1/volumes 路由（list / exists / ensure / delete）
├── drivers/
│   ├── IVolumeDriver.ts  # 驱动接口
│   ├── DockerVolumeDriver.ts
│   └── K8sVolumeDriver.ts
└── utils/
    ├── logger.ts         # @fastgpt-sdk/otel/logger 封装
    └── ownership.ts      # 托管所有权标签与 4.18.0 legacy 兼容校验
```

## 日志

统一使用 `@fastgpt-sdk/otel/logger` 输出结构化日志（按 `volume-manager:server`、`volume-manager:api`、`volume-manager:driver` 分类），通过 `LOG_ENABLE_CONSOLE` / `LOG_CONSOLE_LEVEL` / `LOG_ENABLE_OTEL` / `LOG_OTEL_*` 环境变量控制：

- `LOG_ENABLE_CONSOLE=false` — 关闭控制台日志输出
- `info`（默认）— 输出服务监听、卷创建/删除及请求异常
- `debug` — 额外输出只读查询与驱动层 HTTP 请求/响应状态
