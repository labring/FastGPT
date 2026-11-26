# Agent Sandbox Docker 磁盘软限制设计方案

状态：已实施（单测与 Docker 实机集成测试通过）

关联文档：

- [Agent Sandbox 设计方案](./index.md)
- [Agent Sandbox 集成测试](./integration-testing.md)

## 1. 背景与目标

Agent Sandbox 持久卷统一挂载于 `$HOME`（`/home/sandbox`，工作区位于 `/home/sandbox/workspace`，容器级临时运行态位于 `FASTGPT_RUNTIME_DIR=/var/lib/fastgpt-runtime`）：

- **Kubernetes**：`/home/sandbox` 持久卷上限由原生 PVC（`storageSizeGi`）在存储层硬限制（写满原生返回 `ENOSPC`），无需额外软限制拦截。
- **Docker**：Docker named volume 默认不强制容量上限（`DockerVolumeDriver` 忽略 `storageSize`），未开启宿主机 XFS `pquota` 时单沙盒可无上限写爆宿主机磁盘。

本方案**1:1 对齐 Kubernetes PVC 语义**，仅对 **Docker 运行时** 的 `/home/sandbox` 持久卷区域提供完备的软限制与内核单文件防爆，不对卷外区域做额外配额拆分，也不引入任何新配置项、多级缓存、定时巡检或部署 YAML 改动：

1. **职责边界清晰**：
   - `opensandbox.runtime === 'kubernetes'`：完全跳过磁盘软限制逻辑（零扫描、零 RPC、零 `RLIMIT_FSIZE` 副作用），上限交给原生 PVC。
   - `opensandbox.runtime === 'docker'`：通过单一开关（主站判断 `runtime === 'docker'`，容器侧注入 `FASTGPT_DISK_SOFT_LIMIT_BYTES = storageSizeGi`）开启完整软限制。
2. **双端通用工程优化**：
   - `entrypoint.sh` 移除 `>> /tmp/ide-agent.log 2>&1`，改为直接 `exec fastgpt-ide-agent` 前景输出到容器 `stdout/stderr` 交由 Docker/K8s 原生轮转；
   - `fastgpt-ide-agent` 将同步阻塞的 `portable-pty` 升级为异步原生 `pty-process 0.5.4`（省去每终端 2 条专用 OS 线程），并在 `bridge.rs` 拉起 PTY 子 shell 时剥离 6 个 `FASTGPT_*` 启动控制变量；
   - `shell.tool.ts` 统一由单进程 `python3`（`subprocess.Popen` + 匿名管道 + 内存 5 MiB 环形缓冲）在运行期封顶单次命令日志为 **5 MiB**，仅在触发输出截断时落盘并最多保留最近 **10 份** `/tmp/fastgpt-bash-*.log`（总占用上限 50 MiB）。

---

## 2. 分模块详细设计

### 2.1 容器启动与环境变量开关

- [runtimeProfile.ts](../../../../../packages/service/core/ai/sandbox/infrastructure/opensandbox/runtimeProfile.ts)：
  - `buildBaseSandboxRuntimeEnv` 仅在 `opensandbox.runtime === 'docker'` 时注入 `FASTGPT_DISK_SOFT_LIMIT_BYTES = String(ideAgentMaxFileBytes)`；Kubernetes 下不注入。
- [entrypoint.sh](../../../../../projects/agent-sandbox/entrypoint.sh) & [bridge.rs](../../../../../projects/fastgpt-ide-agent/src/terminal/bridge.rs)：
  - `entrypoint.sh` 直接 `exec fastgpt-ide-agent` 将标准输出与标准错误交由容器日志收集（移除 `/tmp/ide-agent.log` 重定向）；
  - `bridge.rs` 在派生交互式子 shell 前清除 `FASTGPT_WORKDIR`、`FASTGPT_RUNTIME_DIR`、`FASTGPT_DISK_SOFT_LIMIT_BYTES`、`FASTGPT_IDE_MAX_FILE_BYTES`、`FASTGPT_IDE_WS_MAX_MESSAGE_BYTES`、`FASTGPT_IDE_WS_MAX_FRAME_BYTES`。

### 2.2 `fastgpt-ide-agent` 单一缓存探针、WS 降级自救与异步 PTY

