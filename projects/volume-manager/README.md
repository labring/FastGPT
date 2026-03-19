# volume-manager

FastGPT Agent 沙箱存储卷管理服务。负责为每个 Agent 会话创建和销毁持久化存储卷，支持 Kubernetes PVC 和 Docker Volume 两种运行时。

## 技术栈

- **Runtime**: [Bun](https://bun.sh)
- **HTTP 框架**: [Hono](https://hono.dev)
- **参数校验**: [Zod](https://zod.dev)
- **测试**: [Vitest](https://vitest.dev)

## 快速开始

```bash
# 开发模式（热重载）
bun dev

# 构建
bun run build

# 生产启动
bun start

# 运行测试
bun test
```

## API

所有 `/v1/*` 路由需要在请求头中携带 `Authorization: Bearer <VM_AUTH_TOKEN>`。

### 健康检查

```
GET /health
```

响应：`{ "status": "ok" }`

### 确保存储卷存在

```
POST /v1/volumes/ensure
Content-Type: application/json

{ "sessionId": "<24位十六进制字符串>" }
```

- 卷已存在：返回 `200`，`{ "claimName": "...", "created": false }`
- 卷新建：返回 `201`，`{ "claimName": "...", "created": true }`

### 删除存储卷

```
DELETE /v1/volumes/:sessionId
```

响应：`204 No Content`（幂等，卷不存在时同样返回 204）

## 环境变量

| 变量 | 必填 | 默认值 | 说明 |
|------|------|--------|------|
| `VM_AUTH_TOKEN` | ✅ | - | API 鉴权 Token |
| `VM_RUNTIME` | | `kubernetes` | 运行时：`kubernetes` 或 `docker` |
| `VM_PORT` | | `3001` | 监听端口 |
| `VM_LOG_LEVEL` | | `info` | 日志级别：`debug` / `info` / `none` |
| `VM_VOLUME_NAME_PREFIX` | | `fastgpt-session` | 卷名前缀 |
| `VM_DOCKER_SOCKET` | | `/var/run/docker.sock` | Docker socket 路径（docker 模式） |
| `VM_K8S_NAMESPACE` | | `opensandbox` | PVC 所在命名空间（k8s 模式） |
| `VM_K8S_PVC_STORAGE_CLASS` | | `standard` | PVC StorageClass（k8s 模式） |
| `VM_K8S_PVC_STORAGE_SIZE` | | `1Gi` | PVC 容量（k8s 模式） |

## Kubernetes 部署要求

### StorageClass

volume-manager 默认使用 StorageClass `fastgpt-local`（可通过 `VM_K8S_PVC_STORAGE_CLASS` 覆盖）。参考配置：

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
- [ ] StorageClass `fastgpt-local`（或自定义值）已创建并可用
- [ ] ServiceAccount + Role + RoleBinding 已创建
- [ ] Secret 中包含有效的 `VM_AUTH_TOKEN`

## 项目结构

```
src/
├── index.ts              # 入口，HTTP 服务器初始化
├── env.ts                # 环境变量校验
├── routes/
│   └── volumes.ts        # /v1/volumes 路由
├── services/
│   └── VolumeService.ts  # 业务逻辑层
├── drivers/
│   ├── IVolumeDriver.ts  # 驱动接口
│   ├── DockerVolumeDriver.ts
│   └── K8sVolumeDriver.ts
└── utils/
    ├── naming.ts         # 卷名生成（sessionId → volume name）
    └── logger.ts         # 日志工具
```

## 日志

通过 `VM_LOG_LEVEL` 控制：

- `none` — 关闭所有业务日志
- `info` — 输出关键操作（请求进入、操作结果）
- `debug` — 输出详细信息（驱动层请求 URL、HTTP 响应状态）
