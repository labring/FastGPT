---
case_version: 1
id: "FG-INFRA-RUNTIME-003"
title: "OpenSandbox 生命周期状态机、Volume-Manager 卷控制面与异常恢复/孤儿卷 GC"
business: "infra/runtime"
types:
  - "api"
  - "integration"
category: "basic"
scenario: "special"
priority: "P0"
status: "ready"
automation:
  - runner: node
    script: .agents/test/infra/runtime/FG-INFRA-RUNTIME-003.mjs
    items: [C1, C2, C3, C4, C5]
tags:
  - "sandbox"
  - "opensandbox"
  - "volume-manager"
  - "lifecycle"
  - "gc"
  - "覆盖基础场景"
  - "覆盖异常场景"
  - "覆盖边界场景"
evidence:
  - "response"
  - "database"
  - "storage"
sources:
  - "packages/service/core/ai/sandbox/application/lifecycle/service.ts"
  - "packages/service/core/ai/sandbox/application/resource.ts"
  - "packages/service/core/ai/sandbox/infrastructure/volume/service.ts"
  - "packages/service/core/ai/sandbox/application/runtime/service.ts"
routes:
  - "POST /api/core/ai/sandbox/upload"
  - "POST /api/core/ai/sandbox/download"
  - "POST /api/core/ai/sandbox/fs/list"
related:
  - "FG-INFRA-RUNTIME-002"
baseline: "116dda3bc40b712a866899037ca3c74da3587091"
---

# OpenSandbox 生命周期状态机、Volume-Manager 卷控制面与异常恢复/孤儿卷 GC

## 用例简介

验证 OpenSandbox + Volume-Manager（JuiceFS FUSE 持久卷）架构下的 5 态生命周期（`provisioning / running / stopping / stopped / deleting`）、三阶段删除游标（`claimed -> providerDeleted -> volumeDeleted`）、原地镜像升级、废弃的 `/api/core/ai/skill/runtime/{getStatus,upgrade}` 下线（404），以及超时 `provisioning` 自动回滚、孤儿卷两阶段 Redis 宽限期 GC 和宿主资源删除时的级联清理。

## 前置准备

- 本地启动 FastGPT App (`127.0.0.1:3000`)、Volume-Manager (`127.0.0.1:3005`)、OpenSandbox Server (`127.0.0.1:8090`)、MongoDB、Redis、沙箱 PostgreSQL 与 MinIO。
- 复用 `appKeyWorld` 创建独立测试应用 `W` 并开启 Agent 沙箱能力，测试结束后通过 `cascade-delete-source` 与应用删除完整回收所有容器、持久卷与数据库记录。

## 测试步骤

| 子场景 | 类型与起始状态 | 输入与操作 |
| --- | --- | --- |
| C1 | 基础；无测试卷 | 调用 Volume-Manager 执行首次 `ensure`、重复幂等 `ensure`、`list` 查询、`unmount` 卸载与 `remove` 物理删除。 |
| C2 | 状态机；独立会话 | 在沙箱写入 `lifecycle.txt` 后执行 `stopSandboxResource` 停止容器，再通过 `download` 自动唤醒恢复；随后执行 `deleteSandboxResource` 彻底删除并再次写入重建。 |
| C3 | 升级与兼容；运行中沙箱 | 将实例 `image` 篡改为旧镜像后触发 `getSandboxClient(query, { onUpgrade })` 单次原地升级；同时请求已废弃的 `/api/core/ai/skill/runtime/getStatus` 与 `/api/core/ai/skill/runtime/upgrade`。 |
| C4 | 异常恢复与 GC；运行中沙箱 | 将实例置为超时 `provisioning` 并运行 `retryStaleSandboxActivations`；创建无 Mongo 引用的孤儿卷，先执行一次 `reconcileOrphanSandboxVolumes`，再将 Redis 打标时间回拨 35 分钟后执行第二次扫描。 |
| C5 | 级联清理；存在活跃沙箱 | 调用 `deleteSandboxResourcesBySource({ sourceType: 'app', sourceId: W })` 触发按宿主应用级联销毁。 |

## 预期结果

| 子场景 | 特有预期 | 证据 |
| --- | --- | --- |
| C1 | 首次 `ensure` 返回 `201 Created`，二次 `ensure` 返回 `200 OK`；删除前在 `list` 中存在，删除后从 `list` 消失。 | Volume-Manager 响应与列表快照。 |
| C2 | `stop -> resume` 后 `generationId` 与 `claimName` 不变且原文件完整读出；`delete -> recreate` 后生成全新 `generationId`，旧文件不再复活。 | 实例状态、generationId 与文件列表。 |
| C3 | 原地升级后容器重建、`image` 更新为最新配置、`claimName` 与卷内文件保留；两个废弃接口均返回 HTTP `404`。 | 升级前后实例记录、文件内容与 404 响应。 |
| C4 | 超时 `provisioning` 回滚为 `stopped`；孤儿卷首次扫描仅写入 Redis 打标并保留卷，超过 30 分钟宽限期二次扫描物理删除。 | 实例状态、Redis 标记与卷列表变化。 |
| C5 | 级联清理后 `agent_sandbox_instances_v3` 中该 `sourceId` 记录数为 `0`，持久卷同步删除。 | Mongo 计数与清理结果。 |
