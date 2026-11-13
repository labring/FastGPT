---
case_version: 1
id: "FG-INFRA-RUNTIME-004"
title: "OpenSandbox 沙箱安全红线、零凭证泄露、FUSE 子目录隔离与入参防护"
business: "infra/runtime"
types:
  - "api"
  - "integration"
category: "boundary"
scenario: "failure"
priority: "P0"
status: "ready"
automation:
  - runner: node
    script: .agents/test/infra/runtime/FG-INFRA-RUNTIME-004.mjs
    items: [C1, C2, C3, C4, C5]
tags:
  - "sandbox"
  - "security"
  - "isolation"
  - "fuse"
  - "覆盖基础场景"
  - "覆盖异常场景"
  - "覆盖边界场景"
evidence:
  - "response"
  - "database"
sources:
  - "packages/service/core/ai/sandbox/application/file.ts"
  - "packages/service/core/ai/sandbox/infrastructure/volume/service.ts"
  - "projects/app/src/service/core/sandbox/access.ts"
  - "projects/app/src/pages/api/core/ai/sandbox/checkExist.ts"
routes:
  - "POST /api/core/ai/sandbox/checkExist"
  - "POST /api/core/ai/sandbox/fs/list"
  - "POST /api/core/ai/sandbox/fs/mkdir"
  - "POST /api/core/ai/sandbox/fs/move"
  - "POST /api/core/ai/sandbox/download"
  - "POST /api/core/ai/sandbox/upload"
  - "POST /api/core/ai/sandbox/fs/delete"
  - "POST /api/core/ai/sandbox/fs/exec"
related:
  - "FG-INFRA-RUNTIME-002"
  - "FG-INFRA-RUNTIME-003"
baseline: "116dda3bc40b712a866899037ca3c74da3587091"
---

# OpenSandbox 沙箱安全红线、零凭证泄露、FUSE 子目录隔离与入参防护

## 用例简介

验证 OpenSandbox 架构的 5 条核心安全红线：FUSE `--subdir` 子目录隔离防跨卷穿透、容器内零宿主数据库/对象存储凭证泄露与 `uid=10001(sandbox)` 非特权运行、跨用户/未授权成员沙箱访问拦截、服务端强派生 `sandboxId` 与 `../` 路径穿越拦截，以及 `checkExist` 产品门禁 `unavailableReason` 返回。

## 前置准备

- 本地启动 FastGPT App (`127.0.0.1:3000`)、Volume-Manager (`127.0.0.1:3005`)、OpenSandbox Server (`127.0.0.1:8090`)。
- 复用 `appKeyWorld` 创建独立测试应用 `W` 并开启 Agent 沙箱能力，构造外部用户 `uA`、`uB` 与无权限成员 `N`。

## 测试步骤

| 子场景 | 类型与起始状态 | 输入与操作 |
| --- | --- | --- |
| C1 | 边界隔离；uA 与 uB 独立会话 | uA 写入机密文件 `secret-a.txt`；uB 在自身沙箱执行 `ls -la /workspace/..` 并创建指向 `/workspace/..` 的软链接，尝试探测 uA 的 `claimName` 子目录。 |
| C2 | 安全基线；运行中沙箱 | 在沙箱内通过 `fs/exec` 执行 `id -u`、`id -un`、`env`、`/proc/1/environ` 与 `/proc/mounts` 检查。 |
| C3 | 权限隔离；uA 已写机密文件 | uB 携带 uA 的 `chatId` 请求 `download`；无应用权限的成员 `N` 请求该应用的 `fs/list`。 |
| C4 | 异常入参；uA 与 uB 独立会话 | uB 在 `download` 请求体中伪造注入 `sandboxId: instA.sandboxId`；uA 分别向 `upload`、`download`、`fs/mkdir`、`fs/move`、`fs/delete` 传入 `../../etc/passwd` 与 `.`、`/workspace`、`/` 根路径；创建指向目录的符号链接 `sym_dir -> real_dir` 并调用 `fs/delete` 删除 `sym_dir`。 |
| C5 | 门禁契约；运行中沙箱 | 开启套餐 `enableSandbox` 时调用 `checkExist`；随后关闭套餐 `enableSandbox: false` 再次调用 `checkExist`。 |

## 预期结果

| 子场景 | 特有预期 | 证据 |
| --- | --- | --- |
| C1 | uA 与 uB 绑定不同 `claimName`；`/workspace/..` 指向容器自身根目录，软链接逃逸无法读取 uA 的机密内容。 | `claimName` 映射与 `fs/exec` 输出。 |
| C2 | 运行身份严格为 `uid=10001(sandbox)`；环境变量与挂载信息不含 `META_URL`、`STORAGE_URL`、`ACCESS_KEY`、`SECRET_KEY`、`VOLUME_MANAGER_TOKEN`、`MONGODB_URI`。 | 进程 UID 与环境变量扫描结果。 |
| C3 | uB 跨会话读取与无权限成员 `N` 访问均被拒绝，不泄露 `secret-a.txt`。 | 权限拒绝响应。 |
| C4 | 服务端忽略客户端伪造的 `sandboxId`；所有 `../` 相对路径穿越与 `.`、`/workspace`、`/` 根路径误操作请求均返回错误拒绝；对指向目录的符号链接调用 `fs/delete` 仅解绑符号链接本身而不会递归删除被指向的真实目录及其内部文件。 | 错误响应、软链解绑与真实目录保留校验记录。 |
| C5 | 开启时返回 `{ exists: true }` 且无 `unavailableReason`；关闭套餐沙箱能力后返回结构化 `unavailableReason` 且运行时接口拒绝访问。 | `checkExist` 响应对比与拒绝记录。 |
