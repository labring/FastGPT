# OpenSandbox Docker 沙盒安全审查与修复报告

审查日期：2026-05-23

## 文档定位

这是当前 OpenSandbox Docker 沙盒安全工作的唯一文档。原 TDD 方案已合并到本报告中，不再单独维护，避免“方案文档”和“审查报告”结论不一致。

当前范围只覆盖 Docker runtime，不覆盖 Kubernetes/Helm。Kubernetes 的 RBAC、ServiceAccount、PodSecurity、NetworkPolicy、Pool/BatchSandbox 需要后续单独审查。

## 当前真实状态

已经落地到代码的修复：

- OpenSandbox provider 配置要求 `apiKey` 非空。
- SDK adapter 支持并透传 `networkPolicy`、`extensions`、`resourceLimits`、`timeoutSeconds`。
- FastGPT OpenSandbox Docker runtime 默认注入宿主机别名 deny policy。
- OpenSandbox workDirectory 和 volume mountPath 固定为 `/workspace`，不再暴露挂载路径配置。
- shell tool 服务端限制 timeout 为 1 到 600 秒。
- agent sandbox 镜像改为非 root 用户 `sandbox` 运行，并确保 `/workspace` 可写。
- SDK 文件 API 不保留危险路径黑名单，报告明确它不是安全边界。
- 增加了单元测试、集成测试和真实 OpenSandbox Docker 安全集成测试。

已经撤销、当前没有落地的修复：

- Docker compose YAML 的安全部署改动已按要求撤销。
- 当前部署 YAML 尚未强制 `SANDBOX_API_KEY`。
- 当前部署 YAML 尚未强制 OpenSandbox-created sandbox 使用 Docker `bridge`。
- 当前部署 YAML 尚未加入 OpenSandbox server / volume-manager 的 CPU、内存、PIDs 限制。
- 当前部署 YAML 尚未把 dev 的 OpenSandbox/volume-manager 宿主机端口收紧到 `127.0.0.1`。
- 当前部署 YAML 尚未启用 OpenSandbox egress `dns+nft`。

因此当前结论是：代码层安全修复已有一部分完成，但 Docker 部署层仍未闭环。部署层没有落地前，不能认为生产 Docker 沙盒已经完成安全部署。

## 威胁模型

按最坏情况假设：

- 攻击者可以影响模型生成的 shell 命令，或能触发 sandbox 的 `execute()`。
- sandbox 镜像内有 `curl`、`git`、`node`、`python3`、`bun` 等网络和脚本执行工具。
- sandbox 需要允许访问公网，这是产品需求。
- 攻击者会尝试访问 FastGPT 内部服务、宿主机端口、OpenSandbox 控制面、volume-manager、MongoDB、Redis、MinIO、PostgreSQL、Docker daemon、容器内密钥和系统路径。
- 攻击者会尝试通过长时间命令、大量进程、内存分配、磁盘写入造成 DoS。

核心安全目标：

- sandbox 容器不能直接进入 FastGPT 业务网络。
- sandbox 容器内不能放业务密钥、Docker socket 或控制面 token。
- OpenSandbox 控制面不能无鉴权调用。
- 单个 sandbox 和控制面都需要资源上限。
- 即使 `execute()` 存在，也不能因此读到宿主机、业务服务或安全密钥。

## 已修复内容

### 1. OpenSandbox API key 变为必填

修改点：

- `packages/service/core/ai/sandbox/provider/config.ts`
- `packages/service/test/core/ai/sandbox/provider/config.test.ts`

效果：

- FastGPT 构造 OpenSandbox provider 时，如果 `apiKey` 为空会直接抛配置错误。
- 这可以防止业务运行时以无鉴权 OpenSandbox 连接继续启动。

限制：

- 代码层已经强制，但当前 Docker compose YAML 已撤销相关改动。
- 部署层仍需要把 FastGPT `AGENT_SANDBOX_OPENSANDBOX_API_KEY` 和 OpenSandbox server `[server].api_key` 配成同一个强随机值。

### 2. SDK 透传 OpenSandbox 安全相关 create 配置

修改点：

