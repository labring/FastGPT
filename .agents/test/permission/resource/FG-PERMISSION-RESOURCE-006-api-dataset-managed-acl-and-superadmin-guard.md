---
case_version: 1
id: "FG-PERMISSION-RESOURCE-006"
title: "API 知识库外部权限托管写保护、超管旁路关闭与离职交接边界"
business: "permission/resource"
types: ["api", "integration"]
category: "boundary"
scenario: "special"
priority: "P0"
status: "ready"
tags: ["pr-8204", "pr-pro-1238", "api-dataset", "permission-sync", "DISABLE_APIDATASET_SUPER_ADMIN", "sync-scope", "离职交接", "Pro", "覆盖基础场景", "覆盖异常场景", "覆盖边界场景"]
evidence: ["response", "database"]
sources:
  - ".agents/design/collection-permission-design.md"
  - ".agents/design/core/dataset/api-dataset-sync-scope-design.md"
  - "packages/global/common/error/code/dataset.ts"
  - "packages/global/core/dataset/apiDataset/type.ts"
  - "packages/global/core/dataset/apiDataset/utils.ts"
  - "packages/service/env.ts"
  - "packages/service/support/permission/dataset/disableSuperAdmin.ts"
  - "packages/service/support/permission/dataset/auth.ts"
  - "packages/service/support/permission/collection/auth.ts"
  - "packages/service/support/permission/collection/datasetSwitch.ts"
  - "packages/service/support/permission/collection/enable.ts"
  - "packages/service/support/permission/collection/collaborator.ts"
  - "packages/service/support/permission/collection/controller.ts"
  - "packages/service/support/permission/collection/moveAuth.ts"
  - "packages/service/core/dataset/apiDataset/auth.ts"
  - "packages/service/core/dataset/apiDataset/service.ts"
  - "packages/service/core/dataset/search/runtime.ts"
  - "packages/service/core/workflow/dispatch/dataset/search.ts"
  - "packages/service/core/workflow/dispatch/ai/agent/sub/dataset/index.ts"
  - "projects/app/src/pages/api/core/dataset/apiDataset/syncState.ts"
  - "projects/app/src/pages/api/core/dataset/list.ts"
  - "projects/app/src/pages/api/core/dataset/listV2.ts"
  - "projects/app/src/pages/api/core/dataset/collection/listV2.ts"
  - "projects/app/src/pages/api/core/dataset/collection/delete.ts"
  - "projects/app/src/pages/api/core/dataset/collection/update.ts"
  - "projects/app/src/pages/api/core/dataset/collection/getDownloadTicket.ts"
  - "projects/app/src/pages/api/core/dataset/collection/resumeInheritPermission.ts"
  - "projects/app/src/pages/api/core/dataset/disableCollectionPermission.ts"
  - "projects/app/src/pages/api/core/dataset/exportAll.ts"
  - "projects/app/src/pages/api/core/dataset/searchTest.ts"
  - "projects/app/src/service/core/dataset/collection/archive.ts"
  - "pro/admin/src/pages/api/core/dataset/changeOwner.ts"
  - "pro/admin/src/pages/api/core/dataset/collection/changeOwner.ts"
  - "pro/admin/src/pages/api/core/dataset/collection/collaborator/update.ts"
  - "pro/admin/src/service/core/changeOwner.ts"
routes:
  - "PUT /api/core/dataset/update"
  - "GET /api/core/dataset/detail"
  - "GET /api/core/dataset/apiDataset/syncState"
  - "POST /api/core/dataset/disableCollectionPermission"
  - "POST /api/core/dataset/list"
  - "POST /api/core/dataset/listV2"
  - "POST /api/core/dataset/collection/listV2"
  - "GET /api/core/dataset/collection/detail"
  - "POST /api/core/dataset/collection/delete"
  - "POST /api/core/dataset/collection/update"
  - "PUT /api/core/dataset/collection/resumeInheritPermission"
  - "POST /api/core/dataset/collection/create/apiCollectionV2"
  - "POST /api/core/dataset/collection/getDownloadTicket"
  - "GET /api/core/dataset/exportAll"
  - "POST /api/core/dataset/search"
  - "POST /api/core/dataset/searchTest"
  - "POST /api/v1/chat/completions"
  - "POST /api/proApi/core/dataset/collaborator/update"
  - "POST /api/proApi/core/dataset/collection/collaborator/update"
  - "POST /api/proApi/core/dataset/changeOwner"
  - "POST /api/proApi/core/dataset/collection/changeOwner"
  - "DELETE /api/proApi/support/user/team/member/delete"
  - "DELETE /api/proApi/support/user/team/member/leave"
