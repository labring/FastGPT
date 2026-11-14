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
  - "secret-mask"
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
baseline: "859856d277bfb69b3000035c373a746837475356"
---

# 实例配置 API：版本边界、脱敏与原子保存

## 用例简介

管理员通过统一 API 读取和保存 11 个配置域，需要同时保证 root 鉴权、社区版字段边界、敏感值脱敏、乐观锁和跨域事务原子性。本例还检查连通性探测不会把“有 HTTP 响应但非 2xx”误判为网络失败，并验证注册字段的保存与回读。

## 前置准备

- 环境与版本：准备同 commit 的两套独立部署，A 不设置 `PRO_URL`（社区版），B 设置 `PRO_URL`（商业版）。说明 API 的版本判定只看 `PRO_URL`，不要求 License 已激活；没有双环境时 C7 阻塞。记录 `BASE_URL`、存储 vendor（MinIO/R2/其他）、`STORAGE_EXTERNAL_ENDPOINT` 是否存在，不在文档保存真实凭证。
- 身份与权限：root 账号用于成功路径；一个用户名不是 `root` 的管理员或普通成员用于越权路径。root 与普通成员使用各自的真实登录态，不复用他人 Cookie。
- 基线 D0：只使用本轮隔离测试数据库与实例，4.18 迁移已完成，`system_instance_configs` 有全部 11 个 domain 文档；写配置的子场景串行且独占。快照 11 个完整 BSON 文档、各域 API 结果和 `db.systemconfigs.find({type:{$in:["fastgpt","fastgptPro"]}})` 的套餐文档；快照加密保存，报告不得包含原始密钥。执行 C1 时使用单独的可销毁隔离夹具：在已完成迁移且无其他写者的隔离库中，按快照的 `_id`、revision 和原文档精确匹配移除 `site` 文档，读后恢复该文档；不得对共享业务库执行此夹具操作。
- 测试夹具：providers 域写入仅用于本轮的测试密钥；C5a 先通过 API 将该密钥清空。准备合法与非法 `subPlans` 各一份、可控本机服务（分别返回 200/404/500 和延迟超过 500ms）、一个关闭端口、一个 `file://` URL。所有站点、域名、账号和文件标识带本次 run 前缀。
- 复位约定：各子场景使用自己的最新 revision；C6b/C6c 承接 C6a 的成功结果，其他子场景从 D0 生效值开始。测试和断言只能通过真实 API 和只读查询完成；仅在经授权的隔离库中，恢复阶段使用已加密的快照，对本轮状态做全 BSON 比对后以事务和 CAS 恢复原始字段（revision 单调递增、`updatedAt` 更新），不覆盖其他写入。套餐场景仅处理本轮明确记录的新文档，恢复原始生效套餐；恢复后核对 11 域、套餐和运行时刷新。若写请求结果未知或恢复无法确认，保留锁与快照，禁止盲目重试或继续下一场景。
- 验证能力：HTTP 客户端保存每次请求的 method、HTTP status、响应 body（`code`、`message`、`data`、`x-request-id`）和请求时间；Mongo 只读连接按本次 domain/revision 查询；服务日志按 requestId 和时间窗检索。
- 场景条件：C6c/C8 的 MinIO 变体需要 `STORAGE_VENDOR=minio`，C8 的 R2 变体需要独立 R2 环境；缺少某个环境时仅阻塞相应变体。C11 使用商业版环境。C12 的字段集合以目标版本的 registry 为准，构造两组合规、彼此不同的合成值；地址只指向本轮受控服务，不使用真实第三方凭据。

## 测试步骤

| 子场景 | 类型与起始状态 | 输入与操作 |
| --- | --- | --- |
| C1 | 基础；无 site 文档的隔离实例 | 以 root 调用 `GET /api/admin/system/config/get?domain=site`，记录响应；再查询 DB 确认该 domain 是否仍无文档。 |
| C2 | 基础；providers 测试密钥已写入 | root 读取 `domain=providers`，记录 `overrides`、`effectiveConfig`、`secretKeys`；同时用只读 DB 查询确认库内原始值。 |
| C3 | 异常；D0 | 用非 root 会话分别调用 get、update、probe，分别保存响应；再查 DB revision。 |
| C4 | 基础；site revision=r | root 保存 `{name:"RUN-SITE"}`，并特意提交一个等于内置默认值的字段（如 `docUrl` 默认值）；记录响应与 DB 文档。 |
| C5 | 边界；providers 无既有密钥 / 有既有密钥 | 5a：首次保存只提交 `customPdf.key:"******"`，观察是否落库。5b：先保存本轮合成密钥，再只改 URL 并原样提交 `"******"`，比较 DB 密钥和 revision。 |
| C6 | 基础/异常；site、resource、storage 均为 D0，MinIO | 6a：以正确 revision 一次提交 site 的 name/description 和 resource 的 maxFolderDepth/uploadFileMaxSize。6b：承接 6a，用当前 site revision 和过期 resource revision 提交不同值。6c：继续以当前 revision 一次提交 site 和 storage；storage 设置 `downloadMode=short-redirect` 且 externalEndpoint、cdnEndpoint 均为空。每次检查 11 域与套餐快照。 |
| C7 | 边界；社区版/商业版各一套 | 社区版 root 读取 auth，记录返回字段和 `secretKeys`；再提交 `loginProviders.email.register=true`，以及一个带 `subPlans:{}` 和当前 commercial `subPlansExpectedRevision` 的合法 site 更新。商业版重复读取 auth，并分别保存同一 Pro 字段和 `subPlans`。 |
| C8 | 边界；MinIO，或 R2 的独立环境 | 在 storage 域分别提交：MinIO `downloadMode=short-redirect` 且 externalEndpoint 为空；配置 cdnEndpoint 但 externalEndpoint 为空；R2 配置 cdnEndpoint；最后提交带非空 externalEndpoint 的 MinIO short-redirect。每次保存后查 revision。 |
| C9 | 边界；本机测试服务 | root 依次探测可达 200、可达 404、可达 500、关闭端口、`file:///etc/passwd`、超时 500ms 的可控慢服务；用非 root 再探测一次；记录 `connected/status/error`。 |
| C10 | 异常；D0 | root 提交 `items: []`、非法 domain、负 expectedRevision、`timeoutMs=100` 的 probe body，分别记录入口响应。 |
| C11 | 基础/异常；商业版 D0 | 使用 site 的当前 revision 和 commercial 的当前 revision（作为 `subPlansExpectedRevision`）分别提交两次：先提交 `{extraPointsPackages:[{points:"not-a-number",month:1,price:1}]}`，再提交 `{extraDatasetSizePrice:5,extraPointsPackages:[{points:1000,month:12,price:10}]}`；每次同时提交不同的合法 site name，并检查配置域与套餐文档。 |
| C12 | 边界；商业版 D0 | 根据当前 registry 为每个字段准备两组不同的合法合成值 A/B；每组以 11 域当前 revision 一次调用 update，随后逐域 GET 并只读查询 Mongo，逐字段比较 A/B 与实际值，敏感字段仅在内存比较明文。完整记录字段集合、每字段布尔结果及恢复结果。 |

