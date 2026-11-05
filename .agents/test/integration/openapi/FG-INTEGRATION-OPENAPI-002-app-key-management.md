---
case_version: 1
id: "FG-INTEGRATION-OPENAPI-002"
title: "应用 Key 与个人密钥分开创建、展示和管理"
business: "integration/openapi"
types: [api, ui, e2e, integration]
category: basic
scenario: success
priority: P0
status: ready
automation:
  - runner: node
    script: .agents/test/integration/openapi/FG-INTEGRATION-OPENAPI-002.mjs
    items: [M1, M2, M3, M4, M5, M6, M7]
tags: [phase3, app-api-key, customuid-publishsource, 密钥管理, 覆盖基础场景, 覆盖异常场景, 覆盖边界场景]
evidence: [response, ui, database]
sources:
  - ".agents/design/api/app-api-key.md"
  - "projects/app/src/pageComponents/app/detail/Publish/API/index.tsx"
  - "projects/app/src/components/support/apikey/Table.tsx"
  - "projects/app/src/pages/account/apikey.tsx"
  - "projects/app/src/web/support/openapi/api.ts"
  - "packages/global/openapi/support/openapi/api.ts"
  - "packages/global/openapi/support/openapi/index.ts"
  - "projects/app/src/pages/api/support/openapi/create.ts"
  - "projects/app/src/pages/api/support/openapi/list.ts"
  - "projects/app/src/pages/api/support/openapi/update.ts"
  - "projects/app/src/pages/api/support/openapi/copy.ts"
  - "projects/app/src/pages/api/support/openapi/delete.ts"
  - "packages/service/support/permission/auth/openapi.ts"
  - "packages/service/support/openapi/schema.ts"
  - "packages/service/support/openapi/tag/service.ts"
  - "packages/service/support/user/audit/schema.ts"
  - "packages/service/support/user/audit/util.ts"
  - "packages/service/common/http/entry.ts"
  - "packages/service/common/response/index.ts"
routes:
  - "POST /api/support/openapi/create"
  - "GET /api/support/openapi/list"
  - "PUT /api/support/openapi/update"
  - "POST /api/support/openapi/copy"
  - "DELETE /api/support/openapi/delete"
  - "GET /api/support/openapi/tag/list"
related:
  - "FG-PERMISSION-RESOURCE-002"
  - "FG-PERMISSION-TEAM-001"
  - "FG-ADMIN-MAINTENANCE-002"
baseline: "d09b4e8849d051182ef4011470945d2b71085807"
---

# 应用 Key 与个人密钥分开创建、展示和管理

## 用例简介

应用管理员在发布页分别管理当前应用的应用 Key 和本人的个人密钥。两类列表、新建表单和调用示例必须保持隔离，应用管理权限不能扩展到其他成员的个人密钥；复制与修改应用 Key 则依据应用管理权限，而不是 Key 的创建人。

## 前置准备

- 自动执行约定见 [应用 Key 脚本配置](../../../skills/system/fastgpt-integration-test-runner/references/app-key-cases.md)。脚本仅在 marker 匹配的独立数据库准备资源，每个子场景重新建立基线；固定回显模板和登录材料由显式夹具提供，沿用本例所有响应、持久化与清理断言。

- D0：独立团队 T，owner O；应用 W 的 owner B，管理员 A、M；成员 N 无 W 管理权限。A/M 均仅有 W 管理权限，缺团队“创建 API Key”权限；个人密钥创建步骤另给 A 授权。另备同团队应用 X、另一团队 U 的应用 Y；记录真实资源 ID，别名不能直接发送。用真实登录态做管理请求；无登录态对照只带 Key，不能保留浏览器 Cookie。
- 准备 A/B/M 各自的个人密钥 Pa/Pb/Pm；A/M 在 W 的应用 Key Ka/Km，X 下 Kx 和 U 下 Ky。Key 明文只存环境变量或执行器内存，证据只记录 Key._id、名称和脱敏值。个人标签 ta 属于 A；所有名称带 RUN=`appkey-日期-随机串`。
- 目标契约：create body 的 `{type:'app',appId:W,name}` 创建应用 Key，`{type:'personal',name}` 或省略 type 创建个人密钥；list 使用 `type=app&appId=W` 或 `type=personal`；update 使用 `_id`，copy body 使用 `id`，delete query 使用 `id`。创建/复制返回统一响应的 data 字符串，不能把完整 envelope 当 Key。
- 证据保存 HTTP 状态、code/data、x-request-id、可见截图、刷新后的列表和精确记录快照。主库 Key 的物理集合名先以 `MongoOpenApi.collection.name` 获取后记为 Ckey，不能按 model 名猜单复数；只查本例 `_id` 白名单。读取 `{teamId,tmbId,type,appId,name,tagIds,authProxy,limit,usagePoints}`，不输出 apiKey。审计在实际日志库的 `operationLogs`，按 teamId、操作者 tmbId、时间窗和事件过滤；审计 metadata 记录 keyId/keyType/appId，操作人取日志顶层 tmbId，不记录明文。
- 商业版限制使用该版本支持的到期时间/额度；数量边界在独立环境设置较小的现有 OPENAPI_KEY_MAX_COUNT，或准备至真实上限，不修改共享环境。数量行各用独立基线副本。
- 清理通过已确认的 Key 删除及临时应用删除入口，恢复筛选、标签和环境配置。公共 D0 只建一次；每行新增名称独立，破坏性行用副本，不删除其他人资源。

## 测试步骤

