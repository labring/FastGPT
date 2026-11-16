---
case_version: 1
id: "FG-ADMIN-CONFIG-001"
title: "实例配置 API：版本边界、脱敏与原子保存"
business: "admin/configuration"
types:
  - "api"
  - "integration"
category: "boundary"
scenario: "special"
priority: "P0"
status: "ready"
tags:
  - "instance-config"
  - "admin-api"
  - "edition-boundary"
  - "secret-status"
  - "optimistic-lock"
  - "atomic-save"
  - "覆盖基础场景"
  - "覆盖异常场景"
  - "覆盖边界场景"
evidence:
  - "response"
  - "database"
sources:
  - "packages/global/openapi/admin/system/instanceConfig/api.ts"
  - "packages/global/openapi/admin/system/instanceConfig/probe.ts"
  - "projects/app/src/pages/api/admin/system/config/get.ts"
  - "projects/app/src/pages/api/admin/system/config/update.ts"
  - "projects/app/src/pages/api/admin/system/config/probe.ts"
  - "packages/service/common/system/systemInstanceConfig/controller.ts"
  - "packages/service/common/system/systemInstanceConfig/secrets.ts"
  - "packages/service/common/system/systemInstanceConfig/schema.ts"
  - "packages/global/common/system/config/scopes.ts"
  - ".agents/design/common/admin-instance-config-env-boundary.md"
  - "packages/service/common/system/systemInstanceConfig/probe.ts"
  - "packages/global/common/system/config/permission.ts"
  - "packages/global/common/system/config/registry.ts"
  - "packages/global/common/system/config/schema.ts"
  - "packages/service/common/s3/config/utils.ts"
  - "packages/service/common/http/entry.ts"
  - "packages/service/common/http/apiError.ts"
  - "projects/app/test/api/admin/system/config/update.test.ts"
  - "projects/app/test/api/admin/system/config/update.editionBoundary.test.ts"
  - "packages/service/test/common/system/systemInstanceConfig/controller.test.ts"
routes:
  - "GET /api/admin/system/config/get"
  - "POST /api/admin/system/config/update"
  - "POST /api/admin/system/config/probe"
related:
  - "FG-ADMIN-CONFIG-002"
  - "FG-ADMIN-MAINTENANCE-002"
baseline: "afc92e5f5d8cd3978e5d3865a5770119e00908da"
---

# 实例配置 API：版本边界、脱敏与原子保存

## 用例简介

管理员通过统一 API 读取和保存 11 个配置域，需要同时保证 root 鉴权、社区版字段边界、敏感值不回传与加密存储、乐观锁和跨域事务原子性。本例还检查连通性探测不会把“有 HTTP 响应但非 2xx”误判为网络失败，并验证注册字段的保存与回读。

## 前置准备

