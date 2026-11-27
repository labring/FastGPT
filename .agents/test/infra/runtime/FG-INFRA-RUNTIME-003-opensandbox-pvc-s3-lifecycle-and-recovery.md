---
case_version: 1
id: "FG-INFRA-RUNTIME-003"
title: "OpenSandbox PVC 与 S3 归档生命周期、异常恢复及孤儿卷清理"
business: "infra/runtime"
types: [integration, api]
category: boundary
scenario: special
priority: P0
status: ready
tags: [opensandbox, volume-manager, s3, kubernetes, docker, boundary, abnormal]
evidence: [response, database, cache, storage]
sources:
  - packages/service/core/ai/sandbox/infrastructure/opensandbox/opensandbox.ts
  - packages/service/core/ai/sandbox/infrastructure/volume/service.ts
  - packages/service/core/ai/sandbox/infrastructure/instance/repository.ts
  - packages/service/core/ai/sandbox/application/archive.ts
  - packages/service/core/ai/sandbox/application/lifecycle/runner.ts
  - packages/service/core/ai/sandbox/application/lifecycle/service.ts
  - packages/service/core/ai/sandbox/application/resource.ts
  - packages/service/core/ai/sandbox/application/runtime/client.ts
  - packages/service/core/ai/sandbox/application/runtime/service.ts
  - packages/service/core/ai/sandbox/legacy/index.ts
  - packages/service/core/ai/sandbox/config.ts
  - packages/service/common/s3/sources/sandbox/index.ts
  - projects/volume-manager/src/drivers/DockerVolumeDriver.ts
  - projects/volume-manager/src/drivers/K8sVolumeDriver.ts
  - projects/app/src/pages/api/core/ai/sandbox/checkExist.ts
  - projects/app/src/pages/api/core/ai/sandbox/getTicket.ts
  - packages/service/test/integrations/sandbox/opensandbox-pvc-s3.integration.test.ts
  - packages/service/test/integrations/sandbox/opensandbox-k8s.integration.test.ts
routes:
  - "/api/core/ai/sandbox/checkExist"
  - "/api/core/ai/sandbox/getTicket"
related:
  - "FG-INFRA-RUNTIME-001"
  - "FG-INFRA-RUNTIME-004"
  - "FG-SKILL-DEBUGGING-001"
automation: []
baseline: "0552d2a20d40265ae851dba2d2d4bee882c516a3"
---

# OpenSandbox PVC 与 S3 归档生命周期、异常恢复及孤儿卷清理

## 用例简介

验证 OpenSandbox 在 Docker 与 Kubernetes (`uid=10001`、`RWO` PVC) 双运行时下的热卷创建、`sandbox/archive-v2/` `.tar.zst` S3 归档与冷恢复、失败回滚与冷却窗口、陈旧状态自愈、未纳管卷拒绝接管以及两阶段孤儿卷垃圾回收，并验证遗留 `agent_sandbox_instances_v2` 未迁移记录在业务接口上的向后兼容拒绝语义及 `v3` 运行期物理删除不改写 `v2` 的边界。

## 前置准备

- 环境与版本：本地 FastGPT 服务（`BASE_URL`）已在 `system_instance_configs` 中启用 Agent Sandbox（`subservice.agentSandbox.enabled = true`，并配置 `subservice.agentSandbox.opensandbox.*` 与 `subservice.agentSandbox.proxy.*`），分别连通 Docker OpenSandbox Server 与 `volume-manager`（`DockerVolumeDriver`）、或 K8s OpenSandbox Server 与 `volume-manager`（`K8sVolumeDriver`，非特权 `uid=10001`、RWO 存储类），并连通 S3、MongoDB、Redis。
- 关联 Vitest 套件：服务层真实基础设施自动化验证位于 `packages/service/test/integrations/sandbox/opensandbox-pvc-s3.integration.test.ts` 与 `packages/service/test/integrations/sandbox/opensandbox-k8s.integration.test.ts`（运行说明见 `.agents/design/core/ai/sandbox/integration-testing.md`）；frontmatter `automation` 保持 `[]`（`test:cases` 仅关联 `.agents/test/` 下的 `.mjs`/`.browser.spec.ts` 脚本）。
- 身份与权限：使用独立测试账号与测试 `teamId`，准备已发布的启用沙箱简单应用与测试 Skill，以及 `volume-manager` 鉴权 Bearer Token（占位符 `$VM_TOKEN`）。
- 测试数据：按本次 `runId` 构造唯一 `sandboxId`、`claimName` 与测试目录，预置测试前 MongoDB `agent_sandbox_instances_v3`（及 C7 兼容测试所需的 `agent_sandbox_instances_v2` 夹具与 `system_migration_states` 状态）、S3 对象（`sandbox/archive-v2/` 与 C7 遗留 `sandbox/archive/`）、Redis key（`agent-sandbox:orphan-volume:*`）及宿主机 Docker Volume / K8s PVC 快照。
- 复位约定：C1～C7 围绕同一套配置依次推进或各自在独立 `sandboxId` 上执行；涉及 `volume-manager` 鉴权/归属校验与 `Terminating` PVC 的子场景使用独立测试卷名并在结束后立即清理；涉及损坏 S3 归档恢复的用例在修复 S3 对象后重试。
- 验证能力：HTTP API 调用、`volume-manager` 接口响应、`agent_sandbox_instances_v3`（及 `v2`、`system_migration_states` 只读对照）集合只读查询、S3 `sandbox/archive-v2/` `.tar.zst` 对象检查、Redis `agent-sandbox:orphan-volume:*` 键检查、Docker Volume 与 K8s PVC/BatchSandbox 只读查询。
- 关联标识：以每次测试的 `runId`、`sandboxId`、`claimName` 和 `instanceId` 关联检索。
- 清理方式：测试结束后调用应用/Skill/OpenSandbox/Volume 删除接口清除测试资源，并校验 Docker 无残留测试容器与卷、K8s 命名空间无残留测试 PVC/BatchSandbox。