related:
  - "FG-DATASET-INGESTION-005"
  - "FG-DATASET-INGESTION-003"
  - "FG-PERMISSION-TEAM-001"
baseline: "202a1e64eb; pro/cb1716a2"
---

# API 知识库外部权限托管写保护、超管旁路关闭与离职交接边界

## 用例简介

API 知识库开启 `permissionSync` 托管后，本地人工修改集合协作者、恢复集合继承、关闭文件级权限及单个知识库/集合所有权转让均须拒绝，父级知识库目录协作者级联不能覆盖托管库集合 ACL，成员离职批量交接时仍须转移托管知识库本身所有权并清理离职者自身 ACL，同时跳过托管库集合的本地级联改写、待后续外部同步按新知识库 owner 兜底收敛；托管模式下局部导入放行 collection 级鉴权，但开启整库 `syncAll` 仍要求知识库 `Manage` 权限。开启全局环境变量 `DISABLE_APIDATASET_SUPER_ADMIN=true` 后，系统 `root` 与团队 `owner` 仅在 API 知识库的管理面（知识库列表/详情/更新、集合列表浏览/导航/搜索、同步状态查询、全量导出、移动与删除鉴权）及搜索入口的库级门槛失去超管旁路并遵守本地 ACL（知识库创建者 `dataset.tmbId` 仍保留库级 owner 兜底，普通知识库与目录保留超管旁路；`getDownloadTicket` 仍因仅支持通用知识库而对 `apiDataset` 统一返回 `archiveUnsupportedDataset`），而通过库级鉴权后的检索测试、统一搜索与工作流知识库检索仍保持团队 `owner` 集合召回短路。

## 前置准备

- 环境与版本：本地 dev 主站 App、Pro、MongoDB、向量库、Redis、对象存储及受控 Custom API HTTP 夹具均正常运行；不修改共享配置，凭证通过环境变量提供。验证 `M4`、`M5` 时需按 `DISABLE_APIDATASET_SUPER_ADMIN=true` 与未设置/`false` 两种部署环境切换主站服务（该开关已注册于 `packages/service/env.ts`，默认 `false`；`apiDatasetServer` 中不再支持库级 `disableSuperAdmin` 字段，旧请求体残留字段会被 Zod 剥离）。
- 身份与角色矩阵 `P0`：新建独立测试团队 `T`（`teamId`），包含团队 `owner` 账号 `TO`、知识库创建者/owner `DO`（普通团队成员，非团队 owner）、团队管理员 `TA`（具团队级 `Manage` 权限但非团队 owner）、普通成员 `M1`、`M2`；另备系统级超级管理员登录态 `ROOT`（`isRoot=true`，默认归属系统团队但可跨团队请求）。
- 资源基线 `R0`：
  - 知识库目录 `F`（`type: 'folder'`，owner=`TO`），其下挂两个继承态知识库：托管 API 知识库 `K_sync`（owner=`DO`，`apiDatasetServer: { apiServer, permissionSync: true }`）与普通开启文件权限的知识库 `K_norm`（owner=`DO`，`collectionPermissionEnabled: true`）；另在根级创建一个由 `TO` 本人拥有的无 ACL 行 API 知识库 `K_owned`（owner=`TO`，`apiDatasetServer: { apiServer }`，`resource_permissions` 无任何记录），用于验证 `dataset.tmbId` 库级 owner 兜底。
  - `K_sync` 内通过 `M1`（授予知识库写权限）导入集合树：受限目录 `DirA`（外部权限仅 `DO` owner + `M2` 只读，`TO`/`ROOT`/`M1` 均无 `DirA` 自身读权限）、`DirA` 下可读子文件 `ColSub`（外部权限含 `TO`/`ROOT`/`M1`/`M2` 只读，含唯一文本片段 `RUN_CHUNK_SUB` 与可下载源文件）、根级受限文件 `ColSecret`（外部权限仅 `DO` owner + `M2` 只读，含唯一文本片段 `RUN_CHUNK_SECRET` 与可下载源文件，且其 `collection.tmbId` 记为导入执行者 `M1`）。所有集合完成向量/全文索引入库。
  - 发布一个绑定 `K_sync` 且开启成员权限过滤（`authTmbId: true`）的可控知识库检索工作流应用 `App_rag`，供 `POST /api/v1/chat/completions`（`detail: true`）验证实际召回片段引用。