- 环境与版本：准备同 commit 的两个部署状态，A 不设置 `PRO_URL`（社区版），B 设置 `PRO_URL`（商业版）。API 的版本判定只看 `PRO_URL`，不要求 License 已激活；无法切换/准备两种状态时仅 C7 的版本对照阻塞。除 C7 的社区版对照外，其余涉及品牌、账号或套餐的场景使用 B；也可在独占实例按顺序切换部署版本并分别重启验证，不要求同时启动两套服务。记录 `BASE_URL`、App/Pro 实际 commit、存储 vendor（MinIO/R2/其他）、`STORAGE_EXTERNAL_ENDPOINT` 是否存在，不在文档保存真实凭证。
- 身份与权限：root 账号用于成功路径；一个用户名不是 `root` 的管理员或普通成员用于越权路径。root 与普通成员使用各自的真实登录态，不复用他人 Cookie。
- 基线 D0：使用本轮明确授权、无其他配置写者的 dev 实例，不新建测试数据库；4.18 迁移已完成。记录 `system_instance_configs` 当前全部 scope 文档：11 个管理域以及 proEnv/license/instanceId/modelStatusProbe/moderationPolicy/operations，缺失 scope 保留为缺失，不为凑数写入。快照完整 BSON、各管理域 API 结果、`commercial.overrides.subPlans` 和旧 `systemconfigs` 只读对照；套餐权威来源是 commercial，旧集合不再写入。快照加密保存，报告不得包含原始密钥。执行 C1 时使用单独的可销毁隔离夹具：在已完成迁移且无其他写者的隔离库中，按快照的 `_id`、revision 和原文档精确匹配移除 `site` 文档，读后恢复该文档；不得对共享业务库执行此夹具操作。
- 测试夹具：providers 域写入仅用于本轮的测试密钥；C5a 先通过 API 将该密钥清空；密钥只在进程内比较，DB 中检查 `{secret: cipher}` 包装及解密后的等值结果，不输出 cipher 或明文。准备合法与非法 `subPlans` 各一份、可控本机服务（分别返回 200/404/500 和延迟超过 500ms）、一个关闭端口、一个 `file://` URL。所有站点、域名、账号和文件标识带本次 run 前缀。
- 复位约定：各子场景使用自己的最新 revision；C6b/C6c 承接 C6a 的成功结果，其他子场景从 D0 生效值开始。测试和断言只能通过真实 API 和只读查询完成；仅在经授权的隔离库中，恢复阶段使用已加密的快照，对本轮状态做全 BSON 比对后以事务和 CAS 恢复原始字段（revision 单调递增、`updatedAt` 更新），不覆盖其他写入。套餐场景恢复同一 commercial 文档的原始 subPlans；恢复后核对 11 域、套餐和运行时刷新。若写请求结果未知或恢复无法确认，保留锁与快照，禁止盲目重试或继续下一场景。
- 验证能力：HTTP 客户端保存每次请求的 method、HTTP status、响应 body（`code`、`message/statusText`、`data`）、响应头 `x-request-id` 和请求时间；Mongo 只读连接按本次 domain/revision 查询；服务日志按 requestId 和时间窗检索。
- 场景条件：C6c/C8 的 MinIO 变体需要 `STORAGE_VENDOR=minio`，C8 的 R2 变体需要独立 R2 环境；缺少某个环境时仅阻塞相应变体。C11 使用商业版环境。C12 的字段集合以目标版本的 registry 为准，构造两组合规的合成值 A/B；`showOpenaiAccount`、`auth.fastLogin`、`providers.externalProviderWorkflowVariables` 只允许延续已有非空/已开启配置，若要覆盖其编辑/关闭变体，必须在本轮可恢复的历史夹具中预置并记录原状态，不能通过 API 重新启用。缺少历史夹具时仅阻塞这些变体，不删除字段或把重新启用拒绝当保存失败。地址只指向本轮受控服务，不使用真实第三方凭据。
- 执行入口：本例尚无关联的完整 Node 自动化，全部子场景由 AI 通过真实 HTTP 与只读 Mongo 查询执行。缺失 site 文档、历史弃用项和 BSON 恢复仅在可销毁或可精确恢复的授权夹具执行；没有安全夹具时对应变体阻塞，其他场景继续。

## 测试步骤