- `sdk/sandbox-adapter/src/types/sandbox.ts`
- `sdk/sandbox-adapter/src/types/index.ts`
- `sdk/sandbox-adapter/src/adapters/OpenSandboxAdapter/type.ts`
- `sdk/sandbox-adapter/src/adapters/OpenSandboxAdapter/index.ts`
- `sdk/sandbox-adapter/tests/unit/adapters/OpenSandboxAdapter.test.ts`

效果：

- `SandboxCreateSpec` 支持 `networkPolicy`、`extensions`。
- `OpenSandboxAdapter.create()` 会把 `networkPolicy`、`extensions`、`resourceLimits` 传给 OpenSandbox SDK。
- `execute()`、`executeStream()`、`executeBackground()` 会把 `timeoutMs` 转成 OpenSandbox SDK 的 `timeoutSeconds`。

限制：

- 透传能力本身不等于强制隔离；仍需要 runtime profile 或调用方显式传入策略。

### 3. Docker runtime 默认拒绝常见宿主机别名

修改点：

- `packages/service/core/ai/sandbox/runtime/profile/opensandbox.ts`
- `packages/service/test/core/ai/sandbox/provider/config.test.ts`

当前策略：

```ts
defaultAction: 'allow'
deny: localhost, host.docker.internal, host.orb.internal, docker.orb.internal, gateway.orb.internal, proxyproxy.orb.internal, *.orb.internal, *.orb.local
```

效果：

- 保留任意公网访问。
- 默认拒绝常见宿主机别名，降低 sandbox 访问本机控制面的风险。

限制：

- 这个策略目前定义在 FastGPT service runtime profile 中。更合理的后续整理方式是：把通用常量或 factory 放到 `sdk/sandbox-adapter`，由 FastGPT runtime profile 显式启用，不让 SDK adapter 对所有使用方无条件注入。
- 当前 OpenSandbox SDK 的 network policy 主要是 FQDN/wildcard 规则，不能完整表达私网 CIDR deny。
- 这不能替代 Docker 网络隔离和 egress/firewall。

### 4. shell timeout 服务端校验和执行透传

修改点：

- `packages/service/core/ai/sandbox/toolCall/shell.tool.ts`
- `packages/service/test/core/ai/sandbox/toolCall/shell.tool.test.ts`
- `sdk/sandbox-adapter/src/adapters/OpenSandboxAdapter/index.ts`
- `sdk/sandbox-adapter/tests/unit/adapters/OpenSandboxAdapter.test.ts`
- `sdk/sandbox-adapter/tests/integration/OpenSandbox.test.ts`

效果：

- shell tool 的 `timeout` 只能是 1 到 600 秒。
- OpenSandbox SDK 命令执行收到 `timeoutSeconds`。
- 真实 OpenSandbox Docker 集成测试验证 `sleep 10` 在 1 秒 timeout 下被终止。

限制：

- timeout 只能限制单次命令运行时间，不能替代租户级并发、总 CPU 时间、总内存、总磁盘用量配额。

### 5. agent sandbox 镜像非 root

修改点：

- `projects/agent-sandbox/Dockerfile`
- `projects/agent-sandbox/entrypoint.sh`
- `sdk/sandbox-adapter/tests/integration/OpenSandbox.test.ts`

效果：

- 镜像创建固定 UID `10001` 的 `sandbox` 用户。
- `/home/sandbox` 和 `/workspace` 归 `sandbox` 所有。
- 镜像最终 `USER sandbox`。
- entrypoint 检查工作目录可写，并清理 `FASTGPT_SESSION_ID`、`FASTGPT_WORKDIR`。
- 真实 Docker build/run 和 OpenSandbox 集成测试均验证非 root 与 workspace 可写。

限制：

- 非 root 不是完整容器逃逸防护。
- 旧镜像不会自动安全，生产必须重新 build/push 并更新 image tag。

### 6. OpenSandbox 工作目录固定为 SDK 默认根路径

修改点：

- `sdk/sandbox-adapter/src/constants.ts`
- `sdk/sandbox-adapter/src/index.ts`
- `sdk/sandbox-adapter/src/adapters/OpenSandboxAdapter/index.ts`
- `packages/service/core/ai/sandbox/runtime/profile/opensandbox.ts`
- `packages/service/core/ai/sandbox/volume/config.ts`
- `packages/service/core/ai/sandbox/volume/service.ts`
- `document/content/self-host/config/env.mdx`
- `document/content/self-host/config/env.en.mdx`

