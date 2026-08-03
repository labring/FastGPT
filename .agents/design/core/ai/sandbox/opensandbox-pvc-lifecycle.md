# OpenSandbox Kubernetes PVC 生命周期问题与设计

状态：已完成

最后核对：2026-08-04

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

- `IVolumeDriver` 和 volume HTTP API 不变。
- `DockerVolumeDriver` 不执行 Kubernetes 状态解析、轮询或 UID precondition。
- Sandbox application 只对 `opensandbox` 使用 volume-manager；Docker 不产生额外 volume 请求。

## 验证

- volume-manager 与 Sandbox service 相关测试通过；TypeScript、构建和格式检查通过。
- 变更通过 ESLint、Prettier 和 `git diff --check`。

## Review 补充设计

### 发布边界

- FastGPT app 与 volume-manager 按同一版本同步升级，`claimName` HTTP 合同不增加旧版
  `sessionId` 兼容层。
- 本轮不修改已有 compose、Helm、环境变量模板或部署文档；这些发布物由后续发布流程统一处理。

### 运行态 storage 并发保护

running 快路径只能在 Mongo 中的 storage 与 client 预读 storage 一致时刷新活跃时间，并且不能
通过 touch 回写 storage。若 CAS 失败，必须进入 lifecycle lease，在锁内重读实例，并以当前已提交的
workspace claim 重建 OpenSandbox provider。这样旧 client 既不能覆盖 restore 提交的新 generation，
也不能继续用旧 generation 自愈远端资源。

### 旧迁移 checkpoint 恢复

旧版本可能停在 `legacyMigrating/targetEnsured`，但尚未把旧确定性 volume 名写入 storage。新版本
检测到该 checkpoint 且缺少 workspace claim 时，按旧命名规则恢复 claim，并以同阶段 CAS 原子补写
storage，再继续安装归档。`claimed` 阶段仍使用 generation `0` 的新命名规则。

### 镜像环境变量兼容

`AGENT_SANDBOX_OPENSANDBOX_IMAGE` 是新配置入口；未配置时回退到旧的
`AGENT_SANDBOX_OPENSANDBOX_IMAGE_REPO` 和 `AGENT_SANDBOX_OPENSANDBOX_IMAGE_TAG`。
新变量优先，旧 tag 缺失时沿用 `latest`。只有新旧入口都没有可用 repository 时才报告缺失。

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