| 子场景 | 类型与起始状态 | 输入与操作 |
| --- | --- | --- |
| C1 | 基础；无 site 文档的隔离实例 | 以 root 调用 `GET /api/admin/system/config/get?domain=site`，记录响应；再查询 DB 确认该 domain 是否仍无文档。 |
| C2 | 基础；providers 测试密钥已写入 | root 读取 `domain=providers`，记录 `overrides`、`effectiveConfig`、`secretKeys/configuredSecretKeys`；同时用只读 DB 查询确认库内原始值。 |
| C3 | 异常；D0 | 用非 root 会话分别调用 get、update、probe，分别保存响应；再查 DB revision。 |
| C4 | 基础；site revision=r | root 保存 `{name:"RUN-SITE"}`，并特意提交一个等于内置默认值的字段（如 `docUrl` 默认值）；记录响应与 DB 文档。 |
| C5 | 边界；providers 无既有密钥 / 有既有密钥 | 5a：首次保存 `documentParse.customPdf.key:"******"`，读取配置状态并在内存核对解密值。5b：先保存本轮合成密钥，只改 `documentParse.customPdf.url` 并省略 key；再显式提交 key 为 `"******"` 替换，最后提交 `key:""` 清空。逐步读取状态、DB 包装和 revision。 |
| C6 | 基础/异常；site、resource、storage 均为 D0，MinIO | 6a：以正确 revision 一次提交 site 的 name/description 和 resource 的 maxFolderDepth/uploadFileMaxSize。6b：承接 6a，用当前 site revision 和过期 resource revision 提交不同值。6c：继续以当前 revision 一次提交 site 和 storage；storage 设置 `downloadMode=short-redirect` 且 externalEndpoint、cdnEndpoint 均为空。每次检查 11 域与套餐快照。 |
| C7 | 边界；社区版/商业版各一状态 | 社区版 root 读取 auth，记录返回字段和 `secretKeys`；再提交 `loginProviders.email.register=true`，以及一个带 `subPlans:{}` 和当前 commercial `subPlansExpectedRevision` 的合法 `site.publicUrl` 更新。商业版重复读取 auth，并分别保存同一 Pro 字段和 `subPlans`。 |
| C8 | 边界；MinIO，或 R2 的独立环境 | 在 storage 域分别提交：MinIO `downloadMode=short-redirect` 且 externalEndpoint 为空；配置 cdnEndpoint 但 externalEndpoint 为空；R2 配置 cdnEndpoint；最后提交带非空 externalEndpoint 的 MinIO short-redirect。每次保存后查 revision。 |
| C9 | 边界；本机测试服务 | root 依次探测可达 200、可达 404、可达 500、关闭端口、`file:///etc/passwd`、超时 500ms 的可控慢服务；用非 root 再探测一次；记录 `connected/status/error`。 |
| C10 | 异常；D0 | root 提交 `items: []`、非法 domain、负 expectedRevision、旧 `auth.teamMode`、非法 `site.publicUrl`（空值、非 HTTP(S)、含凭据/query/hash）、密钥传入 `{secret:"..."}` 对象、`timeoutMs=100` 的 probe body，分别记录入口响应。 |
| C11 | 基础/异常；商业版 D0 | 使用 site 的当前 revision 和 commercial 的当前 revision（作为 `subPlansExpectedRevision`）分别提交两次：先提交 `{extraPointsPackages:[{points:"not-a-number",month:1,price:1}]}`，再提交 `{extraDatasetSizePrice:5,extraPointsPackages:[{points:1000,month:12,price:10}]}`；每次同时提交不同的合法 site name，并检查配置域与套餐文档。 |
| C12 | 边界；商业版 D0 | 根据当前 registry 为各可修改字段准备两组合法合成值 A/B（历史退役字段依前置夹具，固定值不要求伪造差异）；每组以 11 域当前 revision 一次调用 update（commercial.subPlans 仍走 C11 的专用输入，不塞入 overrides），随后逐域 GET 并只读查询 Mongo，逐字段比较 A/B 与实际值，敏感字段仅在内存比较明文。完整记录字段集合、每字段布尔结果及恢复结果。 |

## 预期结果

公共断言：所有成功响应均为 HTTP 200、`code=200`，业务数据位于 `data`；所有写请求必须由 root 完成。任何冲突、版本边界或校验拒绝都不得产生部分 domain 写入，revision 只能随成功提交递增。响应和日志不得出现真实密钥；`GET` 不得用环境变量补齐已迁移字段。敏感叶子在 GET/保存响应的 overrides、effectiveConfig 中完全省略；secretKeys 表示允许访问的敏感路径，configuredSecretKeys 仅表示非空凭据已配置。省略密钥保留原值，字符串替换（含字面量 `******`），空字符串清空；非空凭据持久化为 `{secret: cipher}`，不能以明文落库。

