# FastGPT Sandbox 集成测试设计

## 背景

Sandbox 的 provider SDK 已有自己的契约测试，但它无法验证 FastGPT 在真实运行时中的行为：

- Agent 准备阶段是否创建真实 App Sandbox，并把用户文件写入 workspace。
- `runSandboxTools` 的参数校验、命令调度、耗时上报和错误返回是否正确。
- Mongo lifecycle、Redis lease、preview session、volume manager 与 provider 是否协同工作。
- provider 资源消失或生命周期中断后，FastGPT 是否能按持久化状态重试和恢复。
- OpenSandbox runtime 是否使用 FastGPT 的 network policy 并创建 egress sidecar。

因此本测试不以 SDK 为目标，而是从 FastGPT 业务入口覆盖 Agent Sandbox 完整链路。

## 目标

1. 通过 `prepareSandboxToolRuntime` 和 `runSandboxTools` 执行真实 Agent Sandbox 链路。
2. 覆盖 FastGPT 当前提供的全部八个 Sandbox 指令，并记录每条指令的 wall-clock 耗时。
3. 对单条指令、超时、生命周期创建和清理分别设置可配置的性能预算。
4. 注入参数错误、命令失败、命令超时和生命周期中断，验证 runtime 可复用或自动恢复。
5. 使用与 dev 一致的 OpenSandbox、volume manager、egress、preview proxy、Mongo 和 Redis。
6. 每个用例独立创建 App source，并通过 FastGPT delete lifecycle 清理所有资源。

## 测试入口

位置：`packages/service/test/integrations/sandbox/fastgpt.integration.test.ts`

专用 Vitest 配置为 `packages/service/vitest.sandbox.integration.config.ts`。它不加载通用
`test/setup.ts`，避免该 setup 中的 Redis mock 将 lifecycle lease 和 preview session 变成内存行为。

运行命令：

```bash
FASTGPT_TEST_MODE=sandbox pnpm test
```

只有 `SANDBOX_INTEGRATION=true` 时才运行真实 provider 用例。已启用但 provider 环境变量不完整
时直接失败，避免配置错误被静默跳过。

## 环境一致性与隔离

- Mongo 连接 dev Mongo 服务，但由测试 binding 生成随机数据库，并在 suite 结束时删除。
- Redis 连接 dev Redis，默认使用 DB 15；所有 Sandbox identity 和 preview session 均为随机值。
- OpenSandbox 使用 dev 的 server、agent image、volume manager 和 preview proxy。
- runtime 必须由 FastGPT `buildOpenSandboxRuntimeProfile` 构造，network policy 会创建 egress
  sidecar；测试还会从 Sandbox 访问 dev 私网服务并断言被阻止。
- `AGENT_SANDBOX_OPENSANDBOX_USE_SERVER_PROXY` 只控制 SDK 到 OpenSandbox server 的连接方式，
  不负责创建 egress；egress 由 FastGPT runtime profile 中的 `networkPolicy` 触发。

## 指令与计时

以下八个工具全部通过 `runSandboxTools` 执行：

1. `sandbox_write_file`
2. `sandbox_read_file`
3. `sandbox_edit_file`
4. `sandbox_grep`
5. `sandbox_find`
6. `sandbox_ls`
7. `sandbox_shell`
8. `sandbox_get_file_url`

每次调用记录：操作名、wall-clock 耗时、预算、业务返回的 `durationSeconds` 和结果类型。测试会
校验 wall-clock 不超过预算，并检查业务上报耗时没有显著大于实际耗时。suite 结束时统一输出 JSON
计时报告。

默认预算：

- 普通工具：2 秒。
- 主动超时场景：8 秒。
- create、repair、resume 等生命周期操作：180 秒。
- provider、volume、archive、Mongo 清理：120 秒。

预算可分别通过 `SANDBOX_INTEGRATION_TOOL_MAX_MS`、
`SANDBOX_INTEGRATION_TIMEOUT_MAX_MS`、`SANDBOX_INTEGRATION_LIFECYCLE_MAX_MS` 和
`SANDBOX_INTEGRATION_CLEANUP_MAX_MS` 调整。

## 错误与重试场景

- 工具参数校验失败后，同一个 runtime 继续执行命令。
- 未知工具和损坏 JSON 被调度层拒绝后，同一个 runtime 继续执行命令。
- 文件不存在、offset 越界、路径穿越和 preview 文件不存在后，同一个 runtime 继续执行命令。
- shell 返回非零 exit code 后，同一个 runtime 继续执行命令。
- shell 超时并中断后，同一个 OpenSandbox runtime 继续执行命令。
- App source 已删除时拒绝运行命令，不执行用户脚本。
- Mongo 仍为 `running` 但 provider 资源消失时，同一个 FastGPT client 在下一条指令中自动重建
  runtime，并保留 volume 文件。
- 持久化 `provisioning` 失败操作后，再次调用 `getSandboxClient` 重放 provision。
- 持久化 stale `stopping` 失败操作后，scheduler retry 完成 stop，再次调用时恢复 runtime。
- delete 在 archive 阶段失败后保留 phase，再次调用从已完成阶段继续删除。
- 完整模式下，两个 Chat 并发获取相同 source 的 client 并并发执行命令，Mongo 只保留一条实例。

## 清理策略

删除前核对 Mongo 记录的 provider、source 和 user，避免误删共享 dev 资源。清理统一调用
`deleteSandboxResource`，覆盖 provider runtime、egress sidecar、persistent volume、archive 和 Mongo
阶段；可重放删除最多重试三次。suite 结束后再清除本轮 preview Redis key 和随机 Mongo 数据库。

## TODO

- [x] 将测试目标从 provider SDK 改为 FastGPT Agent Sandbox 业务链路。
- [x] 新增独立 Vitest 配置并使用真实 dev Redis。
- [x] 覆盖全部八个 FastGPT Sandbox 工具及逐条计时预算。
- [x] 覆盖参数错误、命令错误、超时及 runtime 复用。
- [x] 覆盖 provider 丢失、provision/stop/delete 中断后的持久化重试。
- [x] 验证 OpenSandbox egress 创建和私网访问阻断。
- [x] 覆盖多 Chat 与并发命令复用同一 FastGPT source。
- [x] 使用本地 dev OpenSandbox 运行全量套件并检查资源清理。