## 测试步骤

| 子场景 | 类型与起始状态 | 输入与操作 |
| --- | --- | --- |
| C1 | 异常/边界场景；独立测试卷名 | 向 `volume-manager` 发送缺少/错误 Bearer Token、非法 `claimName`（如含大写或非法字符）的请求；另预先创建一个不含 `fastgpt-volume-manager` 归属标签的 Docker Volume 或 K8s PVC，再向 `volume-manager` 请求接管/扩容或删除。 |
| C2 | 边界场景；K8s 运行时、独立 PVC 名称 | 在 K8s PVC 上挂载临时 Finalizer 后发起删除使 PVC 处于 `Terminating` 状态；在此期间调用 `volume-manager` 的列表查询与同 `claimName` 的创建请求，随后移除 Finalizer 再次请求创建。 |
| C3 | 异常恢复场景；已有有效 S3 `sandbox/archive-v2/` `.tar.zst` 归档，但人为替换为损坏数据 | 1）写入有效工作区并归档至 S3 后删除本地热卷，将 S3 中对应 `.tar.zst` 替换为损坏内容后触发冷恢复，核对数据面 `/archive/extract` 确定性失败后的即时回滚与 `retryAfter = now`（0ms 冷却）语义，随后还原有效 `.tar.zst` 并立即重试恢复；2）对照模拟控制面传输未决异常（`isUncertainControlPlaneError`），验证 `retryAfter` 写入阶段冷却窗口（在途创建阶段如 `restoring:volumeAssigned` 为 `240s`，其余阶段为 `60s`；注：`15s` 仅为活跃操作持久化心跳刷新间隔，非失败隔离窗口）。 |
| C4 | 异常边界场景；分别构造陈旧 `archiving` 与 `deleting`/`stopping` 文档 | 子态 a：写入超时陈旧的 `archiving`（`claimed` 阶段但 S3 未上传），触发重新抢占或恢复；子态 b：写入已进入 `archiveUploaded` 且 S3 存在归档的陈旧 `archiving` 文档触发恢复；子态 c：触发删除后，检查停止/删除隔离窗口内与超时陈旧 `deleting` 状态下的再次操作与收敛。 |
| C5 | 边界场景；容器孤儿与两阶段 Redis 孤儿回收（含非受管前缀卷屏蔽） | 子态 a：制造存在超过 `10m` 且无有效活动引用的容器实例触发清理；子态 b：制造存在超过 `30m` 的无人认领受管热卷及非 `volumeNamePrefix` 前缀卷，连续触发两次孤儿卷扫描（第一次写入 `agent-sandbox:orphan-volume:*` 标记，第二次在宽限期过后删除）。 |
| C6 | 边界/异常场景；配额限制与同 PVC 静默换镜像 | 将团队/系统沙箱配额调至临界值触发超限拒绝；另在实例处于 `running`/`stopped` 时修改 `system_instance_configs` 中的 `subservice.agentSandbox.opensandbox.image`（目标镜像配置变更）并再次激活沙箱，触发 `runtime/service.ts` 中的同 PVC 静默换镜像流程，并模拟新镜像容器启动失败以检查原热卷保留情况。 |
| C7 | 兼容边界场景；覆盖 `agent_sandbox_instances_v2` 未迁移记录门禁与 `v3` 运行期物理删除隔离 | 1）确认 `system_migration_states` 中 `_id: '20261117_migrate_sandbox_to_opensandbox'` 不为 `succeeded`，在 `agent_sandbox_instances_v2` 预置任意非 `deleting` 状态记录（如 `running`、`stopped` 或 `archived`，`hasPendingLegacySandboxInstance` 不按 `provider`/`format`/`mountPath` 过滤）且 `agent_sandbox_instances_v3` 中无对应记录，调用 `checkExist` / `getTicket`；对照验证 `v2` 记录为 `deleting` 或迁移任务已 `succeeded` 时门禁放行；2）为同一应用/沙盒在 `agent_sandbox_instances_v3` 写入已迁移活动记录（写入 `sandbox/archive-v2/<sandboxId>/` 归档）并同时在 `agent_sandbox_instances_v2` 与 S3 `sandbox/archive/<sandboxId>/package.zip` 保留历史基线后，执行 `v3` 运行期删除（应用/Skill 删除或资源删除）。 |

