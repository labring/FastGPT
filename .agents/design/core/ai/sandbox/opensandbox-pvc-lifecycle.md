# OpenSandbox 生命周期问题与设计

状态：已完成

最后核对：2026-08-06

本文统一维护 OpenSandbox Provider 的专项生命周期设计，包括 Kubernetes PVC generation 收敛和
原生 pause/resume 迁移。

## 定论

OpenSandbox 的 Kubernetes 归档链路存在真实竞态，但不是两个同名 PVC 会同时存在。旧 PVC
处于 `Terminating` 时，Kubernetes 不会让引用它的新 Pod 正常运行；PVC 对象删除也不等于
PV、VolumeAttachment 或存储后端已经完成卸载。

原实现把 DELETE 的 2xx 当作删除完成、把任意 GET 200 当作可用 PVC，并在 lifecycle lease 外
预取 restore volume 配置，因此可能过早发布 `archived` 或把正在删除的 claim 带入恢复。

## 目标与边界

- 删除完成条件与 PVC API 对象生命周期一致，避免同名 PVC generation 竞态。
- restore 获取 volume 配置必须发生在 Sandbox lifecycle lease 和 operation claim 之后。
- archive 的 Provider 删除、volume 删除分别持久化 checkpoint，支持中断后恢复。
- Kubernetes PVC generation 生命周期处理不改变 Docker 的删除完成语义。
- 当前只保证 PVC API generation 结束，不承诺底层存储 detach/unmount 已完成；若未来复用静态
  PV 或后端卷，需要增加 provider-specific 完成条件。

## 核心不变量

1. `remove()` 返回时，调用开始时锁定的 PVC UID 已消失或已被新 UID 替换。
2. DELETE 携带 UID precondition，不能误删 GET 之后新建的同名 PVC。
3. `ensure()` 不返回带 `deletionTimestamp` 的 PVC。
4. 并发 ensure 通过 Kubernetes API 的 404/409/UID 状态收敛，不依赖进程内锁。
5. restore 在 lease 内、claim 成功后获取 volume，并复用本次实际配置。
6. archive 只有完成 Provider 和 volume 两个 checkpoint 后才进入 `archived`。

## 实现方案

### K8s volume-manager

只读取 `metadata.uid` 和 `metadata.deletionTimestamp`，统一转换为 `absent`、`active(uid)`、
`deleting(uid)`。

`ensure`：活动 PVC 直接复用；删除中的 PVC 等待目标 UID 消失或被替换后重新读取；不存在时
创建，201 返回成功，409 退避后重读，其他错误立即失败。

`remove`：不存在幂等成功；删除中的 PVC 等待目标 UID 结束；活动 PVC 使用 UID precondition
删除，并等待目标 UID 消失或被替换。默认最长等待 5 分钟、轮询间隔 500 毫秒，超时交给上层
durable lifecycle 记录失败并重试。

### Sandbox 生命周期

archive 阶段：

```text
claimed -> archiveUploaded -> providerDeleted -> volumeDeleted -> archived
```

- `providerDeleted` 只删除 Provider。
- `volumeDeleted` 删除并等待 OpenSandbox volume；其他 Provider 通过空操作完成该 checkpoint。
- 旧 operation 停在 `providerDeleted` 时，重试会继续 volume 删除，不重放归档上传。

restore 不再在调用 restore 前预取 volume。创建恢复 Sandbox 的 step 在 lease、状态重读和
operation claim 完成后调用 `getSessionVolumeConfig()`；恢复函数返回实际 `VolumeManagerResult`，
runtime client 直接复用。若恢复没有执行创建 step，再在外层获取当前配置。

## 兼容性

- volume HTTP API 从 `sessionId` 切换为 app 预先持久化的 `claimName`；FastGPT app
  与 volume-manager 按同一版本整体升级，不支持混用版本。
- `DockerVolumeDriver` 不执行 Kubernetes 状态解析、轮询或 UID precondition。
- Sandbox application 只对 `opensandbox` 使用 volume-manager；Docker 不产生额外 volume 请求。

## 验证

- volume-manager 与 Sandbox service 相关测试通过；TypeScript、构建和格式检查通过。
- 变更通过 ESLint、Prettier 和 `git diff --check`。

