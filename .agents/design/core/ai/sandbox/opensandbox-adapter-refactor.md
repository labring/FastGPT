# OpenSandbox Adapter 生命周期与 SDK 适配重构

状态：已实现

最后核对：2026-07-23

## 1. 最终决策

OpenSandbox 的 `stop()` 删除远端 sandbox，不调用 pause。Sealos Devbox 继续在 `stop()` 时调用
pause，因此公共 `stop()` 表示“执行 provider 的停止策略”，不承诺所有 provider 都能从同一个远端
实例恢复。

OpenSandbox stop 只删除远端计算资源，不删除 FastGPT 管理的 workspace volume、Mongo 实例记录或
S3 archive。后续重新使用时，FastGPT 仍以稳定业务 `sandboxId` 构造 adapter，`ensureRunning()` 在
确认远端资源不存在后创建新的 sandbox，并重新挂载原 workspace volume。

业务级 `deleteSandboxResource()` 与 stop 不同，它会继续清理远端 sandbox、workspace volume、S3
archive 和 Mongo 实例记录。

## 2. 调用链

5 分钟闲置回收链路：

```text
cron
  -> stopSandboxResources()
  -> stopSandboxResource()
  -> buildSandboxResourceAdapter()
  -> OpenSandboxAdapter.stop()
  -> OpenSandboxLifecycle.delete()
```

OpenSandbox adapter 有两种删除路径：

1. adapter 已绑定 SDK `Sandbox` client 时调用 `sandbox.kill()`。
2. cron 构造的临时 adapter 没有绑定 client，通过 `metadata.sessionId` 找到远端资源后调用
   `SandboxManager.killSandbox()`。

两条路径都等待远端状态进入 `Deleted/UnExist`，随后释放本地 transport。资源已经不存在时按幂等
成功处理。

## 3. 保留的复用能力

metadata 寻址仍然保留，但不再表示“stop 后复用同一远端 id”。它用于：

- FastGPT 进程重启后重新连接仍在运行的 sandbox。
- 并发请求复用已经创建但尚未绑定到当前 adapter 的 sandbox。
- 外部系统暂停 sandbox 时，`ensureRunning()` 仍可识别 Paused/Pausing 并恢复。
- stop 删除后，过滤 Deleted 资源并按原业务 session 创建新的 sandbox。

同一 adapter 已绑定且远端仍为 Running 时继续复用 SDK client，避免重复 connect 和 transport 泄漏。

## 4. 删除的冗余逻辑

- 删除 OpenSandbox stop 专用的 `pauseResolvedSandbox()` 状态编排。
- 删除 `Sandbox.pause()` 和 `SandboxManager.pauseSandbox()` 分支。
- 删除 already-paused 和 pause-not-supported 错误兼容。
- 删除 stop 等待 Paused、stop 后 resume 同一 id 的测试假设。
- 共享 lifecycle contract 不再把 stop 描述为可恢复暂停。

Paused/Pausing 状态映射及 resume 逻辑仍保留，用于处理 provider 外部产生的暂停状态，不参与
FastGPT 的闲置 stop 主链路。

## 5. 其他 adapter 契约

- OpenSandbox SDK 固定使用 `@alibaba-group/opensandbox` 0.1.10 及以上当前契约，不兼容 0.1.6。
- package 仅发布 ESM，不生成或声明 CommonJS 入口。
- OpenSandbox 文件读取使用原生 `readBytes/readBytesStream`，写入使用原生 `writeFiles`。
- Sealos 文件上传和下载继续使用原生 HTTP request/response stream。
- FastGPT 仍在使用非流式 `execute/readFiles/writeFiles`，这些接口继续保留。
- `close()` 只释放本地 transport，不改变远端生命周期。

## 6. 验收标准

1. OpenSandbox `stop()` 不引用 pause API。
2. 已绑定路径调用 `Sandbox.kill()`，未绑定 cron 路径调用 `SandboxManager.killSandbox()`。
3. stop 等待远端删除完成并把 adapter 状态更新为 `UnExist`。
4. stop 不触发 workspace volume、archive 或 Mongo 记录删除。
5. 后续运行态请求可用相同业务 sandboxId 创建新的远端 sandbox。
6. Sealos `stop()` 仍调用 pause，不受本次变更影响。
7. OpenSandbox 定向单测、TypeScript 检查、ESM build 和 diff 检查通过，不运行全量测试。

## 7. TODO

- [x] 核对 5 分钟 stop 到 provider adapter 的完整调用链。
- [x] 将 OpenSandbox stop 收敛为现有 delete 流程。
- [x] 删除 pause 专用状态机、错误兼容和测试假设。
- [x] 覆盖 bound `kill()` 与 unbound `killSandbox()` 两条路径。
- [x] 更新公共 lifecycle 文档、README 和集成测试语义。
- [x] 运行定向测试、类型检查、build 和 diff 检查。
