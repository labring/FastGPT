# App Sandbox Runtime 镜像升级设计

状态：已完成

最后更新：2026-07-22

## 1. 背景

Skill Edit runtime 已经在启动前比较目标镜像与实例记录中的镜像。当 `repository + tag`
不一致时，前端展示升级弹窗，用户确认后归档旧实例，并在归档完成后使用当前镜像恢复工作区。

普通 App Chat 目前直接进入 `getSandboxClient`。实例镜像更新后，旧实例仍可能被继续连接；同时
App 实例的首次创建和归档恢复没有稳定写入 `metadata.image`，无法形成完整的镜像升级闭环。

## 2. 已确认需求

- 镜像一致性只比较 `repository + tag`，不比较 digest 或其他字段。
- 不在进入聊天页面或“第一轮对话”时预检查。
- 只有某一轮 Agent 实际判定 `effectiveUseAgentSandbox=true` 时才检查。
- 检查发生在发送 `sandboxStatus: lazyInit` 之前，旧镜像不得进入 `getSandboxClient`。
- 通过现有 `sandboxStatus` SSE 通知 ChatBox 展示升级弹窗。
- App 与 Skill 复用镜像标准化、状态解释、归档触发和升级弹窗展示能力。
- 升级只归档物理 App sandbox；完整 workspace（包括所有 `sessions/<chatId>`）由现有归档流程保存。
- 升级完成后不自动重放整轮工作流，避免重复执行 Agent 节点之前已经发生的外部副作用；用户可使用现有重试能力重新运行。
- App sandbox 的物理身份保持 `app + effectiveUid`，`chatId` 只用于鉴权和 session 工作目录。

## 3. 运行链路

```text
Agent 节点确认本轮需要 sandbox
  -> 读取当前逻辑实例和目标 runtime image
  -> repository + tag 一致或无实例
       -> 发送 sandboxStatus: lazyInit
       -> ensureAgentSandboxRuntime
  -> 镜像不一致
       -> 发送 sandboxStatus: upgradeRequired
       -> 抛出受控 runtimeUpgradeRequired 错误
       -> ChatBox 展示升级弹窗
  -> 已处于归档/迁移过程
       -> 发送 sandboxStatus: upgrading
       -> ChatBox 展示进行中状态并轮询
```

用户确认升级后的链路：

```text
POST /core/ai/sandbox/runtime/upgrade
  -> 复用 runtime archive 状态机启动后台归档
  -> 前端轮询 POST /core/ai/sandbox/runtime/getStatus
  -> archived 被解释为 ready
  -> 关闭弹窗，用户重试当前轮次
  -> 正常 runtime 使用当前镜像恢复 workspace
```

## 4. 服务端设计

### 4.1 通用 runtime upgrade service

在 Sandbox application/runtime 内抽取：

- 镜像字符串和对象的标准化。
- `repository + tag` 匹配。
- 生命周期状态到 `readyToInit | upgradeRequired | upgrading` 的统一解释。
- 用户触发归档的统一入口。
- 当前 provider runtime image 的解析。
- App 与 Skill 都按 source 一次查询 `sandbox-instance`，由同一个 resolver 选择当前或旧
  provider 的状态实例和可归档实例。

Skill Edit 保留 Skill/version 查询和 init 编排，只把通用镜像升级判断交给该 service。
对外状态响应只保留 `status` 和可选 `lastError`；是否轮询、是否允许确认升级均由
`status` 派生，不暴露内部 archive phase。

### 4.2 Agent 执行边界

在 Agent 节点已经计算 `effectiveUseAgentSandbox` 后、发送 `lazyInit` 前调用通用状态服务。
该位置同时具备以下条件：

- 已经知道本轮是否真实需要 sandbox。
- 已经解析有效 `uid`、App source 和物理 sandboxId。
- 尚未恢复、创建或连接旧实例。
- 可以通过当前 workflow SSE 返回结构化状态。

### 4.3 实例镜像持久化

- 首次 provisioning 时写入当前 runtime image。
- 归档恢复完成并发布为 running 时写入本次恢复使用的 runtime image。
- 普通 touch running 不覆盖镜像，避免在一致性检查前抹掉旧镜像证据。
- 历史实例缺失 `metadata.image` 时按不匹配处理，首次使用会要求升级。