效果：

- SDK 导出 `OPEN_SANDBOX_DEFAULT_ROOT_PATH = '/workspace'` 作为唯一默认根路径。
- OpenSandbox runtime 的 `workDirectory` 使用 SDK 导出的默认根路径。
- volume-manager 生成的 volume mountPath 使用 SDK 导出的默认根路径。
- SDK OpenSandbox adapter 没有 volume 时的 `rootPath` fallback 也使用同一个默认根路径。
- 移除 `AGENT_SANDBOX_VOLUME_MANAGER_MOUNT_PATH` 环境变量，避免部署配置和镜像契约不一致。

限制：

- 固定 `/workspace` 是一致性和误配置收敛，不是安全边界。
- `/home/sandbox` 仍是用户 home 和 entrypoint 所在目录，不作为持久化工作区。

### 7. 文件 API 黑名单不作为安全边界

结论：

- 不在 SDK 或业务层保留危险路径黑名单。
- 绝对路径兼容保留，用于 `/tmp`、语言工具链输出、调试产物等合法场景。

原因：

- 只要有 `execute()`，攻击者就可以通过 shell、Python、Node 等读取容器内可见路径。
- 文件 API 黑名单挡不住 `cat /etc/passwd` 这类命令执行路径。
- 字符串前缀黑名单容易被 symlink、bind mount、运行时新增路径绕过，容易形成错误安全感。

真正边界：

- sandbox 容器内不放业务密钥。
- sandbox 不挂 Docker socket。
- sandbox 不加入业务网络。
- 用非 root、capability drop、no-new-privileges、egress、资源限制收敛风险。

## 测试现状

已通过的测试：

```bash
pnpm -C packages/service exec vitest run test/core/ai/sandbox/runtime/profile.test.ts test/core/ai/sandbox/volume/config.test.ts test/core/ai/sandbox/volume/service.test.ts test/core/ai/sandbox/provider/config.test.ts
```

```bash
pnpm -C sdk/sandbox-adapter exec vitest run tests/unit/adapters/BaseSandboxAdapter.test.ts tests/unit/adapters/OpenSandboxAdapter.test.ts
```

```bash
pnpm -C sdk/sandbox-adapter build
```

```bash
docker build -t fastgpt-agent-sandbox:codex-security-test projects/agent-sandbox
docker run --rm --entrypoint bash fastgpt-agent-sandbox:codex-security-test -lc 'test "$(id -u)" != "0" && test "$(id -un)" = "sandbox" && test -w /home/sandbox && test -w /workspace'
```

```bash
OPENSANDBOX_BASE_URL=http://127.0.0.1:8090 \
OPENSANDBOX_API_KEY=<redacted> \
OPENSANDBOX_RUNTIME=docker \
OPENSANDBOX_IMAGE_REPOSITORY=fastgpt-agent-sandbox \
OPENSANDBOX_IMAGE_TAG=codex-security-test \
OPENSANDBOX_INTEGRATION_CONTAINER_SECURITY=true \
OPENSANDBOX_INTEGRATION_RESOURCE_LIMITS=true \
OPENSANDBOX_INTEGRATION_NETWORK_ISOLATION=true \
pnpm -C sdk/sandbox-adapter exec vitest run tests/integration/OpenSandbox.test.ts -t "Security Runtime Tests"
```

真实集成测试已验证：

- sandbox 非 root 且 workspace 可写。
- OpenSandbox 命令 timeout 生效。
- Docker cgroup memory limit 生效。
- 在本机测试环境下，公网可访问，宿主机别名和 Docker gateway 的 OpenSandbox 端口不可访问。

当前不应运行或不应视为通过的测试：

- `packages/service/test/core/ai/sandbox/deploySecurity.test.ts`

原因：

- 该测试断言的是“部署 YAML 已加固”的目标状态。
- 用户已要求撤销 YAML 修改，因此该测试目前代表待完成安全目标，而不是当前已落地行为。
- 后续如果继续不改 YAML，应删除或跳过该测试；如果恢复部署加固，则保留并让它重新通过。