| 子场景 | 验证方式 | 特有预期 | 证据获取方式 |
| --- | --- | --- | --- |
| C1 | API + DB | `data.domain=site`、`data.revision=0`、`data.overrides={}`，`effectiveConfig` 等于按部署版本过滤的内置默认值；`secretKeys/configuredSecretKeys` 不含无关域字段；`updatedAt/updatedBy` 缺失。 | 脱敏 GET 响应、移除/读取/恢复的 site 精确查询与夹具记录。 |
| C2 | API + DB | `overrides` 与 `effectiveConfig` 均不存在敏感叶子；`secretKeys` 和 `configuredSecretKeys` 含 `documentParse.customPdf.key`；DB 非空凭据是仅含 secret 的加密包装，进程内解密与测试密钥相等，读取不改写 BSON/revision。 | 脱敏 GET、secret 路径集合、加密形态及内存等值布尔结果、读取前后 BSON 比较。 |
| C3 | API + DB | 三个入口均被拒绝，返回未授权/禁止访问语义；DB revision 与 overrides 完全不变；不得出现仅有 HTTP 200 但 `data` 为空的假成功。 | 三条拒绝响应、操作者角色及全部 scope 的前后差集。 |
| C4 | API + DB | 响应 `data.results[0].revision=r+1`；`effectiveConfig.name=RUN-SITE`，默认字段仍为默认值；DB overrides 不冗余保存等于默认值的字段，`explicitDefaultPaths` 记录被显式提交的默认值路径（若该字段被剪枝）。 | update/GET 响应、site revision/overrides/explicitDefaultPaths 查询。 |
| C5 | API + DB | 5a：字面量 `******` 被当成真实新凭据加密保存，configuredSecretKeys 包含该路径。5b：省略 key 时原密文保持、URL 更新；显式提交 `******` 后解密值为该字面量；显式空串后该路径不在 configuredSecretKeys，生效为空串，DB 可被默认值剪枝且 explicitDefaultPaths 保留清空意图。每次成功 revision+1，响应始终不回传密钥叶子。 | 各次脱敏请求/响应、密文保持及解密等值布尔结果、清空标记与 revision。 |
| C6 | API + DB | 6a 两域四字段均为提交值、各 revision+1，响应按提交顺序返回两域，其余九域和套餐快照不变。6b 返回 HTTP/业务 409；6c 返回 HTTP/业务 400；两次拒绝后 11 域 BSON 与套餐快照均不变。 | 每次事务响应、提交前后全部 scope 与旧 systemconfigs 的精确差集。 |
| C7 | API + DB | 社区版 GET 过滤掉商业字段及对应 secretKeys/configuredSecretKeys；POST Pro 字段返回 403，message 包含越界字段路径（至少 `loginProviders.email.register`）；POST 带 `subPlans`（含空对象）同样返回 403 且在任何读取/写入前拒绝，site revision 不变；Agent Sandbox 等 all 字段仍可读写。商业版 GET 返回该非敏感字段，POST 与 subPlans 保存成功，commercial 内的套餐和 revision 按预期更新，旧 systemconfigs 不写入。 | 两部署状态、允许字段/敏感路径集合、拒绝与成功响应、commercial/site 查询。 |
| C8 | API + DB | 三类非法组合均返回 HTTP/业务 400 且 storage revision 不变：MinIO short-redirect 无 externalEndpoint、CDN 无 externalEndpoint、R2 配 CDN。合法组合成功并保存 `downloadMode/externalEndpoint`。 | 各 vendor 配置摘要、update 响应、storage revision 前后查询。 |
| C9 | API | 通用探测的 200/404/500 均返回 `connected=true` 且 status 对应；关闭端口返回 `connected=false` 和非空 error；`file://` 返回 `connected=false` 且 error 含 “Only HTTP and HTTPS”；500ms 慢服务返回 `connected=false`、`errorCode=timeout`；非 root 被拒绝；probe 不因内部地址被 SSRF 拦截。 | 各探测响应、受控服务路径/请求计数及超时耗时。 |
| C10 | API | 上述非法输入均由入参校验拒绝（400 语义），不得进入业务写入；DB revision 不变。 | 每个非法输入的脱敏响应、DB/revision 不变的精确差集。 |
| C11 | API + DB | 非法套餐返回 HTTP/业务 400，所有域与套餐文档不变。合法套餐与 site 修改同一事务成功：site 与 commercial revision 各加一，返回结果只包含请求的 site；同一 commercial 文档的 `overrides.subPlans.extraDatasetSize.price=5`，`overrides.subPlans.extraPoints.packages` 为提交的积分包数组，不保留对应扁平键，不新增旧 systemconfigs 文档；subPlans 是整表替换，省略专用输入时保留原值，不能按对象补丁残留旧权益。 | 失败/成功事务响应、commercial.subPlans 及 site 的前后查询、旧集合不变对照。 |
| C12 | API + DB | A、B 两轮每次全部 11 域 revision 各加一；registry 每个已具备夹具字段的非敏感 GET 生效值和由 Mongo 文档解密还原的生效值均匹配合成输入；非空敏感值在 API 完全省略，仅状态路径与预期一致，DB 加密且进程内解密比对一致。退役字段按已记录的历史初态验证，未具备夹具的变体明确阻塞；六个非管理 scope 和旧 systemconfigs 不变。快照恢复后除 revision 和 `updatedAt` 外 11 域原始字段完全一致。此项只证明保存、脱敏与回读，不代表全部运行时消费、重载或重启路径已验证。 | registry 字段覆盖清单、每字段等值布尔结果、辅助 scope/旧集合差集与恢复校验。 |