## Review 补充设计

### 发布边界

- FastGPT app 与 volume-manager 按同一版本同步升级，`claimName` HTTP 合同不增加旧版
  `sessionId` 兼容层。
- compose、Helm、环境变量模板和中英文部署文档必须与新合同同步更新。旧的
  `VM_VOLUME_NAME_PREFIX` 配置需以原值迁移到
  `AGENT_SANDBOX_OPENSANDBOX_VOLUME_NAME_PREFIX`。

### 运行态 storage 并发保护

running 快路径只能在 Mongo 中的 storage 与 client 预读 storage 一致时刷新活跃时间，并且不能
通过 touch 回写 storage。若 CAS 失败，必须进入 lifecycle lease，在锁内重读实例，并以当前已提交的
workspace claim 重建 OpenSandbox provider。这样旧 client 既不能覆盖 restore 提交的新 generation，
也不能继续用旧 generation 自愈远端资源。

### 旧迁移 checkpoint 恢复

旧版本可能停在 `legacyMigrating/targetEnsured`，但尚未把旧确定性 volume 名写入 storage。新版本
检测到该 checkpoint 且缺少 workspace claim 时，按旧命名规则恢复 claim，并以同阶段 CAS 原子补写
storage，再继续安装归档。`claimed` 阶段仍使用 generation `0` 的新命名规则。

### 镜像环境变量

`AGENT_SANDBOX_OPENSANDBOX_IMAGE` 是 OpenSandbox 唯一的运行态镜像配置入口，必须配置完整镜像地址（包括
tag）。`AGENT_SANDBOX_OPENSANDBOX_IMAGE_REPO` 和 `AGENT_SANDBOX_OPENSANDBOX_IMAGE_TAG` 已移除，不再作为
兼容回退；启用 `opensandbox` 时缺少完整镜像变量必须阻止服务启动。

### volume 删除边界

- `claimName` 由 app 生成并持久化，volume-manager 不恢复 `VM_VOLUME_NAME_PREFIX` 配置，也不参与
  命名或资源归属判断。
- `volumeNamePrefix` 只用于生成新 generation 的 `claimName`；删除时直接使用 Mongo 中持久化的
  完整 `claimName`，不依赖当前 prefix 配置。这样配置变更不会阻断旧 PVC 的清理。
- Kubernetes 和 Docker driver 不写入或检查 managed label，只保留名称合法性、幂等删除以及
  Kubernetes UID precondition 等底层资源生命周期约束。

## TODO

- [x] running touch 使用 storage CAS，并在 lease 内按最新 storage 重建 provider。
- [x] 修复旧 `targetEnsured` checkpoint 缺少 storage 的恢复路径。
- [x] 增加 OpenSandbox 新旧镜像环境变量兼容层。
- [x] 删除调用使用 Mongo 持久化的完整 claimName，不依赖当前 volume name prefix。
- [x] 补齐并运行上述并发、兼容和权限边界单元测试。
- [x] 运行最终全量测试、构建和差异检查。

## Stop 生命周期迁移

### 背景

FastGPT 的统一 Sandbox 合同已经区分 `stop()` 和 `delete()`，但迁移前 OpenSandbox adapter 的
`stop()` 直接调用 `delete()`。这会终止远端 Sandbox，后续启动只能使用同一份外部 workspace
重新创建一个新 Sandbox，无法利用 OpenSandbox 原生 pause/resume 生命周期。

本次迁移不保留旧行为或回退分支。OpenSandbox 不支持 pause 时，`stop()` 应明确失败，不能退回
delete。

### SDK 调研结论

当前依赖 `@alibaba-group/opensandbox@0.1.10` 已提供完整接口：

- 已绑定客户端使用 `Sandbox.pause()`。
- 未绑定资源使用 `SandboxManager.pauseSandbox(sandboxId)`。
- 恢复使用 `Sandbox.resume(...)`，并返回新的已连接客户端。
- 永久终止使用 `Sandbox.kill()` 或 `SandboxManager.killSandbox(sandboxId)`。

OpenSandbox 的 pause 是异步操作，状态从 `Running` 经过 `Pausing` 到 `Paused`；delete/kill 则进入
终止状态。官方 JavaScript SDK 文档和 Lifecycle API 对两者做了明确区分：

