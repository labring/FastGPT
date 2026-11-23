# Agent Sandbox 集成测试

状态：当前实现

最后核对：2026-11-23

## 1. 测试架构与环境配置

Agent Sandbox 集成测试统一收敛在 [`packages/service/test/integrations/sandbox/`](../../../../../packages/service/test/integrations/sandbox)，通过独立配置 [`packages/service/vitest.sandbox.integration.config.ts`](../../../../../packages/service/vitest.sandbox.integration.config.ts) 运行，不混入日常单元测试。

- **基础设施装配**：
  - `globalSetup.ts` 读取 `SANDBOX_INTEGRATION_MONGODB_URI`（缺省回退 `MONGODB_URI` 或本地副本集默认连接），为每个测试文件提供独立的 Mongo 副本集测试数据库隔离。
  - `setup.ts` 与 `config.ts` 从环境变量装配内存 `systemInstanceConfig`（`subservice.agentSandbox`）、真实 Redis 与 RustFS/S3 连接，无需手工启动主站 Web 进程。
  - `fixtures.ts` 提供单测例级的远端容器、持久卷、Mongo 记录与 S3 归档清理逻辑，确保并发或失败重跑后不残留脏资源。
- **开关与环境变量模板（`test/.env.example`）**：
  - 默认 `SANDBOX_INTEGRATION=false`；仅当显式设置 `SANDBOX_INTEGRATION=true` 时才激活执行真实容器/存储集成测试。
  - 相关连接与耗时断言阈值见仓库根目录 `test/.env.example`（包含 `SANDBOX_INTEGRATION_MONGODB_URI`、`SANDBOX_INTEGRATION_REDIS_URL`、`SANDBOX_INTEGRATION_TOOL_MAX_MS`、`SANDBOX_INTEGRATION_TIMEOUT_MAX_MS`、`SANDBOX_INTEGRATION_LIFECYCLE_MAX_MS`、`SANDBOX_INTEGRATION_CLEANUP_MAX_MS` 以及 `AGENT_SANDBOX_OPENSANDBOX_*`、`AGENT_SANDBOX_PROXY_*`）。

## 2. 执行方式

全量运行 Agent Sandbox 集成测试：

```bash
SANDBOX_INTEGRATION=true pnpm test:service:integration:sandbox
```

定向运行单个套件（示例）：

```bash
SANDBOX_INTEGRATION=true pnpm --dir packages/service exec vitest run \
  -c vitest.sandbox.integration.config.ts \
  test/integrations/sandbox/opensandbox-pvc-s3.integration.test.ts
```

Kubernetes 套件默认跳过，仅在同时满足以下条件时激活：

- `SANDBOX_INTEGRATION=true` 且 `AGENT_SANDBOX_OPENSANDBOX_RUNTIME=kubernetes`
- 配置 `SANDBOX_K8S_SSH_HOST`（经 SSH 调目标集群 `kubectl`）或 `SANDBOX_K8S_LOCAL_KUBECTL=true`
- 可选 `SANDBOX_K8S_NAMESPACE`（默认 `opensandbox`）

## 3. 测试套件说明

| 套件文件 | 适用范围 | 核心覆盖场景 |
| --- | --- | --- |
| `fastgpt.integration.test.ts` | 核心业务工具与生命周期故障恢复 | 8 个沙盒工具分发耗时、`sandbox_get_file_url` 真实 Redis 链接、非法 JSON/Schema/路径边界隔离（不污染 runtime）、App 软删拒执行、异常 `provisioning` 回滚、`restoring` 配额保持与 `/archive/extract` 失败同租约立即回滚、停机态保护、超期 `stopping`/`deleting` 状态接管与 S3 失败续删、同用户多 Chat 复用、APT 只读/可写源备份恢复 |
| `opensandbox-pvc-s3.integration.test.ts` | Docker + 原生卷 + RustFS `.tar.zst` + IDE Agent | `>5 MiB` `$HOME` 经 RustFS Multipart 归档（保留缓存/dotfiles/软链/PAX、容器 `/tmp` 零落盘、S3 `sandbox/archive-v2/` 旧 CoW 世代归档清理与遗留 `sandbox/archive/` 前缀隔离）、空 `$HOME` `204` 短路、`fastgpt-ide-agent` `0600` 口令校验与目录越界拦截、`running`/`stopped` 同卷原地镜像升级与 `aptMirror`、`volume-manager` 鉴权/所有权与两阶段孤儿卷/容器 GC、`agent_sandbox_instances_v2` 未迁移记录 409 拦截与 `agent_sandbox_instances_v3` 运行期物理删除（不写墓碑、不修改 `v2`）、Skill `.zip -> .tar.zst` 导入部署/导出及逃逸软链拒绝 |
| `opensandbox-k8s.integration.test.ts` | Kubernetes 真集群 | Pod limits 与超售 `resourceRequests`、下发省略 `ephemeral-storage`、PVC 挂载 `/home/sandbox` 与 `fsGroup=10001`、无 egress sidecar、local-path PV 跨停机/唤醒持久化与删 PVC 后冷恢复、`CiliumNetworkPolicy` 封堵内网/元数据 CIDR 并放行 CoreDNS、`K8sVolumeDriver` `Terminating` 等待/存量兼容及两阶段孤儿 PVC/Pod GC |
| `migration-4180.integration.test.ts` | 4.18.0 升级迁移与清理 | 真实 Mongo 副本集 + RustFS 下的第 7 步迁移（只读读取 `agent_sandbox_instances_v2`，将 `running`/`stopped` Devbox 静止化打包、历史 S3 `sandbox/archive/*/package.zip`（含空包/PAX/UTF-8/修剪规则）流式转码及旧 `/workspace` 卷打包写入 `agent_sandbox_instances_v3` 与 `sandbox/archive-v2/`，全程保留 `v2` 记录、远端 `pause` Devbox、旧持久卷与旧 `package.zip` 不动）与 Skill 包升级，并在 Docker OpenSandbox 基于 `v3` 冷恢复验收后执行第 8 步清理任务（删除远端 Devbox、旧 `/workspace` 卷、旧 `package.zip`、`v2` 集合及 `v3` 孤儿记录，跳过 `v3` 在用 PVC/容器）；覆盖部分失败写入 `failedRecords` 及幂等重试 |
| `skill-import.integration.test.ts` | Skill 导入编辑态初始化 | 导入未携带 `.gitignore` 的 Skill 包后首次进入 Skill Edit Sandbox 的工作区初始化验证 |