1. **卷用量探针与单一缓存（[disk.rs](../../../../../projects/fastgpt-ide-agent/src/disk.rs) + [main.rs](../../../../../projects/fastgpt-ide-agent/src/main.rs)）**：
   - 仅当 `FASTGPT_DISK_SOFT_LIMIT_BYTES` 为正整数时启用软限制门禁；未设置时（如 K8s）写前校验直接 `Ok(())`，零扫描、零缓存开销。
   - **统计口径（镜像 PVC）**：只扫描 [get_home_root()](../../../../../projects/fastgpt-ide-agent/src/workspace.rs)（`/home/sandbox` 全量），不管卷外区域；全程使用 `symlink_metadata`（`lstat`）不跟随软链，Unix 下按 `blocks * 512` 计量并对硬链接（`!is_dir() && nlink() > 1`）按 `(st_dev, st_ino)` 去重。
   - **单飞并发防抖与即时解锁规则**：全系统只在容器内 `disk.rs` 维护一份 **15s TTL** 内存缓存（主站侧无二级缓存，多副本天然一致），通过单飞 `scan_lock` + 单调递增 `generation` 围栏串行化扫盘并防止并发写入过期快照：
     - 未超限且 15s 内命中缓存 → 零盘扫描直接返回；
     - 已超限态附加 **`1s` 短防抖**（`OVER_QUOTA_DEBOUNCE`）吸收瞬时突发探针，`?refresh=1` 或显式 `invalidate_disk_usage_cache()`（在 `fs/delete` 与 `/archive/extract` 后触发）无条件清除防抖与缓存，确保清理文件后所有入口立即解锁。
   - **HTTP 路由**：在 `1319` 路由挂载 `GET /disk-usage`（复用现有 `x-fastgpt-agent-token` 认证中间件），返回 `{ "usedBytes": ..., "limitBytes": ... }`。
2. **IDE WS `/fs` 拦截与 `/terminal` 自救降级（[protocol.rs](../../../../../projects/fastgpt-ide-agent/src/protocol.rs)、[fs/error.rs](../../../../../projects/fastgpt-ide-agent/src/fs/error.rs)、[fs.rs](../../../../../projects/fastgpt-ide-agent/src/fs.rs)、[terminal.rs](../../../../../projects/fastgpt-ide-agent/src/terminal.rs)）**：
   - 新增 JSON-RPC 错误码 `JsonRpcErrorCode::DiskQuotaExceeded = -32005`；前端 [SandboxEditor/hook.tsx](../../../../../projects/app/src/pageComponents/chat/SandboxEditor/hook.tsx) 识别 `SANDBOX_RPC_DISK_QUOTA_EXCEEDED_CODE (-32005)` 并展示本地化超限提示。
   - `fs/write_file`、`fs/mkdir` 执行前调用 `disk::check_workspace_writable().await`，超限时返回 `FsError::DiskQuotaExceeded`；
   - `fs/delete`、`fs/move` 与全部只读方法始终放行；`fs/delete` 成功后失效缓存；
   - `/terminal` 建立会话前校验 `disk::check_workspace_writable().await`：超限时**不关闭连接**，而是推送 `[Disk Quota Exceeded]` 黄色 ANSI 警告横幅并降级启动只读自救 PTY（强制 **`RLIMIT_FSIZE=0`** 且设置 **`HISTFILE=/dev/null`**，行为与 `shell.tool.ts` 一致），允许用户在终端执行 `du`/`ls`/`rm` 清理空间。
3. **异步 PTY 与 `RLIMIT_FSIZE`（[Cargo.toml](../../../../../projects/fastgpt-ide-agent/Cargo.toml)、[terminal/bridge.rs](../../../../../projects/fastgpt-ide-agent/src/terminal/bridge.rs)）**：
   - `portable-pty` 替换为 **`pty-process = { version = "0.5.4", features = ["async"] }`**，纯 `tokio` 异步任务驱动读写与 `resize`，移除每终端 2 条专用 OS 线程；
   - 启用 `FASTGPT_DISK_SOFT_LIMIT_BYTES` 时，正常态在 `pre_exec` 设置 `RLIMIT_FSIZE = limit:limit`，超限态降级为 `RLIMIT_FSIZE = 0:0`（支持内核级单文件/零写入封顶），不限制 `ide-agent` 自身。

### 2.3 主站写前守卫、Agent 指引与 `shell.tool.ts`