- 复位约定：只读与拒绝场景共享 `R0` 快照并在前后核对零副作用；写成功场景（退出托管、父目录级联、离职交接）各自使用独立团队或独立知识库副本。
- 验证能力：HTTP 响应同时核对状态码、业务 `code`、`statusText` 及流式 CSV 内容；MongoDB 按 `teamId` 与资源 ID 白名单只读核查 `datasets`、`dataset_collections`、`resource_permissions`。
- 清理方式：按本轮创建的 `App_rag`、知识库、目录及测试团队顺序通过业务删除接口清理，恢复所有临时账号状态。

## 测试步骤

| 子场景 | 类型与起始状态 | 输入与操作 |
| --- | --- | --- |
| M1 | 异常与恢复场景；基线 `R0` 的 `K_sync` | 1. 人工写守卫：以有管理/owner 权限的 `DO` 分别调用 `POST /api/proApi/core/dataset/collection/collaborator/update`、`PUT /api/core/dataset/collection/resumeInheritPermission`、`POST /api/core/dataset/disableCollectionPermission`、`POST /api/proApi/core/dataset/changeOwner`（转给 `M2`）、`POST /api/proApi/core/dataset/collection/changeOwner`（转给 `M2`）。<br>2. 创建者非隐式 owner 与导入/全量同步守卫：以集合导入者 `M1`（`ColSecret.tmbId=M1`，仅具 `K_sync` 知识库写权限、无 `Manage` 权限，外部 ACL 仅给 `M1` 对 `ColSub` 只读、无 `DirA`/`ColSecret` 权限）调用 `POST /api/core/dataset/collection/listV2`、以及对 `ColSub` 和 `ColSecret` 调用 `POST /api/core/dataset/collection/delete`；再以 `M1` 调用 `POST /api/core/dataset/collection/create/apiCollectionV2` 分别执行：① 局部导入 `DirA` 下新增远端文件（`syncAll: false`）；② 传入 `syncAll: true` 尝试开启整库全量同步。<br>3. 退出托管恢复：在独立副本调用 `PUT /api/core/dataset/update` 将 `permissionSync` 改为 `false`，随后重放步骤 1 的协作者更新、恢复继承、转让 owner 与 `disableCollectionPermission`。 |
| M2 | 边界场景；基线 `R0` 独立副本（`F` 下同时含继承态 `K_sync` 与 `K_norm`） | 1. 调用 `POST /api/proApi/core/dataset/collaborator/update` 在父目录 `F` 上新增协作者 `M1`（管理权限），对比 `K_sync` 与 `K_norm` 各自知识库 ACL 及内部集合 `resource_permissions` 变化。<br>2. 存量脏数据容错对照：在测试库为中间子目录 `F_dirty`（`type: 'folder'`，其下挂继承态普通知识库 `K_leaf`）模拟历史遗留 `apiDatasetServer.permissionSync=true`，再次修改顶层目录 `F` 的协作者。 |
| M3 | 跨业务边界场景；独立团队副本 `T_leave`（含离职成员 `DO`、接收人团队 owner `TO`、在职协作者 `M2`；`DO` 同时拥有托管库 `K_sync`、普通库 `K_norm` 及两库内的集合，`K_sync` 集合上有 `DO` owner 与 `M2` 只读 ACL） | 1. 先由 `DO` 调用单个接口 `POST /api/proApi/core/dataset/changeOwner` 尝试主动转让 `K_sync` 给 `TO`（确认拒绝）。<br>2. 再分别在两套独立副本上执行团队 owner 移出成员 `DELETE /api/proApi/support/user/team/member/delete?tmbId=DO` 与成员主动离队 `DELETE /api/proApi/support/user/team/member/leave`（`DO` 非团队 owner），核查 `K_sync` 与 `K_norm` 的知识库及集合归属与 ACL 变化。<br>3. 离职交接完成后，对 `K_sync` 触发一轮外部权限同步（远端 ACL 仍包含已离职的 `DO` 与在职的 `M2`，或仅含 `DO`），核查离职成员过滤与新知识库 owner `TO` 兜底收敛结果。 |
| M4 | 核心权限边界；在 `DISABLE_APIDATASET_SUPER_ADMIN=true` 环境下使用基线 `R0` | 1. 无知识库 ACL 的超管与选择性收紧对照：在未将 `TO` 和 `ROOT` 加入 `K_sync` 知识库协作者时，分别以 `TO` 和 `ROOT`（跨团队切入 `T` 或使用 `ROOT` 会话）调用 `POST /api/core/dataset/listV2`、`POST /api/core/dataset/list`，以及针对 `K_sync` 调用 `GET /api/core/dataset/detail`、`GET /api/core/dataset/apiDataset/syncState`、`PUT /api/core/dataset/update`、`POST /api/core/dataset/collection/listV2`、`GET /api/core/dataset/exportAll`、`POST /api/core/dataset/searchTest`，并以知识库 owner `DO` 对照；同时核对 `TO`/`ROOT` 在列表中对普通库 `K_norm` 与本人所有的 API 库 `K_owned` 的可见性及 `permission.isOwner`。<br>2. 有知识库读写 ACL 但受限于集合 ACL 的超管：由 `DO` 在 `K_sync` 知识库级授予 `TO`（以及跨团队切入 `T` 的 `ROOT` 成员锚点）知识库写权限，但集合级保持 `ColSecret` 仅 `DO+M2` 可读、`DirA` 自身不可读而子级 `ColSub` 可读。分别以 `TO` 与 `ROOT` 执行：<br>  - `POST /api/core/dataset/collection/listV2`（根目录浏览、`selectFolder: true` 目录选择、进入 `DirA` 浏览、带 `searchText: 'Col'` 搜索）；<br>  - `GET /api/core/dataset/collection/detail?id=ColSecret`；<br>  - `POST /api/core/dataset/collection/getDownloadTicket`（分别传 `[ColSub]`、`[ColSecret]`、以及含受限后代的目录，校验类型前置拦截）；<br>  - `GET /api/core/dataset/exportAll?datasetId=K_sync`；<br>  - `POST /api/core/dataset/collection/update` 尝试移动无管理权限的集合；<br>  - 以 `TO`、`ROOT` 与普通成员 `M1` 分别调用 `GET /api/core/dataset/apiDataset/syncState?datasetId=K_sync` 验证同步状态集合过滤与不可读父目录归一化。<br>3. 对照开关关闭态：将环境切回 `DISABLE_APIDATASET_SUPER_ADMIN` 未设置/`false` 并重启服务，重放 `TO` 与 `ROOT` 对 `K_sync` 列表、详情及 `ColSecret` 的集合列表、`apiDataset/syncState` 与全量导出作为对照（并确认 `getDownloadTicket` 仍按 `apiDataset` 类型拦截）。 |
| M5 | 检索边界对照；承接 M4 步骤 2 状态（`DISABLE_APIDATASET_SUPER_ADMIN=true`，`TO`、`TA`、`M1`、`M2` 均有 `K_sync` 知识库读权限；集合级 `ColSecret` 仅 `DO`/`M2` 可读，`ColSub` 均可读） | 分别以团队 `owner` `TO`、团队管理员 `TA`、普通成员 `M1`、获授权成员 `M2` 调用：<br>1. `POST /api/core/dataset/searchTest` 与 `POST /api/core/dataset/search`（检索能同时匹配 `RUN_CHUNK_SUB` 与 `RUN_CHUNK_SECRET` 的查询词）；<br>2. `POST /api/v1/chat/completions` 调用开启 `authTmbId: true` 的 `App_rag` 工作流。 |

