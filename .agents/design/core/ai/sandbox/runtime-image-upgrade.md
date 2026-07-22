# App Sandbox Runtime 镜像升级设计

状态：已完成

最后更新：2026-07-22

## 1. 目标与范围

App Chat 和 Skill Edit runtime 在真正使用 sandbox 前比较目标镜像与实例记录中的镜像，避免镜像升级后继续连接旧实例。升级通过现有归档与恢复链路保存完整 workspace，并在下一次初始化时使用当前镜像恢复。

本设计只处理 runtime 镜像一致性和升级交互，不改变以下边界：

- 物理 App sandbox 身份仍为 `app + effectiveUid`，`chatId` 只决定 session 工作目录和鉴权目标。
- 镜像只比较 `repository + tag`，不比较 digest。
- 仅当 Agent 节点确认本轮 `effectiveUseAgentSandbox=true` 后检查，不在页面进入时预检查。
- 版本数据迁移的发布顺序和 Preview session 容量控制由各自设计处理。

## 2. 产品决策

- 镜像不一致时阻断本轮 Agent sandbox 初始化，通过 `sandboxStatus` SSE 打开升级弹窗。
- 用户确认后归档物理 sandbox；归档包含整个 workspace，包括所有 `sessions/<chatId>`。
- 弹窗保持打开时，升级完成后自动重放原始输入对应的整轮工作流。
- 自动重放可能重复执行 Agent 节点之前已经完成的 webhook、写库或付费工具，这是产品接受的行为边界，不承诺整轮幂等。
- 用户关闭弹窗后，前端必须清空待回放回调、停止轮询，并忽略关闭前发出的在途状态响应。
- 关闭弹窗只取消客户端后续行为；服务端已经抢占成功的归档任务继续执行，避免留下半归档状态。

## 3. 主链路

```text
Agent 节点确认本轮需要 sandbox
  -> 查询同一 source 的实例并解析目标 provider/image
  -> readyToInit
       -> 发送 sandboxStatus: lazyInit
       -> 正常创建、恢复或连接 runtime
  -> upgradeRequired
       -> 发送 sandboxStatus: upgradeRequired
       -> 以受控错误结束本轮请求
       -> 用户确认后触发归档
  -> upgrading
       -> 发送 sandboxStatus: upgrading
       -> 前端展示进度并轮询

归档完成 -> archived 被解释为 readyToInit
  -> 弹窗仍打开：关闭弹窗并自动重放原始输入
  -> 弹窗已关闭：不更新 UI，不自动重放
```

## 4. 服务端设计

### 4.1 实例选择

App 与 Skill 共用 runtime upgrade service：

- 按 `sourceType + sourceId + userId` 一次读取逻辑实例。
- 当前 provider 实例优先作为状态实例。
- 没有当前 provider 实例时，旧 provider 的过渡态、失败态、已归档实例和旧镜像稳定态依次作为状态来源。
- 只有旧镜像的 `running/stopped`，或失败的 `stopping/archiving` 可以成为 runtime upgrade 的归档候选。
- 当前 provider 记录的 `sandboxId` 与目标身份不一致时直接报错，不在错误记录上继续生命周期操作。

### 4.2 状态解释与恢复职责

`getStatus` 只解释状态，不执行创建、恢复、迁移或归档副作用。状态响应统一为 `readyToInit | upgradeRequired | upgrading`，并可携带 `lastError`。

