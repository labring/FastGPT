# Sandbox Runtime 配置迁移设计

状态：已完成

最后更新：2026-07-22

## 1. 目标与范围

App Chat 和 Workflow 在 Agent 或 ToolCall 节点真正使用 sandbox 前比较目标 provider、目标镜像与现有实例记录。
任一配置不一致时，在本轮 Workflow 内静默完成归档和迁移，不再要求用户确认，也不重放请求。
Skill Edit 继续保留显式升级弹窗，由 Skill 页面独立维护查询、确认和轮询。

本设计不改变以下边界：

- 物理 App sandbox 身份仍为 `app + effectiveUid`，`chatId` 只决定 session 工作目录和鉴权目标。
- 镜像只比较 `repository + tag`，不比较 digest。
- 仅当 Agent 或 ToolCall 节点确认本轮实际使用 sandbox 后检查，不在页面进入时预检查。
- 迁移复用现有 archive、restore 和 provider migration 生命周期，不新增数据库迁移状态。

## 2. 产品决策

- App Chat 和 Workflow 的镜像或 provider 不一致都采用静默升级。
- 静默升级期间通过 `sandboxStatus: upgrading` 展示“沙盒升级中”。
- 迁移收敛后发送原有 `sandboxStatus: lazyInit`，继续展示“虚拟机运行中”，并在同一次
  Workflow 内恢复或创建目标 runtime。
- 不再弹出 App 升级弹窗，不再从前端调用升级 API，也不再自动重放用户输入。
- 迁移失败时终止当前 Agent 节点，并把已脱敏的底层失败原因写入 Workflow 错误结果。
- Skill Edit 仍保留用户确认、后台归档和轮询，相关弹窗和控制状态收回 Skill 模块内部。

## 3. App Chat / Workflow 主链路

```text
Agent 或 ToolCall 节点确认本轮需要 sandbox
  -> 查询同一 source 的实例并解析目标 provider/image
  -> provider 和 image 均一致
       -> sandboxStatus: lazyInit
       -> 正常创建、恢复或连接 runtime
  -> provider 或 image 不一致
       -> sandboxStatus: upgrading
       -> 当前请求同步推进或等待既有迁移 operation
       -> 迁移收敛到目标 provider 的 archived/可初始化状态
       -> sandboxStatus: lazyInit
       -> 正常恢复目标 runtime
       -> 继续当前 Agent 节点和当前 Workflow
  -> 迁移失败
       -> 抛出包含实际失败原因的迁移错误
       -> 当前 Agent 节点按标准 Workflow 错误结果结束
```

静默迁移不会重放 Workflow，因此迁移前已经运行过的 webhook、写库或计费节点不会重复执行。

## 4. 服务端设计

### 4.1 实例选择

App 和 Skill 继续复用无副作用的 runtime 状态解释：

- 按 `sourceType + sourceId + userId` 读取逻辑实例。
- 当前 provider 实例优先作为状态实例。
- 没有当前 provider 实例时，旧 provider 的过渡态、失败态、已归档实例和旧镜像稳定态依次
  作为状态来源。
- 只有旧镜像的 `running/stopped`，或失败的 `stopping/archiving` 可以成为镜像升级归档候选。
- 当前 provider 记录的 `sandboxId` 与目标身份不一致时直接报错，不在错误记录上继续生命周期操作。

### 4.2 App 静默迁移编排

`ensureAppSandboxRuntimeReady` 只在 provider 或镜像变化时接管迁移：

- 镜像变化：同步调用标准 archive 流水线，完整保存 workspace，随后由正常 runtime 初始化恢复。
- provider 变化：调用标准 provider migration，在同一 lifecycle lease 内归档旧资源并原子切换记录。
- 已有活跃 operation：当前请求轮询真实记录，不能并发启动第二条迁移链。
- Redis lease 竞争或初始化占用：视为并发迁移，等待后重新读取状态。
- 失败的 `stopping`：先由 stop owner 完成到 `stopped`，再继续归档。
- `archived` 且配置变化：无需重复归档，直接收敛 provider/image 后交给正常 restore。
- 配置一致的普通生命周期状态不由升级编排等待，保持原 runtime client 的既有处理。
- 等待超过 archive 隔离窗口时按超时失败，避免 Workflow 无限占用。

