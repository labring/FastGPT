# OpenSandbox Adapter 生命周期与 SDK 适配重构

状态：已实现

最后核对：2026-07-23

## 1. 背景与目标

FastGPT 会在 Sandbox 闲置 5 分钟后调用 provider adapter 的 `stop()`。当前
`OpenSandboxAdapter.stop()` 删除远端 sandbox，导致下次使用时只能重新创建，无法保留
容器状态。本次调整要求 OpenSandbox 的 `stop()` 使用 pause，并通过 resume 复用原实例。

同时完整核对 `OpenSandboxAdapter` 与当前 OpenSandbox JavaScript SDK 的实现，处理生命周期
状态、HTTP agent 释放、readiness、命令输出和测试职责中已经存在的问题。

## 2. 范围

- `OpenSandboxAdapter` 的 create/connect/ensure/start/stop/delete/getInfo/close 生命周期。
- OpenSandbox SDK 的 ConnectionConfig、Sandbox、SandboxManager、readiness 和命令执行约定。
- 基于 FastGPT `sandboxId` 的远端实例复用，以及同一 adapter 内的 SDK client 复用。
- OpenSandbox adapter 单元测试、上传恢复 helper 测试和 OpenSandbox 集成测试。
- OpenSandbox SDK 依赖与锁文件版本。

不调整 FastGPT application 层的 5 分钟 cron、Mongo 生命周期状态机和其他 sandbox provider。

## 3. 当前实现审查

### 3.1 已有 reuse

当前已经存在远端资源复用，但不是 SDK 内置的 pool：

1. FastGPT 把稳定的业务 `sandboxId` 作为 adapter `sessionId`。
2. 创建 OpenSandbox 时写入 `metadata.sessionId`。
3. `ensureRunning()` 通过 `SandboxManager.listSandboxInfos()` 按 metadata 查找远端实例。
4. 找到运行中实例时 connect，找到暂停实例时 resume，不存在时才 create。

因此本次不新增另一套资源池。需要保留并强化 metadata 寻址，使 pause 后仍能找到同一个远端
sandbox。

### 3.2 本地 SDK client 未复用

`ensureRunning()` 在远端状态为 Running 时始终调用 `Sandbox.connect()`，即使 adapter 已经绑定
同一个 `Sandbox`。SDK 的每个静态 create/connect 和 SandboxManager 都可能持有独立的 undici
agent；旧 `Sandbox` 没有 close 就被覆盖，会泄漏 client 资源。

目标行为：

- 已绑定同一个 Running sandbox 时直接复用，不重新 connect。
- 静态 create/connect 替换旧实例时释放旧实例。
- resume 统一走静态 SDK API，替换 client 后释放旧 transport。
- `close()` 幂等释放并解除绑定。

### 3.3 SandboxManager 生命周期过碎

删除等待会每秒创建并关闭一个 SandboxManager。每个 manager 都拥有独立 transport，这会产生
不必要的 agent churn。

目标行为是在一次顶层 lifecycle 操作内只创建一个 manager，查找、pause/kill 和轮询共用它，
并在 `finally` 中关闭。manager 不提升为 adapter 长生命周期字段，因为资源 cron 构造临时 adapter
后只调用 stop/delete，不保证额外调用 close。

### 3.4 生命周期状态映射不完整

当前映射缺少 OpenSandbox 0.1.10 的 `Pausing` 和 `Resuming`。尤其是 pause API 返回 202 后会经历
`Running -> Pausing -> Paused`；如果 stop 在 202 后立即返回，FastGPT 会提前把本地记录标成
stopped，紧接着 resume 也可能因为仍在 Pausing 而失败。

目标映射：

| OpenSandbox | Adapter |
| --- | --- |
| Creating | Creating |
| Running | Running |
| Resuming | Starting |
| Pausing | Stopping |
| Paused | Stopped |
| Deleting | Deleting |
| Deleted | UnExist |
| Error / unknown | Error |

`stop()` 必须等到 Paused 或资源已不存在才返回；遇到 Pausing 时只等待，不重复发 pause。恢复时
遇到 Pausing 先等 Paused，再发 resume。

### 3.5 未遵循当前 SDK 约定的实现

- create 和 start 在 SDK 内置 readiness 之后又调用 adapter `waitUntilReady()`，重复轮询，并让
  `skipHealthCheck` 失效。
- adapter 不应覆盖 SDK 默认健康定义；`Sandbox.isHealthy()` 已负责把 ping 异常收敛为 `false`。
- bound stop/delete 仍通过额外的 SandboxManager 操作，没有使用 `sandbox.pause()` / `kill()`；
  当前 SDK 会在这两个 instance 方法中同步失效 endpoint cache。
- `getInfo()` 为读取生命周期信息强制 connect execd，导致 Paused sandbox 被错误返回为不存在。
- 命令 exit code 忽略 SDK 已提供的 `execution.exitCode`。
- SDK 0.1.10 支持 handler `skipAccumulation`；adapter 已自行使用有界 buffer 时应禁用 SDK 的重复
  日志累积，避免长输出双份占用内存。
