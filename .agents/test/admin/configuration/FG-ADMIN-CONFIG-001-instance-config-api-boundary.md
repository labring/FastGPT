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
status: "draft"
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
baseline: "27d88d71f44614d89aef7d7d04fe65431ea19288"
---

# 实例配置 API：版本边界、脱敏与原子保存

## 用例简介

管理员通过统一 API 读取和保存 11 个配置域，需要同时保证 root 鉴权、社区版字段边界、敏感值脱敏、乐观锁和跨域事务原子性。本例还检查连通性探测不会把“有 HTTP 响应但非 2xx”误判为网络失败，并确认保存调用不等待后台运行时刷新。

## 前置准备

- 环境与版本：准备同 commit 的两套独立部署，A 不设置 `PRO_URL`（社区版），B 设置 `PRO_URL`（商业版）。说明 API 的版本判定只看 `PRO_URL`，不要求 License 已激活；没有双环境时 C7 阻塞。记录 `BASE_URL`、存储 vendor（MinIO/R2/其他）、`STORAGE_EXTERNAL_ENDPOINT` 是否存在，不在文档保存真实凭证。
- 身份与权限：root 账号用于成功路径；一个用户名不是 `root` 的管理员或普通成员用于越权路径。root 与普通成员使用各自的真实登录态，不复用他人 Cookie。
- 基线 D0：4.18 迁移已完成，`system_instance_configs` 有全部 11 个 domain 文档。只读查询 `db.system_instance_configs.find({}, {domain:1,revision:1,overrides:1,explicitDefaultPaths:1,updatedAt:1,updatedBy:1})`，记录每个 domain 的 revision 和 overrides；记录 `db.system_configs.find({type:{$in:["fastgpt","fastgptPro"]}}).sort({createTime:-1})` 的最新套餐快照。
- 测试夹具：providers 域写入一个可识别的测试密钥；准备一个不存在的 site 文档环境验证 revision 0；准备合法与非法 `subPlans` 各一份；准备一个本机可达 URL、一个返回 404/500 的本机 URL、一个关闭端口、一个 `file://` URL。所有站点、域名、账号和文件标识带本次 run 前缀。
- 复位约定：除 C1/C5 的“无文档首次保存”使用独立可销毁实例外，每个子场景保存前先通过 `GET` 取最新 revision，再用真实 `update` API 恢复为 D0 值；不允许用直接改库代替业务复位。
- 验证能力：HTTP 客户端保存每次请求的 method、HTTP status、响应 body（`code`、`message`、`data`、`x-request-id`）和请求时间；Mongo 只读连接按本次 domain/revision 查询；服务日志按 requestId 和时间窗检索。
- 阻塞项：C8 的拒绝状态码待确认。当前存储校验抛普通 `Error`，入口会映射为 500，而业务上更像是 400；本例只把“拒绝且零写入”作为通过条件，不把 500 写成最终正确语义。C10 不覆盖“overrides 内未知字段”的具体状态码，因为该错误当前不是由 `parseApiInput` 产生，需先确认错误降级边界。

## 测试步骤

| 子场景 | 类型与起始状态 | 输入与操作 |
| --- | --- | --- |
| C1 | 基础；无 site 文档的隔离实例 | 以 root 调用 `GET /api/admin/system/config/get?domain=site`，记录响应；再查询 DB 确认该 domain 是否仍无文档。 |
| C2 | 基础；providers 测试密钥已写入 | root 读取 `domain=providers`，记录 `overrides`、`effectiveConfig`、`secretKeys`；同时用只读 DB 查询确认库内原始值。 |
| C3 | 异常；D0 | 用非 root 会话分别调用 get、update、probe，分别保存响应；再查 DB revision。 |
| C4 | 基础；site revision=r | root 保存 `{name:"RUN-SITE"}`，并特意提交一个等于内置默认值的字段（如 `docUrl` 默认值）；记录响应与 DB 文档。 |
| C5 | 边界；providers 无既有密钥 / 有既有密钥 | 5a：首次保存只提交 `customPdf.key:"******"`，观察是否落库。5b：先保存真实密钥，再只改 URL 并原样提交 `"******"`，比较 DB 密钥和 revision。 |
| C6 | 基础/异常；auth 与 site 均为 D0 | 6a：一次提交 auth+site 两域，均使用正确 revision。6b：恢复后提交 auth 正确 revision + site 过期 revision，断言整体 409。6c：提交合法 domain 但非法 `subPlans`，再提交合法 `subPlans`，分别查 `system_configs`。 |
| C7 | 边界；社区版/商业版各一套 | 社区版 root 读取 auth，记录返回字段和 `secretKeys`；再提交 `loginProviders.email.register=true`，以及一个带 `subPlans:{}` 的合法 site 更新。商业版重复读取 auth，并分别保存同一 Pro 字段和 `subPlans`。 |
| C8 | 边界；MinIO，或 R2 的独立环境 | 在 storage 域分别提交：MinIO `downloadMode=short-redirect` 且 externalEndpoint 为空；配置 cdnEndpoint 但 externalEndpoint 为空；R2 配置 cdnEndpoint；最后提交带非空 externalEndpoint 的 MinIO short-redirect。每次保存后查 revision。 |
| C9 | 边界；本机测试服务 | root 依次探测可达 200、可达 404、可达 500、关闭端口、`file:///etc/passwd`、超时 500ms 的可控慢服务；用非 root 再探测一次；记录 `connected/status/error`。 |
| C10 | 异常；D0 | root 提交 `items: []`、非法 domain、负 expectedRevision、`timeoutMs=100` 的 probe body，分别记录入口响应。 |