## 预期结果

公共断言：所有成功响应均为 HTTP 200、`code=200`，业务数据位于 `data`；所有写请求必须由 root 完成。任何冲突、版本边界或校验拒绝都不得产生部分 domain 写入，revision 只能随成功提交递增。响应和日志不得出现真实密钥；`GET` 不得用环境变量补齐已迁移字段。

| 子场景 | 验证方式 | 特有预期 | 证据获取方式 |
| --- | --- | --- | --- |
| C1 | API + DB | `data.domain=site`、`data.revision=0`、`data.overrides={}`，`effectiveConfig` 等于内置默认值；`secretKeys` 不含无关域字段；`updatedAt/updatedBy` 缺失。 |
| C2 | API + DB | `overrides` 与 `effectiveConfig` 中的密钥均为 `******`；`secretKeys` 含 `documentParse.customPdf.key`；DB 原值仍是测试密钥，未因读取被改写。 |
| C3 | API + DB | 三个入口均被拒绝，返回未授权/禁止访问语义；DB revision 与 overrides 完全不变；不得出现仅有 HTTP 200 但 `data` 为空的假成功。 |
| C4 | API + DB | 响应 `data.results[0].revision=r+1`；`effectiveConfig.name=RUN-SITE`，默认字段仍为默认值；DB overrides 不冗余保存等于默认值的字段，`explicitDefaultPaths` 记录被显式提交的默认值路径（若该字段被剪枝）。 |
| C5 | API + DB | 5a：DB 不出现字面量 `******`，密钥字段未落库，生效值保持 Schema 默认值，revision 可递增。5b：DB 密钥仍为第一次保存的真实值，URL 已更新，revision 递增；不能把掩码恢复成空串。 |
| C6 | API + DB | 6a 两域四字段均为提交值、各 revision+1，响应按提交顺序返回两域，其余九域和套餐快照不变。6b 返回 HTTP/业务 409；6c 返回 HTTP/业务 400；两次拒绝后 11 域 BSON 与套餐快照均不变。 |
| C7 | API + DB | 社区版 GET 过滤掉商业字段和商业 secretKeys；POST Pro 字段返回 403，message 包含越界字段路径（至少 `loginProviders.email.register`）；POST 带 `subPlans`（含空对象）同样返回 403 且在任何读取/写入前拒绝，site revision 不变。商业版 GET 返回该字段，POST 与 subPlans 保存成功，revision/套餐快照按预期递增。 |
| C8 | API + DB | 三类非法组合均返回 HTTP/业务 400 且 storage revision 不变：MinIO short-redirect 无 externalEndpoint、CDN 无 externalEndpoint、R2 配 CDN。合法组合成功并保存 `downloadMode/externalEndpoint`。 |
| C9 | API | 通用探测的 200/404/500 均返回 `connected=true` 且 status 对应；关闭端口返回 `connected=false` 和非空 error；`file://` 返回 `connected=false` 且 error 含 “Only HTTP and HTTPS”；500ms 慢服务返回 `connected=false`、`errorCode=timeout`；非 root 被拒绝；probe 不因内部地址被 SSRF 拦截。 |
| C10 | API | 上述非法输入均由入参校验拒绝（400 语义），不得进入业务写入；DB revision 不变。 |
| C11 | API + DB | 非法套餐返回 HTTP/业务 400，所有域与套餐文档不变。合法套餐与 site 修改同一事务成功：site 与 commercial revision 各加一，返回结果只包含请求的 site；新套餐文档中 `extraDatasetSize.price=5`，`extraPoints.packages` 为提交的积分包数组，不保留对应扁平键。 |
| C12 | API + DB | A、B 两轮每次全部 11 域 revision 各加一；registry 每个字段的 GET 生效值和由 Mongo 文档还原的生效值均匹配合成输入，非空敏感值在 API 中为掩码、在内存中比对库内值一致。快照恢复后除 revision 和 `updatedAt` 外 11 域原始字段完全一致。此项只证明保存、脱敏与回读，不代表全部运行时消费、重载或重启路径已验证。 |