- https://open-sandbox.ai/sdks/javascript
- https://open-sandbox.ai/api/

最新 JavaScript SDK `0.1.11` 的发布内容与 pause/resume 无关，因此本次迁移不附带依赖升级。

### 目标与边界

- FastGPT `stop()` 对 OpenSandbox 映射为 SDK pause，并等待远端进入 `Paused`。
- FastGPT `start()`/`ensureRunning()` 恢复同一个 OpenSandbox ID。
- FastGPT `delete()` 继续永久删除远端资源。
- 删除所有“OpenSandbox stop 等价于 delete”的实现、文档、测试命名和断言。
- 不保留 pause 失败后 delete、Paused 时重建新资源等兼容行为。
- 不改变 service 的 provider 无关状态机，也不改变归档时的 provider/volume 永久删除流程。

### 核心不变量

1. `stop()` 成功后，远端资源状态为 `Paused`，不是 `Deleted`/`UnExist`。
2. stop 后重新 `ensureRunning()`，远端 Sandbox ID 保持不变。
3. `delete()` 是唯一允许 adapter 主动调用 `kill`/`killSandbox` 的生命周期入口。
4. `stop()` 可幂等重放：`Running` 发起 pause，`Pausing` 等待，`Paused` 直接成功。
5. pause 完成后释放旧 exec 客户端；resume 必须获取 SDK 返回的新客户端。
6. pause 不支持或失败时向上抛错，由 durable lifecycle 保留失败 operation，不能降级为 delete。

### 实现方案

OpenSandbox lifecycle 增加独立 stop 状态收敛：

```text
Running  -> pause -> Pausing -> Paused -> release local client
Pausing  ---------- wait ----> Paused -> release local client
Paused   ------------------------------> release local client
```

未绑定客户端时通过稳定的 `sessionId` 查询远端资源，再使用 manager 发起 pause。已绑定客户端时先
读取实时状态，再使用实例方法发起 pause。pause 请求失败时直接向上抛错，由 durable lifecycle
重试；重试时若远端已进入 `Pausing` 或 `Paused`，则按幂等状态继续收敛。

stop 使用 10 分钟状态收敛窗口。Kubernetes rootfs snapshot 通常需要 1–5 分钟；该窗口同时小于
service 的 11 分钟 lifecycle lease，避免正常 snapshot 被通用 2 分钟等待窗口提前判为失败。

资源已经不存在时沿用生命周期幂等清理语义，stop 不创建替代资源；其他错误向上抛出。

### 部署约束

- Docker runtime 原生使用容器 pause/resume，不需要额外 registry。
- Kubernetes runtime 通过 rootfs snapshot 实现 pause/resume，必须为 OpenSandbox controller 配置
  snapshot registry、push secret 和 resume pull secret。官方说明：
  https://open-sandbox.ai/kubernetes/
- FastGPT Helm chart 已允许通过 `controllerManager.extraArgs` 传递这些 controller 参数。本次不
  增加静默默认值，因为 registry 地址和凭据必须由部署方明确提供。

### 验证

- 单元测试覆盖 bound/unbound、Running/Pausing/Paused、同 ID resume 和永久 delete。
- 集成测试断言 stop 后为 `Stopped`，再次 ensure 后仍为原 Sandbox ID。
- `pnpm -C sdk/sandbox-adapter test`：64 个测试通过，9 个集成测试按环境跳过。
- `pnpm -C sdk/sandbox-adapter build`：通过。
- service sandbox 定向测试：3 个文件、29 个测试通过。
- `pnpm test`：4 个 workspace 全部通过；service 3704 个测试通过、22 个跳过，admin 397
  个测试通过，其余 workspace 使用 Turbo 缓存的成功结果。
- Prettier 与 `git diff --check`：通过。

### Stop 迁移 TODO

- [x] 核对当前 SDK、最新 SDK 发布内容和官方生命周期语义。
- [x] 实现 OpenSandbox 原生 pause stop，并保证重试幂等。
- [x] 清理旧 delete stop 契约、README 和测试语义。
- [x] 运行定向测试和 sandbox-adapter build。
- [x] 运行最终全量测试与差异检查。