- OpenSandbox metadata 实际要求 `Record<string, string>`，当前 provider 类型和透传中仍有
  `any` / `unknown` 未归一化。

## 4. 开发设计

### 4.1 Manager 作用域

增加内部 `withSandboxManager()`：每次顶层管理操作创建一个 manager，通过 callback 复用，
最后无条件 close。查找、按 id 获取状态、pause、kill 和状态轮询都接收同一个 manager。

### 4.2 远端状态等待

增加统一状态轮询 helper，输入 sandbox id、期望 adapter 状态和 info getter：

- 404 视为 `UnExist`。
- 到达期望状态后返回最新 info。
- Error 立即抛出 ConnectionError。
- 超时抛出 SandboxStateError，并保留当前状态和期望状态。

stop 使用 `Stopped | UnExist` 作为完成条件。ensure/start 对 Pausing 使用 `Stopped`，对
Creating/Resuming 使用 `Running`。

### 4.3 生命周期操作

- `create()`：使用 `Sandbox.create()`，metadata 在类型入口约束为字符串；readiness 完全交给 SDK。
- `connect()`：显式连接会刷新 client；新连接成功后替换绑定并关闭旧的独立 Sandbox client。
- `ensureRunning()`：优先读取已绑定 sandbox 的 info；未绑定时按 `metadata.sessionId` 查找。
  Running 复用、Paused resume、Pausing 等待后 resume、Creating/Resuming 等待后 connect、Deleting
  按 `allowCreate` 决定等待重建或报错。
- `start()`：复用 ensure 语义但禁止创建；resume 统一返回新的独立 SDK client。
- `stop()`：bound sandbox 使用 `sandbox.pause()`，unbound sandbox 使用 manager pause；等待 Paused
  后返回，不清除绑定。
- `delete()`：bound target 使用 `sandbox.kill()`，unbound/显式其他 id 使用 manager kill；删除后
  close 并清除匹配绑定。
- `getInfo()`：bound 时用 `sandbox.getInfo()`；unbound 时直接用 manager 的 lifecycle info，不为
  Paused sandbox 建立 execd 连接。
- `close()`：未绑定时也成功，释放后清除本地引用，不改变远端状态。

### 4.4 Readiness 与命令输出

create/connect/resume 使用 SDK 默认 readiness；adapter `ping()` 直接委托 `Sandbox.isHealthy()`，
不再用执行命令覆盖健康端点语义。

命令结果直接使用 SDK 的 `execution.exitCode` 和 `execution.complete.executionTimeMs`。execute 和
executeStream handler 开启 `skipAccumulation`，adapter 继续用 `BoundedOutputBuffer` 控制输出上限。

### 4.5 类型与测试收敛

- touched provider config 使用 `type`，移除 `any`。
- `OpenSandboxConfigType` 从共享 create spec 派生，只收窄 image、metadata、volumes。
- Adapter 测试使用统一 SDK sandbox/manager factory，移除访问真实保留端口的伪单测。
- 错误类自身行为只留在 errors 测试，不在 adapter 测试重复验证。
- 文件操作直接委托 SDK 0.1.10 的原生 filesystem facade，不保留 uploadRecovery 专用补偿层。
- 增加 pause 完成等待、Pausing 后 resume、bound Running client 复用、paused getInfo、幂等 close、
  transport 替换释放和 SDK exitCode 测试。
- 集成测试恢复 stop/start contract，并修正 `timeout` 为 `timeoutSeconds`。

## 5. 验收标准

1. 5 分钟闲置 stop 对 OpenSandbox 发 pause，不发 delete。
2. stop 仅在 Paused/不存在后完成，本地 stopped 不领先于远端状态。
3. 后续 ensure/start 恢复同一个 OpenSandbox id，工作区状态保留。
4. 同一 adapter 重复 ensure Running 不创建新的 SDK Sandbox client。
5. 所有临时 SandboxManager 和被替换/断开的独立 Sandbox client 都会释放 transport。
6. Paused sandbox 的 getInfo 可正常返回，不依赖 execd connect。
7. OpenSandbox 单元测试、adapter build 和格式检查通过；按用户要求不运行仓库全量测试。

## 6. TODO

- [x] 完整审查 OpenSandboxAdapter、调用方、现有测试和当前 OpenSandbox SDK。
- [x] 明确已有 metadata 远端复用和缺失的本地 client 复用。
- [x] 重构状态映射、manager 作用域和 lifecycle 轮询。
- [x] 改造 create/connect/ensure/start/stop/delete/getInfo/close。
- [x] 接入 SDK 默认 readiness、isHealthy、exitCode 和 skipAccumulation。
- [x] 收敛 provider 类型和 upload recovery 类型。
- [x] 清理并补充 OpenSandbox adapter 单元测试和集成测试配置。
- [x] 更新 OpenSandbox SDK 依赖及 lockfile（已确认只支持 0.1.10，不保留 0.1.6 兼容）。
- [x] 只运行 sandbox-adapter 定向测试、build、格式与 diff 检查。