Agent 和 ToolCall dispatch 在创建 `SandboxClient` 前统一调用 Workflow sandbox 准备入口，确保两种
节点都先完成配置迁移，并按 `upgrading -> lazyInit` 顺序发送粗粒度状态。

迁移函数返回是否观察到配置变化，仅用于决定是否发送 `upgrading` 进度；不把数据库的细粒度
生命周期状态暴露给 Chat 前端。

### 4.3 状态解释和 Skill 显式升级

通用状态仍为 `readyToInit | upgradeRequired | upgrading`，供 Skill Edit 的状态 API 和显式升级
入口使用。Skill 的 `triggerSandboxRuntimeUpgrade` 继续启动后台 archive，页面每 3 秒轮询状态。

App Chat 不再暴露 `upgradeRequired` SSE，也不再调用以下 API：

- `POST /api/core/ai/sandbox/runtime/getStatus`
- `POST /api/core/ai/sandbox/runtime/upgrade`

对应 App API 路由、OpenAPI path 和 Chat 请求封装删除。Skill runtime API 保持不变。

### 4.4 错误处理

- archive 返回 `failed` 时使用其具体 `error`。
- provider migration、身份校验、状态恢复和超时异常使用实际错误文本。
- 错误经过统一敏感信息替换后包装为 `UserError`，Agent dispatch 记录服务端日志并把错误文本写入
  `errorText` 和 `toolResponse.error`。
- 不再用 `runtimeUpgradeRequired` 受控错误中断并等待前端重放。

## 5. 前端设计

### 5.1 App Chat

- ChatBox 只消费 `sandboxStatus` 并渲染粗粒度进度。
- 新增 `upgrading -> 沙盒升级中...`，保留 `lazyInit -> 虚拟机运行中...`。
- 删除 App 升级弹窗、升级 hook、状态轮询、待回放回调和自动重放逻辑。
- 迁移错误沿用 Workflow 的标准错误展示，不增加独立迁移弹窗。

### 5.2 Skill Edit

- Skill 页面内部维护 `runtimeStatus`、请求版本、确认升级和轮询。
- Skill 升级弹窗直接放回 Skill `Content`，不再使用 App/Skill 共享组件和 hook。
- 用户退出、请求失效和初始化失败仍沿用 Skill 原有行为。

## 6. 并发与一致性

- lifecycle lease、operation token 和 Mongo CAS 保证同一个 sandbox 只有一个迁移执行者。
- 竞争请求只等待和重新读取，不伪造完成状态。
- provider 切换只有在旧资源已归档后才发布，目标配置无效时保留旧资源。
- 首次 provisioning、provisioning 完成和 archive restore 都持久化实际使用的 runtime image。
- 普通 touch running 不覆盖镜像，避免一致性检查前丢失旧镜像证据。
- 历史实例缺失 `metadata.image` 时按镜像不一致处理。

## 7. TODO 与验证

- [x] App provider/image 不一致改为服务端静默迁移。
- [x] App Chat 和 Workflow 在同一次执行内继续 runtime 初始化及 Agent loop。
- [x] Workflow Agent 与 ToolCall 节点统一接入静默迁移和状态事件。
- [x] 新增 `upgrading` SSE 和三语 Chat 文案。
- [x] 删除 App 升级 API、OpenAPI、弹窗、轮询和自动重放。
- [x] 共享升级弹窗和 hook 收回 Skill Edit 内部。
- [x] 迁移异常透传具体失败原因。
- [x] 定向验证镜像迁移、provider 迁移、状态顺序和错误传播。