## 预期结果

公共断言：所有成功响应均为 HTTP 200、`code=200`，业务数据位于 `data`；所有写请求必须由 root 完成。任何冲突、版本边界或校验拒绝都不得产生部分 domain 写入，revision 只能随成功提交递增。响应和日志不得出现真实密钥；`GET` 不得用环境变量补齐已迁移字段。

| 子场景 | 验证方式 | 特有预期 | 证据获取方式 |
| --- | --- | --- | --- |
| C1 | API + DB | `data.domain=site`、`data.revision=0`、`data.overrides={}`，`effectiveConfig` 等于内置默认值；`secretKeys` 不含无关域字段；`updatedAt/updatedBy` 缺失。 |
| C2 | API + DB | `overrides` 与 `effectiveConfig` 中的密钥均为 `******`；`secretKeys` 含 `documentParse.customPdf.key`；DB 原值仍是测试密钥，未因读取被改写。 |
| C3 | API + DB | 三个入口均被拒绝，返回未授权/禁止访问语义；DB revision 与 overrides 完全不变；不得出现仅有 HTTP 200 但 `data` 为空的假成功。 |
| C4 | API + DB | 响应 `data.results[0].revision=r+1`；`effectiveConfig.name=RUN-SITE`，默认字段仍为默认值；DB overrides 不冗余保存等于默认值的字段，`explicitDefaultPaths` 记录被显式提交的默认值路径（若该字段被剪枝）。 |
| C5 | API + DB | 5a：DB 不出现字面量 `******`，密钥字段未落库，生效值保持 Schema 默认值，revision 可递增。5b：DB 密钥仍为第一次保存的真实值，URL 已更新，revision 递增；不能把掩码恢复成空串。 |
| C6 | API + DB | 6a 两域各 revision+1，响应按提交顺序返回两域结果。6b 返回 HTTP/业务 409，auth 与 site 均未改变，site 的旧值不被覆盖。6c 非法 subPlans 返回 400 且 domain 与 `system_configs` 均无新文档；合法 subPlans 产生新 `system_configs` 文档，`extraDatasetSize.price`、`extraPoints.packages` 为嵌套存储形状，配置域与套餐在同一事务中成功。 |
| C7 | API + DB | 社区版 GET 过滤掉商业字段和商业 secretKeys；POST Pro 字段返回 403，message 包含越界字段路径（至少 `loginProviders.email.register`）；POST 带 `subPlans`（含空对象）同样返回 403 且在任何读取/写入前拒绝，site revision 不变。商业版 GET 返回该字段，POST 与 subPlans 保存成功，revision/套餐快照按预期递增。 |
| C8 | API + DB | 三类非法组合均被拒绝且 storage revision 不变：MinIO short-redirect 无 externalEndpoint、CDN 无 externalEndpoint、R2 配 CDN。合法组合成功并保存 `downloadMode/externalEndpoint`。拒绝状态码按当前实现记录，不据此判为 400；若实现改为 400，这是预期改进。 |
| C9 | API | 200/404/500 均返回 `connected=true` 且 status 对应；关闭端口返回 `connected=false` 和非空 error；`file://` 返回 `connected=false` 且 error 含 “Only HTTP and HTTPS”；非 root 被拒绝；probe 不因内部地址被 SSRF 拦截。 |
| C10 | API | 上述非法输入均由入参校验拒绝（400 语义），不得进入业务写入；DB revision 不变。 |