### 4.4 API 与权限

新增：

- `POST /api/core/ai/sandbox/runtime/getStatus`
- `POST /api/core/ai/sandbox/runtime/upgrade`

接口复用标准 sandbox chat target、`authSandboxSession` 和 effective uid。App 分享链接用户升级的是
自己的用户级 sandbox，不修改 App 配置，因此沿用会话使用权限，不要求 App 编辑权限。

所有接口使用 Zod schema、`parseApiInput` 和响应 schema 校验，并登记 OpenAPI path。

## 5. 前端设计

- 扩展 `SandboxStatusPhase`：`upgradeRequired`、`upgrading`。
- 升级状态事件携带完整 runtime status，避免 ChatBox 收到事件后再做一次初始状态请求。
- `useChatGenerate` 在提交 sandbox 状态事件前通知 ChatBox runtime upgrade hook。
- runtime upgrade hook 负责确认升级、轮询、错误状态和目标切换清理。
- 把 Skill 当前弹窗 UI 抽成共享组件；Skill 保持退出语义，App 使用关闭语义。
- App 收到升级状态后的本轮请求按普通服务端错误结束并保留记录，升级完成后由用户点击现有重试操作。

## 6. 并发与边界

- 多个标签页同时确认升级时，归档状态机和 lifecycle lease 保证只有一个任务推进；其他请求进入轮询。
- 归档中、provider 迁移中、恢复中等过渡态统一返回 `upgrading`，前端不重复触发操作。
- archived 表示 workspace 已安全落到归档，可以返回 `ready`；下一次真实使用由现有恢复链路创建当前镜像实例。
- 页面切换 App、chat 或 outlink 身份时清理 modal 和轮询计时器，旧请求不得更新新目标。
- Skill Edit debug chat 不走 App 的 SSE 弹窗链路，继续使用 Skill detail 自身的状态机。

## 7. TODO

- [x] 抽取 runtime image 和 upgrade status 通用服务。
- [x] 让 Skill Edit runtime 复用通用服务。
- [x] 首次创建与归档恢复写入 `metadata.image`。
- [x] 增加通用 runtime status schema、错误码和 sandboxStatus phase。
- [x] 在 App Agent sandbox 启动状态前执行镜像检查并发送 SSE。
- [x] 增加 App runtime getStatus/upgrade API 与 OpenAPI 文档。
- [x] 抽取共享升级弹窗并接入 Skill/App。
- [x] 增加 ChatBox 升级状态 hook、轮询和目标切换清理。
- [x] 补充 runtime service、Agent 编排、API/前端关键状态测试。
- [x] 运行局部测试、类型检查及最终相关测试。

## 8. 复用收敛重构

首版实现已经形成完整链路，但 App 与 Skill 仍分别维护前端升级轮询，同时
App 调用方需要自行组装 runtime context 再解释状态。本轮重构只收敛复用边界，
不改变触发时机、镜像比较规则、权限或用户交互。

收敛方案：

- App 与 Skill 共用同一个 `SandboxRuntimeStatusResponse`，统一使用 `readyToInit` 表示
  升级阻断已解除；Skill 不再维护同构 schema 和映射函数。
- App 与 Skill 共用 sandbox-instance source 查询和实例选择规则，不再分别查询当前/旧
  provider 或维护 Skill 私有选择函数。
- runtime service 对 App 暴露直接的状态查询与升级函数，Agent/API 不再组装
  中间 context。
- 抽取 App/Skill 共用的前端 runtime upgrade controller hook，统一负责状态应用、
  升级触发、轮询、并发升级和 target 切换清理。
- Skill context 只保留 sandbox init SSE 和日志；App Chat hook 只保留请求目标与弹窗文案。
- 删除只覆盖已删适配层或重复包装的测试，保留纯状态解释、实例查询、
  Agent 阻断、API 鉴权和镜像持久化覆盖。

重构 TODO：

- [x] 统一 App/Skill runtime status schema 与服务返回类型。
- [x] 收敛 App runtime service 高层入口和调用方。
- [x] 抽取并接入共享前端升级控制 hook。
- [x] 统一 sandbox-instance source 查询与实例选择规则。
- [x] 删除无用适配、派生状态、内部 archive phase 和重复测试。
- [x] 完成局部测试、类型检查与最终回归。