## 预期结果

公共断言：托管守卫拒绝统一返回 HTTP `403`、业务 `code: 501032`、`statusText: 'permissionSyncManaged'`，且事务内无任何 `datasets`、`dataset_collections` 或 `resource_permissions` 半提交改动；未授权知识库拒绝返回 `statusText: 'unAuthDataset'`（`code: 501004`），未授权集合拒绝返回 `statusText: 'unAuthDatasetCollection'`（`code: 501005`）。

| 子场景 | 验证方式 | 特有预期 | 证据获取方式 |
| --- | --- | --- | --- |
| M1 | API、数据库 | 1. 五个人工写入口全部返回 HTTP `403` / `permissionSyncManaged`（`501032`），集合与知识库 owner、继承态、ACL 快照均不变。<br>2. `M1` 虽为 `ColSecret.tmbId` 创建者，在托管模式下 `listV2` 不出现 `ColSecret`，`ColSub` 返回 `permission.isOwner=false`，对 `ColSub` 与 `ColSecret` 调用 `collection/delete` 均因无 owner ACL 被拒（`unAuthDatasetCollection`）；`M1` 凭知识库写权限调用 `apiCollectionV2` ① 局部导入 `DirA` 下文件成功（跳过 collection 级鉴权），② 传入 `syncAll: true` 被 `enableDatasetSyncAll` 知识库 `Manage` 权限校验拒绝（`unAuthDataset`），`K_sync.syncAll` 保持 `false`。<br>3. 关闭 `permissionSync` 后，步骤 1 的人工协作者修改、恢复继承、所有权转让与关闭文件级权限均正常返回 HTTP `200` / `code: 200` 并落库。 | 各接口 HTTP 状态与 JSON 响应、`datasets` / `dataset_collections` / `resource_permissions` 前后精确快照。 |
| M2 | API、数据库 | 1. 父目录 `F` 协作者变更后：`K_sync` 的知识库级 ACL 按继承更新，但 `K_sync` 下所有集合的 `resource_permissions` 保持外部同步快照完全不变；同级普通库 `K_norm` 的继承态根集合及子目录同步合并 `M1` 权限。<br>2. 携带历史脏标记的 `F_dirty`（`type: 'folder'`）不剪断传播，其下 `K_leaf` 的继承态集合仍正常同步新协作者。 | `K_sync`、`K_norm`、`K_leaf` 的 `resource_permissions` 变更前后差集。 |
| M3 | API、数据库 | 1. 单个 `dataset/changeOwner` 接口对 `K_sync` 返回 HTTP `403` / `permissionSyncManaged`。<br>2. 成员移出与主动离队的批量交接均成功：`K_sync` 与 `K_norm` 的 `datasets.tmbId` 均转移为 `TO` 且知识库级 `resource_permissions` 更新为 `TO` owner（避免知识库悬空）；普通库 `K_norm` 内的集合 `tmbId` 与集合 owner ACL 同步转移为 `TO`；托管库 `K_sync` 内所有集合的 `tmbId` 保持原值不被本地级联改写，`changeOwner` 跳过 `K_sync` 集合 ACL 级联（`TO` 未被本地直接写入集合 owner ACL，其他在职成员 `M2` 的集合 ACL 保持不变），同时 `deleteCollaboratorPermissions` 正常清理已离职成员 `DO` 名下的 `resource_permissions`（含 `K_sync` 集合上 `DO` 自己的 ACL 行）。<br>3. 触发外部权限同步后：离职成员 `DO` 因非 `active` 状态被过滤不再回写，`K_sync` 集合按新知识库 owner `TO` 兜底写入 `TO` 的 owner ACL（`4294967295`），在职成员 `M2` 的只读 ACL 保留（当远端仅含离职成员 `DO` 解析为空时，集合也正确收敛为仅 `TO` owner 兜底）。 | 离职前后及同步后的 `datasets`、`dataset_collections`、`resource_permissions` 按两库分组的精确差集。 |
| M4 | API、数据库 | 1. 在 `DISABLE_APIDATASET_SUPER_ADMIN=true` 下未授予 `K_sync` 知识库 ACL 时：`TO` 与 `ROOT` 的 `dataset/listV2` 和 `dataset/list` 不返回 `K_sync`，访问 `detail`/`apiDataset/syncState`/`update`/`collection/listV2`/`exportAll`/`searchTest` 均被 `unAuthDataset` 拒绝；普通库 `K_norm` 仍对 `TO` 与 `ROOT` 可见且返回 `permission.isOwner=true`，`TO` 本人创建的 `K_owned`（无 ACL 行）也保持可见且 `permission.isOwner=true`；`DO` 仍正常访问 `K_sync`。<br>2. 授予 `K_sync` 知识库写权限后，在 `DISABLE_APIDATASET_SUPER_ADMIN=true` 下：<br>  - `collection/listV2` 根目录浏览中不返回 `ColSecret`，`DirA` 仅因含可读后代 `ColSub` 以导航模式返回（`folderAccessMode: 'navigate'`、`permission.hasReadPer=false`、`tags: []`）；`selectFolder: true` 不返回导航态 `DirA`；进入 `DirA` 仅返回 `ColSub`；搜索模式仅命中 `ColSub` 不命中 `ColSecret`。<br>  - `collection/detail?id=ColSecret`、`collection/update` 越权移动均返回 `unAuthDatasetCollection`；`getDownloadTicket` 对 `apiDataset` 传 `[ColSub]`、`[ColSecret]` 或 `[DirA]` 均统一返回 HTTP `422` / `code: 501029` / `statusText: 'archiveUnsupportedDataset'`。<br>  - `exportAll` 导出的 CSV 仅包含 `ColSub` 下的 `RUN_CHUNK_SUB`，严禁包含 `RUN_CHUNK_SECRET`。<br>  - `TO`、`ROOT` 与普通成员 `M1` 调用 `apiDataset/syncState` 均仅返回可读集合 `ColSub`（不含 `ColSecret` 与 `DirA`），且因父目录 `DirA` 不可读，`ColSub.parentId` 归一化为 `null`。<br>3. `DISABLE_APIDATASET_SUPER_ADMIN` 切回未设置/`false` 后，`TO` 与 `ROOT` 恢复超管旁路，`dataset/listV2`/`list` 返回 `K_sync`（`permission.isOwner=true`），`collection/listV2`、`apiDataset/syncState`、`exportAll` 均可访问包含 `ColSecret` 在内的全库数据（`getDownloadTicket` 仍返回 HTTP `422` / `archiveUnsupportedDataset`）。 | 各角色响应对比、`dataset/listV2`、`apiDataset/syncState` 与 `collection/listV2` 返回项及 `folderAccessMode`/`permission` 字段、CSV 导出正文内容。 |
| M5 | API | 在 `DISABLE_APIDATASET_SUPER_ADMIN=true` 下，通过知识库级读鉴权后集合过滤不传 `ignoreTeamOwner`：团队 `owner` `TO` 与获集合授权的 `M2` 在 `searchTest`、`search` 与 `App_rag` 工作流运行中均能召回 `RUN_CHUNK_SUB` 与 `RUN_CHUNK_SECRET`；团队管理员 `TA` 与普通成员 `M1` 不享团队 owner 短路，仅召回可读集合 `ColSub` 的 `RUN_CHUNK_SUB`，不泄露 `RUN_CHUNK_SECRET`。 | `searchTest.list`/`search.list` 命中的 `collectionId`/`q` 集合、工作流 `responseData` 引用列表。 |