## 预期结果

公共断言：所有非预期接管的旧卷不得被删除或修改；双运行时所有清理完成后，MongoDB、S3、Redis 及 Docker/K8s 无本次 `runId` 关联残留。

| 子场景 | 验证方式 | 特有预期 | 证据获取方式 |
| --- | --- | --- | --- |
| C1 | 响应、存储查询 | 鉴权失败返回 `401`；非法 `claimName` 返回 `400`；未带归属标签的 Docker Volume 拒绝接管（`Refusing to adopt`），K8s PVC 拒绝纳管（`Refusing to manage K8s PVC`）并保持原卷完整。 | 检查 `volume-manager` HTTP 状态码与错误信息，确认宿主机原卷/PVC 仍存在。 |
| C2 | 响应、K8s 状态查询 | PVC 处于 `Terminating` 期间 `list` 不再将其视作有效可用卷，同名 `ensure` 阻塞等待原 PVC UID 完全消失后才重建新 PVC（新旧 PVC UID 不同）。 | 对比清理 Finalizer 前后的 `ensure` 耗时/返回与 `kubectl get pvc -o jsonpath='{.metadata.uid}'`。 |
| C3 | 数据库、响应、K8s/Docker 存储 | 损坏 `.tar.zst` 导致 `/archive/extract` 确定性失败时，写入 `retryAfter = now`（0ms）并在同一租约内立即回滚清理新建的临时容器与热 PVC、状态退回 `archived` 且保留 S3 归档；还原有效 `.tar.zst` 后无需额外等待即可冷恢复成功并完整恢复工作区文件。对照控制面传输未决异常时，`operation.retryAfter` 写入 `240s`（在途创建阶段）或 `60s`（其余阶段）并在冷却窗口内阻断并发接管。 | 查询 `agent_sandbox_instances_v3` 状态、`operation.retryAfter`、K8s PVC/Docker Volume 及容器内恢复文件。 |
| C4 | 数据库、S3、响应 | 陈旧 `claimed` 在未上传前允许按约定接管或重新执行；`archiveUploaded` 且 S3 对象存在时不重复覆盖有效归档而直接完成收敛；删除隔离窗口内阻止并发拉起，超时陈旧 `deleting` 在后续周期收敛清除。 | 对比 S3 对象 ETag/`LastModified`、MongoDB 文档状态流转与 API 错误码。 |
| C5 | 缓存、容器/卷状态 | 超 `10m` 孤儿容器被回收；两阶段 GC 仅对符合 `volumeNamePrefix` 的受管超 `30m` 孤儿卷先写 Redis `agent-sandbox:orphan-volume:*` 标记再在二轮确认后删除，非受管前缀卷被跳过、既不写标记也不误删。 | 检查 Redis `KEYS agent-sandbox:orphan-volume:*` 两次扫描变化及 Docker/K8s 卷存在性。 |
| C6 | 响应、数据库、存储 | 达到团队/系统实例上限时创建拒绝（对应配额错误码）；同 PVC 静默换镜像先停旧容器（释放 RWO 卷、不走 S3 归档）再以新镜像原位重拉，若新容器启动失败则保留既有热 PVC 数据不丢失，不进入静默清空状态，恢复有效镜像后原文件仍可访问且数据库 `image` 字段更新为新镜像。 | 检查 API 返回错误、原 PVC/Docker Volume 中测试文件与数据库 `image` 字段。 |
| C7 | 响应、数据库、存储 | 迁移任务 `20261117_migrate_sandbox_to_opensandbox` 未 `succeeded` 且 `agent_sandbox_instances_v2` 存在任意非 `deleting` 记录时，`checkExist` 返回 `exists: false`、`getTicket` 以 `409` / `agentSandboxMigrationInProgress` 拒绝；`v2` 为 `deleting` 或迁移任务已 `succeeded` 时放行。运行期删除 `agent_sandbox_instances_v3` 记录时完整清理 OpenSandbox 容器/PVC/`sandbox/archive-v2/` 归档并物理删除 `v3` 文档，不写入 `legacyDevboxPendingCleanup` 或 `generation: 'deleted'` 墓碑，也不修改或删除 `agent_sandbox_instances_v2` 记录及遗留 `sandbox/archive/*/package.zip`。 | 检查接口 HTTP 状态与 JSON 响应体，并分别核对 `system_migration_states`、`agent_sandbox_instances_v3`（已物理删除）、`agent_sandbox_instances_v2`（原样保留）及 S3 `sandbox/archive-v2/` 与 `sandbox/archive/` 对象状态。 |