| 子场景 | 类型与起始状态 | 输入与操作 |
| --- | --- | --- |
| M1 | 基础；D0，A 登录 | 打开“应用 → 发布渠道 → API 调用”，检查默认“应用 Key”；创建 Ka2，切“个人密钥”创建 Pa2，再到账号设置核对。各 Tab 搜索 RUN 名称，保存请求，刷新重载。 |
| M2 | 基础；D0，M 登录 | A/M 在 W 列表确认都能看到 Ka、Km；M 复制并编辑 A 的 Ka，A 复制并编辑 M 的 Km，包含名称及已支持的 limit；用复制值完成一次 W 对话。检查操作审计，额度尚未消耗的快照在调用前保存。 |
| M3 | 异常；独立无 Cookie 请求及 N 登录 | N 分别仅具 W 使用、编辑、日志查看权限时，请求创建应用 Key、W 的应用列表、复制/更新/删除 Ka；A 失去 W 管理权限后，即使 Ka 归属自己也重复这些拒绝对照；恢复 A 的 W 管理权限后，再尝试访问 Pb。再只带 Ka、无登录态调用 Key 管理接口；伪造 body/query 的 type 或 appId 指向“本人 Key/有权应用”重试。 |
| M4 | 边界；恢复 D0，A 登录 | 应用 Key 创建分别缺 appId、指定 X/Y 或带 authProxy/tags；个人密钥创建带 appId。更新合法 Ka 时分别夹带 type、appId、tmbId 修改，名称同时给合法值；逐项比较快照。X 的拒绝对照确保 A 确实无 X 管理权限。补充大写 ObjectId 创建与历史大小写绑定的列表、数量上限验证。 |
| M5 | 兼容；D0，A 登录 | create/list 省略 type；旧调用方 list 仅带 appId=W。给 Pa 绑 ta；查看个人标签计数、应用列表及应用编辑表单，切 Tab 后检查筛选/表单/示例不串用；对 W 应用列表用名称和现有时间排序。 |
| M6 | 数量边界；独立副本 | 先将 A 的 personal Key 达上限但 W 未满，再创建 W 应用 Key；另将 W 达上限但 A personal 未满，再分别创建两类。使用无团队创建 Key 权限但有 W 管理权限的成员分别新建应用 Key 和个人密钥。 |
| M7 | 生命周期；M2 的临时 Ka 副本 | M 在 W 中删除该 Key，刷新列表，使用原始值再次调用 W；同时检查 Pa/Pb、Km、Kx/Ky 和日志中的其他渠道记录。 |

## 预期结果

公共断言：列表只返回当前类型和授权范围，Key 值脱敏，复制明文仅通过受控接口；真实响应成功且数据库/刷新结果一致才算完成。拒绝操作不创建或修改目标 Key，允许请求日志和已有审计机制的正常副作用。不凭 HTTP 200 判定成功，不指定尚未实现的错误码。

| 子场景 | 特有预期 | 证据获取方式 |
| --- | --- | --- |
| M1 | W 应用列表精确包含 Ka/Km/Ka2，不包含 personal、X/U Key；个人列表只含 A 的 Pa/Pa2。应用表单绑定 W 且不可修改，不显示 authProxy/个人标签；按钮、说明和示例随 Tab 切换，账号页仅个人密钥。 | 两类网络请求、可见 UI/刷新、Ckey 白名单投影。 |
| M2 | A/M 都能查看 W 下全部应用 Key，并可互相复制、编辑、删除对方创建的 Key；Key 归属保持原创建人，不因其他管理员复制/改名而改变。原始 Key 不含人为追加的 appId 后缀且可调用 W；编辑不换 Key._id/明文。审计记录实际操作者 M，不写明文；新增审计字段由实现后的契约核对。 | 复制/更新响应、调用响应、脱敏恒等比较和日志库审计。 |
| M3 | N、无登录态 Key 请求和伪造类型请求不能扩大管理范围；A 即使管理 W 也不能查看或复制 Pb。不得泄露目标明文，目标记录差集为空。 | 响应业务拒绝、目标记录及 Pb 精确列表查询。 |
| M4 | 拒绝不合法创建和不可变字段修改；不能把 Ka 换应用、换类型或归属人，不得只改合法名称而偷偷接受受禁止的绑定修改。跨团队 Y 必须拒绝。新绑定统一保存规范小写 ID；历史大小写绑定属于同一个应用，不拆分列表或数量上限。 | 每个输入副本与前后 Key._id 集合/字段差集。 |
| M5 | 省略 type 创建 personal；旧 list 不因 appId 返回全应用 Key。ta 及计数仅作用于 A 的个人密钥；应用 Key 不显示或编辑个人标签。排序/搜索只在当前授权集合内进行，调用示例使用当前应用，复制不改存储值。 | 列表/标签响应、Tab 交替后的 UI、数据库。 |
| M6 | 两种上限分别按“本人 personal”和“当前 app”计算，互不挤占；各自到限拒绝对应新建，转交数量规则由 TEAM-001 验证。应用管理员缺团队创建权限仍可新建应用 Key；个人密钥继续因缺团队创建权限拒绝。 | 数量前后差集、创建响应、实际配置及权限证据。 |
| M7 | 删除成功后原 Key 不能再调用，目标应用列表移除；其他 Key 与应用保持原值。既有对话数据不因删 Key 被一起删除，渠道展示按第二阶段既有规则回归。 | 删除/重用响应、目标与对照快照；关联 HISTORY-FEEDBACK-002。 |