## 可能还存在的问题

### P0：Docker compose 部署层安全没有落地

现状：

- YAML 改动已撤销。
- 当前部署文件没有强制 `SANDBOX_API_KEY`。
- 当前部署文件没有强制 OpenSandbox server `[server].api_key`。
- 当前部署文件没有把 sandbox `network_mode` 改为 `bridge`。
- 当前部署文件没有启用 egress `dns+nft`。
- 当前部署文件没有给 OpenSandbox server / volume-manager 加资源限制。
- 当前 dev 部署可能仍把 OpenSandbox/volume-manager 端口暴露在非 loopback 地址。

风险：

- 如果按当前 YAML 部署，仍可能出现无鉴权控制面、业务网络横向访问、本机端口可达、控制面资源耗尽等问题。

建议：

- 在准备部署安全版本时恢复 compose 加固。
- 加固后重新运行 `node deploy/init.mjs`，并确保 `deploy/docker` 与 `document/public/deploy/docker` 同步。

### P0：OpenSandbox server 挂载 Docker socket

现状：

- Docker runtime 下 OpenSandbox server 必须挂载 `/var/run/docker.sock` 创建和管理 sandbox。

风险：

- Docker socket 基本等价于宿主机 Docker daemon 控制能力。
- 如果 OpenSandbox server 暴露给不可信网络，风险接近宿主机级别。

建议：

- OpenSandbox server 永远不要暴露公网。
- 必须配置强 API key。
- sandbox 容器不能加入 OpenSandbox server 所在网络。
- 宿主机防火墙限制 OpenSandbox server 访问面。

### P0：volume-manager 的 Docker socket 风险仍存在

现状：

- volume-manager 需要管理 Docker volume。
- 即使 socket 挂载写成 `:ro`，这也不是 Docker API 权限边界。

风险：

- 如果 volume-manager API 被 sandbox 或非可信网络访问，仍可能成为 Docker API 攻击入口。

建议：

- volume-manager 不暴露公网。
- 使用强 `VM_AUTH_TOKEN`。
- sandbox 网络不可达 volume-manager。
- 把 `:ro` 只当作文件挂载卫生措施，不要当作安全隔离。

### P1：禁止内网 IP 段尚未完整表达

现状：

- 当前默认 policy 拒绝常见宿主机域名和 OrbStack 域名。
- 仍允许任意公网。

风险：

- 如果宿主机可以路由到 `10.0.0.0/8`、`172.16.0.0/12`、`192.168.0.0/16`、link-local、metadata IP，单靠 FQDN deny 不能完整禁止。

建议：

- 需要 OpenSandbox egress/firewall 支持 CIDR deny。
- 至少拒绝 loopback、link-local、RFC1918、Docker bridge、host gateway、云厂商 metadata IP。

### P1：runtime 默认网络策略应迁到 SDK 导出

现状：

- `OPEN_SANDBOX_DOCKER_LOCAL_NETWORK_POLICY` 目前在 FastGPT service runtime profile。

风险：

- 安全默认值散落在业务层，不利于 SDK 复用。

建议：

- 在 `sdk/sandbox-adapter` 导出默认策略或 factory。
- FastGPT runtime profile 显式引用并启用。
- 不要让 SDK adapter 在所有场景无条件注入，避免破坏 SDK 使用方访问 localhost 的预期。

### P1：部署文档和 YAML 当前不一致

现状：

- `.mdx` 文档仍描述 OpenSandbox API key 必填。
- YAML 改动已经撤销。

风险：

- 用户按文档以为 compose 已强制 key，但实际 YAML 可能没有强制。

建议：

- 如果短期不改 YAML，应调整 `.mdx`，说明需要手动配置 OpenSandbox server api_key。
- 如果准备恢复安全部署，则保留文档并恢复 YAML。

### P1：资源限制还缺全局配额

现状：

- 单次命令 timeout 已生效。
- 单 sandbox memory limit 可通过 OpenSandbox resourceLimits 生效。

风险：

- 缺租户级 sandbox 数量限制、并发执行限制、累计 CPU/内存/磁盘配额。
- 磁盘写满和大量 sandbox 创建仍可能造成 DoS。