1. **错误码与多语言文案（[sandbox.ts](../../../../../packages/global/common/error/code/sandbox.ts)、[error.ts](../../../../../packages/service/core/ai/sandbox/error.ts)）**：
   - 新增 `SandboxErrEnum.agentSandboxDiskQuotaExceeded`（`code: 510007`，`httpStatus: 403`）及 `zh-CN` / `en` / `zh-Hant` / `ko-KR` 提示文案。
2. **复用 `ide-agent` HTTP 客户端（[ideAgent.ts](../../../../../packages/service/core/ai/sandbox/application/ideAgent.ts)）**：
   - 将现有 `fetchIdeAgentArchiveRoute` 泛化为 `fetchIdeAgentRoute`（支持 `GET/POST` 与自定义 `maxAttempts`），`getSandboxDiskUsage` 直接复用鉴权、401 刷新密码重试与错误处理（默认 `3s` 短超时、`maxAttempts: 1`）。
3. **无状态配额守卫（复用 [quota.ts](../../../../../packages/service/core/ai/sandbox/application/quota.ts)）**：
   - 与激活配额同文件维护，主站侧**无额外缓存状态**：
     - `runtime !== 'docker'` → 直接返回放行（Kubernetes 零开销）；
     - Docker 下调用 `getSandboxDiskUsage`（命中容器内 15s 内存缓存，超限时通过 1s 防抖与重扫核验）；探针超时或网络异常时记录 warn 日志并 **fail-open** 放行。
   - **统一入口收敛**：
     - **用户态写入口**（`assertSandboxWorkspaceWritable` / `getSandboxDiskQuotaStatus`）：超限时抛出 `createAgentSandboxDiskQuotaExceededError()`，其中 [upload.ts](../../../../../projects/app/src/pages/api/core/ai/sandbox/upload.ts) 与 [file.ts](../../../../../packages/service/core/ai/sandbox/application/file.ts)（`writeUrlFilesToSandbox`，先判超限再下载 URL；[runtime/files.ts](../../../../../packages/service/core/ai/sandbox/application/runtime/files.ts) 直接复用 `writeUrlFilesToSandbox`）调用 `assertSandboxWorkspaceWritable`；[extractZip.ts](../../../../../projects/app/src/pages/api/core/ai/sandbox/extractZip.ts) 在 `sandbox.runWithRecovery` 内调用 `getSandboxDiskQuotaStatus`，超限时抛出 `createAgentSandboxDiskQuotaExceededError()` 并复用该次探测的 `limitBytes` 为 Docker 解压启用 `prlimit --fsize` 包裹 `unzip -oq ... </dev/null`；
     - **Agent 写入工具**（[toolCall/index.ts](../../../../../packages/service/core/ai/sandbox/application/toolCall/index.ts)）：在 `runSandboxTools` 统一拦截 `sandbox_write_file` / `sandbox_edit_file`，无需修改各工具或新增异常类，直接返回 `{ success: false, response: formatAgentDiskQuotaNotice(quota, 'write') }` 给模型（不中断 Agent Loop），指引其用 `sandbox_shell` 排查 `du -sh` 并 `rm -rf` 释放空间后重试。
4. **`shell.tool.ts`（[shell.tool.ts](../../../../../packages/service/core/ai/sandbox/application/toolCall/shell.tool.ts)）**：
   - **Docker & K8s 共用**：由单进程 `python3` 通过匿名管道收集子进程输出并在内存中按 **5 MiB** 封顶（保留最后 5 MiB、前台退出后立即关闭读端不阻塞后台进程、收到信号按进程组终止且不留临时文件），仅在超过输出截断阈值时落盘并保留最近 **10 份** `/tmp/fastgpt-bash-*.log`。
   - **仅 Docker 开启**：正常态包裹 `prlimit --fsize=${limit}:${limit}`；超限态降级为 **`prlimit --fsize=0:0`**（内核级禁止写入，`du`/`ls`/`rm` 正常执行），尾部附加 `formatAgentDiskQuotaNotice(quotaStatus, 'shell')`。

---

## 3. 明确不做（范围边界）

- 不限制 `/home/sandbox` 挂载卷之外的区域（不引入 `baselineBytes`、`ephemeralBytes`）；
- 不新增配置项，不修改管理台表单、MongoDB Schema/索引、Redis 状态键或后台 Cron；
- 不在主站维护二级磁盘配额缓存（统一由容器内 `disk.rs` 单点缓存与超限重扫）；
- 不改动 `projects/volume-manager`、`projects/agent-sandbox-proxy` 与任何 `deploy/*.yml` / Helm Chart。