| 实例状态 | 返回状态 | 后续职责 |
| --- | --- | --- |
| 无实例、`archived`、镜像一致的稳定态 | `readyToInit` | 正常 runtime 初始化 |
| 镜像不一致的 `running/stopped` | `upgradeRequired` | 用户确认后启动归档 |
| 活跃 `stopping/archiving` | `upgrading` | 原 operation 或恢复 cron 继续推进 |
| 失败 `stopping/archiving` | `upgradeRequired` + error | stop 先续跑到 `stopped`，archive 从 checkpoint 续跑 |
| `restoring` | 可接管时 `readyToInit`，否则 `upgrading` | 当前 provider 续跑 restore；旧 provider 先回滚半成品再迁移 |
| 当前 provider 的 `provisioning` | 明确失败或心跳超过 15 分钟时 `readyToInit`，否则 `upgrading` | runtime provisioning 使用新 fencing token 接管 |
| 旧 provider 的 `provisioning` | `upgrading` + optional error | runtime upgrade 不越权改写其他 owner 的 operation |
| `deleting/legacyMigrating` | `upgrading` + optional error | source 删除流程或管理员迁移流程恢复 |

`restoring` 的可接管条件与 archive 隔离窗口一致：operation 明确失败、缺少心跳，或心跳超过
45 分钟。`provisioning` 使用自己的 15 分钟隔离窗口；缺少心跳不能被 runtime 自动接管，因为
provisioning owner 同样会拒绝这种记录。Provider 切换在 `archived` 稳定态内原子完成，不产生
独立过渡状态。

### 4.3 升级触发

- 状态不是 `upgradeRequired` 时不执行副作用，直接返回当前状态。
- 失败的 `stopping` 必须先调用 stop owner 完成停止，再启动 archive。
- 失败的 `archiving` 复用 archive checkpoint，不重建独立升级状态机。
- archive claim 失败时重新读取实例并解释真实状态，不能无条件返回 `upgrading`。
- lifecycle lease、operation token 和 Mongo CAS 保证并发确认只由一个执行者推进。

### 4.4 镜像持久化

- 首次 provisioning 创建记录时写入本次实际使用的 runtime image。
- provisioning 发布为 `running` 时再次写入实际 runtime image，覆盖恢复旧 operation 时的历史值。
- archive restore 发布为 `running` 时写入恢复使用的 runtime image。
- 普通 touch running 不覆盖镜像，避免在一致性检查前丢失旧镜像证据。
- 历史实例缺失 `metadata.image` 时按镜像不一致处理。

## 5. 前端设计

- App 与 Skill 共用 `useSandboxRuntimeUpgrade`，统一处理状态应用、升级请求、轮询、错误和目标切换。
- App adapter 只维护聊天目标、弹窗文案和待回放请求；Skill adapter 保留原有退出语义。
- 收到 `upgrading` 后每 3 秒查询状态；收到 `readyToInit` 后停止轮询。
- App 只有在控制器确实经历过升级且弹窗仍属于同一 target 时才执行待回放回调。
- 关闭弹窗或切换 App/chat/outlink 身份时递增请求版本，使旧请求结果失效，并清空 modal、轮询和待回放状态。

## 6. API 与权限

- `POST /api/core/ai/sandbox/runtime/getStatus`
- `POST /api/core/ai/sandbox/runtime/upgrade`

两个接口复用标准 sandbox chat target、`authSandboxSession` 和 effective uid。App 分享链接用户升级自己的用户级 sandbox，不修改 App 配置，因此沿用会话使用权限，不要求 App 编辑权限。接口使用共享 Zod schema、`parseApiInput`、响应 schema 校验，并登记 OpenAPI path。

## 7. 验证清单

- [x] App 与 Skill 复用镜像标准化、实例选择、状态解释和归档触发。
- [x] Agent 在发送 `lazyInit` 前阻断旧镜像。
- [x] 首次创建、provisioning 完成和 archive restore 持久化实际镜像。
- [x] App runtime API、OpenAPI、鉴权和 SSE 状态已接入。
- [x] 升级完成自动重放；关闭弹窗清理回放、轮询和在途响应。
- [x] 失败 stop/archive 可恢复，不可归档状态不会进入通用 archive 循环。
- [x] lifecycle owner 的接管条件与 runtime 状态解释保持一致。
- [x] 保留纯状态、并发 claim、生命周期顺序、镜像持久化和取消在途响应测试；删除重复适配层测试。