建议：

- 增加 team/user 维度的 sandbox 数量和并发上限。
- 增加 volume/disk 配额和清理策略。
- 对 OpenSandbox create/execute 做速率限制。

### P1：生产镜像供应链仍需加强

现状：

- `projects/agent-sandbox/Dockerfile` 通过 NodeSource 和 Bun 外部安装脚本安装运行时。

风险：

- 供应链 pinning 不充分。

建议：

- 固定基础镜像 digest。
- 固定 Node/Bun 版本和校验。
- 发布前做镜像漏洞扫描、SBOM、签名。

### P2：Kubernetes 未审查

现状：

- 本轮只处理 Docker runtime。

风险：

- Kubernetes 下可能存在 ServiceAccount token、RBAC、PodSecurity、NetworkPolicy、Pool 资源限制等独立风险。

建议：

- 单独做 Kubernetes/Helm 安全审查。
- 检查 sandbox Pod 默认不挂载 SA token。
- 检查 Pod securityContext、capabilities、runAsNonRoot、seccomp。
- 检查 NetworkPolicy 和资源 requests/limits。

## 后续部署方案

等确认可以恢复 YAML 安全部署后，建议一次性落地以下配置：

1. 生成强随机 key：

```bash
export SANDBOX_API_KEY="$(openssl rand -hex 32)"
```

2. FastGPT 和 OpenSandbox server 使用同一个 key：

```yaml
AGENT_SANDBOX_OPENSANDBOX_API_KEY: ${SANDBOX_API_KEY:?Set SANDBOX_API_KEY before docker compose up}
```

```toml
[server]
api_key = "${SANDBOX_API_KEY:?Set SANDBOX_API_KEY before docker compose up}"
```

3. OpenSandbox Docker runtime 不加入业务网络：

```toml
[docker]
network_mode = "bridge"
drop_capabilities = ["AUDIT_WRITE", "MKNOD", "NET_ADMIN", "NET_RAW", "SYS_ADMIN", "SYS_MODULE", "SYS_PTRACE", "SYS_TIME", "SYS_TTY_CONFIG"]
no_new_privileges = true
pids_limit = 512
```

4. egress 开启策略执行：

```toml
[egress]
mode = "dns+nft"
```

5. 控制面设置资源限制：

```yaml
opensandbox-server:
  mem_limit: 1g
  cpus: '1.0'
  pids_limit: 512

fastgpt-volume-manager:
  mem_limit: 512m
  cpus: '0.5'
  pids_limit: 256
```

6. 开发环境端口只绑定 loopback：

```yaml
ports:
  - 127.0.0.1:8090:8090
  - 127.0.0.1:3005:3000
```

7. 重新构建并发布 agent sandbox 镜像：

```bash
docker build -t <registry>/fastgpt-agent-sandbox:<tag> projects/agent-sandbox
docker push <registry>/fastgpt-agent-sandbox:<tag>
```

8. 重新生成部署产物：

```bash
cd deploy
node init.mjs
```

9. 部署后验证：

```bash
SANDBOX_API_KEY=test-key docker compose -f deploy/docker/cn/docker-compose.pg.yml config --quiet
pnpm -C packages/service exec vitest run test/core/ai/sandbox/deploySecurity.test.ts
```

真实 OpenSandbox Docker 安全集成验证：

```bash
OPENSANDBOX_BASE_URL=<opensandbox-url> \
OPENSANDBOX_API_KEY=<sandbox-api-key> \
OPENSANDBOX_RUNTIME=docker \
OPENSANDBOX_IMAGE_REPOSITORY=<agent-sandbox-image-repo> \
OPENSANDBOX_IMAGE_TAG=<agent-sandbox-image-tag> \
OPENSANDBOX_INTEGRATION_CONTAINER_SECURITY=true \
OPENSANDBOX_INTEGRATION_RESOURCE_LIMITS=true \
OPENSANDBOX_INTEGRATION_NETWORK_ISOLATION=true \
pnpm -C sdk/sandbox-adapter exec vitest run tests/integration/OpenSandbox.test.ts -t "Security Runtime Tests"
```