---

## 4. 实现待办（TODO）

- [x] **Step 1：容器脚本与 `fastgpt-ide-agent`**
  - [x] 更新 [entrypoint.sh](../../../../../projects/agent-sandbox/entrypoint.sh)（移除 `/tmp/ide-agent.log` 重定向，改为直接 `exec fastgpt-ide-agent`）。
  - [x] 新增 [disk.rs](../../../../../projects/fastgpt-ide-agent/src/disk.rs) 与 `GET /disk-usage` 路由（单飞 `scan_lock` + `generation` 围栏、15s 缓存、1s 超限防抖与显式缓存失效）并补齐单测。
  - [x] 更新 [protocol.rs](../../../../../projects/fastgpt-ide-agent/src/protocol.rs)、[fs/error.rs](../../../../../projects/fastgpt-ide-agent/src/fs/error.rs)、[fs.rs](../../../../../projects/fastgpt-ide-agent/src/fs.rs)、[terminal.rs](../../../../../projects/fastgpt-ide-agent/src/terminal.rs) 接入卷配额拦截、`/terminal` 超限自救降级与 `fs/delete`/`/archive/extract` 缓存失效并补齐单测。
  - [x] 升级 [Cargo.toml](../../../../../projects/fastgpt-ide-agent/Cargo.toml) 将 `portable-pty` 替换为 `pty-process 0.5.4`，重构 [terminal/bridge.rs](../../../../../projects/fastgpt-ide-agent/src/terminal/bridge.rs) 为纯异步 PTY + 启动变量剥离 + `pre_exec(RLIMIT_FSIZE)`（含超限 `0:0` 与 `HISTFILE=/dev/null`）并补齐单测。
- [x] **Step 2：全局错误码、主站守卫与工具集成**
  - [x] 在 [sandbox.ts](../../../../../packages/global/common/error/code/sandbox.ts)、[error.ts](../../../../../packages/service/core/ai/sandbox/error.ts) 与 `packages/web/i18n/*/common.json` 新增 `agentSandboxDiskQuotaExceeded`。
  - [x] 更新 [runtimeProfile.ts](../../../../../packages/service/core/ai/sandbox/infrastructure/opensandbox/runtimeProfile.ts) 仅在 Docker 下注入 `FASTGPT_DISK_SOFT_LIMIT_BYTES` 并补单测。
  - [x] 在 [ideAgent.ts](../../../../../packages/service/core/ai/sandbox/application/ideAgent.ts) 复用 `fetchIdeAgentRoute` 实现 `getSandboxDiskUsage`。
  - [x] 在 [quota.ts](../../../../../packages/service/core/ai/sandbox/application/quota.ts) 扩展无状态 Docker 磁盘配额守卫与统一 Agent 指引文案，并在 [quota.test.ts](../../../../../packages/service/test/core/ai/sandbox/application/quota.test.ts) 补齐单测。
  - [x] 在 [toolCall/index.ts](../../../../../packages/service/core/ai/sandbox/application/toolCall/index.ts) 集中拦截 `write_file`/`edit_file`，在 [shell.tool.ts](../../../../../packages/service/core/ai/sandbox/application/toolCall/shell.tool.ts) 接入 `prlimit` 与日志封顶，在 [file.ts](../../../../../packages/service/core/ai/sandbox/application/file.ts)（[runtime/files.ts](../../../../../packages/service/core/ai/sandbox/application/runtime/files.ts) 复用之）、[upload.ts](../../../../../projects/app/src/pages/api/core/ai/sandbox/upload.ts)、[extractZip.ts](../../../../../projects/app/src/pages/api/core/ai/sandbox/extractZip.ts) 接入写前守卫并补齐单测。
- [x] **Step 3：验证与集成测试**
  - [x] 跑通 `cargo test` & `cargo clippy --all-targets -- -D warnings`、受影响的 Vitest 单测、`tsc --noEmit` 与 `eslint`。
  - [x] 重新构建 `fastgpt-agent-sandbox:dev` 并跑通真实 Docker 集成测试（`disk-soft-limit.integration.test.ts` 与 `fastgpt.integration.test.ts`）。
