---
case_version: 1
id: "FG-DATASET-INGESTION-005"
title: "API 知识库外部文件权限同步、主体映射与队列容错"
business: "dataset/ingestion"
types: ["api", "integration"]
category: "basic"
scenario: "success"
priority: "P0"
status: "ready"
tags: ["pr-8204", "pr-pro-1238", "api-dataset", "permission-sync", "syncAll", "sync-scope", "bullmq", "覆盖基础场景", "覆盖异常场景", "覆盖边界场景"]
evidence: ["response", "database", "queue", "log"]
sources:
  - ".agents/design/collection-permission-design.md"
  - ".agents/design/core/dataset/api-dataset-sync-scope-design.md"
  - "packages/global/core/dataset/apiDataset/type.ts"
  - "packages/global/core/dataset/apiDataset/utils.ts"
  - "packages/global/openapi/core/dataset/api.ts"
  - "packages/dal/redis/bullmq/services/datasetPermissionSync.ts"
  - "packages/service/core/dataset/datasetPermissionSync/index.ts"
  - "packages/service/core/dataset/datasetPermissionSync/processor.ts"
  - "packages/service/core/dataset/apiDataset/permission/adapters/index.ts"
  - "packages/service/core/dataset/apiDataset/permission/adapters/custom.ts"
  - "packages/service/core/dataset/apiDataset/permission/resolver.ts"
  - "packages/service/core/dataset/apiDataset/permission/sync.ts"
  - "packages/service/core/dataset/apiDataset/permission/writer.ts"
  - "packages/service/core/dataset/apiDataset/service.ts"
  - "packages/service/core/dataset/apiDataset/custom/api.ts"
  - "packages/service/support/permission/collection/enable.ts"
  - "projects/app/src/pages/api/core/dataset/create.ts"
  - "projects/app/src/pages/api/core/dataset/update.ts"
  - "projects/app/src/pages/api/core/dataset/detail.ts"
  - "projects/app/src/pages/api/core/dataset/collection/create/apiCollectionV2.ts"
  - "projects/app/src/pages/api/core/dataset/collection/sync.ts"
  - "pro/admin/src/service/core/dataset/dataset/sync.ts"
routes:
  - "POST /api/core/dataset/create"
  - "PUT /api/core/dataset/update"
  - "GET /api/core/dataset/detail"
  - "POST /api/core/dataset/collection/create/apiCollectionV2"
  - "POST /api/core/dataset/collection/sync"
  - "POST /api/proApi/core/dataset/datasetSync"
related:
  - "FG-PERMISSION-RESOURCE-006"
  - "FG-DATASET-INGESTION-003"
  - "FG-DATASET-INGESTION-004"
  - "FG-DATASET-INGESTION-001"
baseline: "518be3e929; pro/cb1716a2"
---

# API 知识库外部文件权限同步、主体映射与队列容错

## 用例简介

自定义 API 知识库开启 `permissionSync` 后，系统应在配置创建/更新、文件导入、单集合内容同步及知识库全量同步链路中自动触发 BullMQ `datasetPermissionSync` 队列，将外部 `GET /v1/file/detail` 返回的文件权限收敛到本地集合 ACL。外部权限支持“未表达跳过、空数组仅保留 owner 兜底、有效列表四类主体解析并向继承态子树物化”的三态语义；部分节点失败跳过、整批或鉴权失败中止重试并在知识库详情透出状态，关闭开关或配置变更时丢弃在途陈旧轮次。

## 前置准备

- 环境与版本：本地 dev 环境启动主站 App 与 Pro 服务（含 `initDatasetPermissionSyncWorker` 与 Pro `initDatasetSyncWorker`），连接真实 MongoDB、Redis（BullMQ `datasetPermissionSync` 与 `datasetSync` 队列）及本机受控 Custom API HTTP 夹具服务；dev 环境内网地址放行，不填写真实生产凭证，Authorization 使用环境变量或运行期随机 token `RUN_API_TOKEN`。
- 身份与权限：新建独立测试团队 `T`（记录 `teamId`），准备知识库 owner `O`（`tmbId=O_tmb`）、同团队普通成员 `A`（`username=RUN_user_a`、`tmbId=A_tmb`）、同团队普通成员 `B`（`tmbId=B_tmb`）、成员组 `G`（`groupId=G_id`）、组织部门 `Org`（`orgId=Org_id`）；另备外部团队 `T2` 的同名或异名成员 `X`（`username=RUN_user_x`、`tmbId=X_tmb`）作为跨团队隔离负对照。
- 受控外部 API 夹具：按 `RUN` 隔离路径，实现 `POST /v1/file/list`、`GET /v1/file/detail`、`GET /v1/file/content`、`GET /v1/file/read`，记录每个 `id` 的请求次数、请求头与响应延迟：
  - 根目录 `dir-1`（含子文件 `file-inherit`，其 detail 不返回 `permissions` 字段）；
  - 带子文档的复合文件 `doc-parent`（`type: 'file', hasChild: true`，其子文件为 `doc-child`，验证本地生成 `doc-parent#dir` 派生目录且 `metadata.apiFileSourceId='doc-parent'` 共用源 ID 拉取权限）；
  - 独立文件 `file-empty`（`permissions: []`）、`file-omitted`（无 `permissions` 字段）、`file-mixed`（含四类主体、重复主体不同角色、非法掩码 `permission: 7`、跨团队/不存在主体）。
- 复位约定：公共团队与成员/组/部门准备一次（基线 `D0`）；各子场景使用新建独立 API 知识库 `K_i`（记录 `datasetId`），避免队列历史失败任务或集合状态跨场景污染。异步同步任务以 500ms～1s 轮询 `GET /api/core/dataset/detail` 及队列/数据库状态，单轮最长等待 60 秒。
- 验证能力：HTTP 响应同时校验状态码与业务 JSON `code/statusText/data/zodError`；MongoDB 只读查询按 `{ teamId: T, datasetId: K_i }` 限定读取 `datasets`（`syncAll`、`collectionPermissionEnabled`、`collectionPermissionVersion`、`apiDatasetServer`）、`dataset_collections`（`_id`、`apiFileId`、`type`、`parentId`、`syncChildren`、`inheritPermission`、`metadata`）与 `resource_permissions`（`resourceType: 'collection'`、`resourceId`、`tmbId/groupId/orgId`、`permission`）；Redis/BullMQ 检查 `datasetPermissionSync` 任务状态与去重键；日志核查 `[permissionSync]` 记录且不包含任何明文 `username`。
- 清理方式：测试结束后通过 `DELETE /api/core/dataset/delete?id=<K_i>` 清理本轮知识库及集合/ACL，移除测试团队 `T`/`T2` 与本地 HTTP 夹具，确认 `datasetPermissionSync` 无本轮残留 waiting/delayed/failed 任务。

## 测试步骤

| 子场景 | 类型与起始状态 | 输入与操作 |
| --- | --- | --- |
| S1 | 基础场景；基线 `D0` | 1. 调用 `POST /api/core/dataset/create` 创建 `type: 'apiDataset'` 且 `apiDatasetServer: { apiServer: {...}, permissionSync: true }` 的 `K_1`；另建未开同步的 `K_1b`，先深层单选导入 `dir-1` 下 `file-inherit`（带 `ancestorPaths: ['dir-1']`，使 `dir-1` 以 `syncChildren: false` 补建），再调用 `PUT /api/core/dataset/update` 仅传局部 patch `{ id: K_1b, apiDatasetServer: { permissionSync: true } }`。<br>2. 在 `K_1` 调用 `POST /api/core/dataset/collection/create/apiCollectionV2` 传入 `{ datasetId: K_1, syncAll: true, apiFiles: [] }` 整库导入（另可在独立副本对照旧客户端传 `apiFiles: [{ id: 'SYSTEM_ROOT', ... }]` 入口归一兼容），随后修改夹具中 `doc-parent` 正文与权限，调用 `POST /api/core/dataset/collection/sync` 触发单集合内容更新重建。<br>3. 在 `K_1b` 开启 `Dataset.syncAll = true`（或预置升级过渡期历史 `apiFileId: 'SYSTEM_ROOT'` 哨兵集合），修改夹具根目录新增文件与权限，调用 `POST /api/proApi/core/dataset/datasetSync` 执行整库同步；再构造一轮正文拉取报错但仍走 `finally` 的知识库同步。 |
| S2 | 基础与边界场景；基线 `D0`，新建 `K_2` 开启 `permissionSync: true` 并导入测试文件树，另在 `dir-1` 下手动挂一个无 `apiFileId` 的本地目录 `local-dir` 及其下外部文件 | 配置夹具 `GET /v1/file/detail` 返回不同权限形态并触发全量/定向权限同步：<br>1. `file-omitted` 省略 `permissions`，另设 `file-invalid` 返回非空但全部非法的权限项（如 `permission: 7`、同时传 `username` 与 `tmbId`），`file-404` 返回 HTTP 404（`NOT_FOUND`）；<br>2. `file-empty` 返回 `permissions: []`；<br>3. `file-mixed` 返回 `[ { username: 'RUN_user_a', permission: 4 }, { tmbId: A_tmb, permission: 2 }, { groupId: G_id, permission: 4 }, { orgId: Org_id, permission: 1 }, { tmbId: O_tmb, permission: 4 }, { username: 'RUN_user_x', permission: 1 }, { tmbId: 'non-object-id', permission: 4 }, { tmbId: B_tmb, permission: 7 } ]`；<br>4. `dir-1` 返回给 `B_tmb` 授予 `ReadRoleVal(4)`，其子 `file-inherit` 省略 `permissions`，同目录下的 `file-empty` 明确返回 `[]`；`doc-parent` 返回给 `A_tmb` 授予 `WriteRoleVal(2)`。 |
| S3 | 异常与边界场景；基线 `D0` | 1. 调用 `POST /api/core/dataset/create` 分别尝试在 `feishuServer`、`yuqueServer`、`dingtalkServer`、空 `apiDatasetServer` 以及 `type: 'folder'`（带 `apiServer`）上传 `permissionSync: true`。<br>2. 对已有 `feishuServer` 知识库及 `type: 'folder'` 目录分别调用 `PUT /api/core/dataset/update` 仅传局部 patch `{ apiDatasetServer: { permissionSync: true } }`；再对 `type: 'folder'` 传 `{ apiDatasetServer: { permissionSync: false } }` 与空对象 `{}` 对照。 |
| S4 | 异常与恢复场景；基线 `D0`，新建 `K_4` 含 3 个外部文件（小于单批并发 10）及另一组 12 个外部文件（跨满批 10 + 末批 2） | 1. 单节点失败：3 个文件中仅 1 个 `detail` 返回 HTTP 500，其余 2 个返回新权限，执行同步并查询 `GET /api/core/dataset/detail`。<br>2. 整轮/满批与鉴权失败：分别让 3 个文件全部返回 HTTP 500、12 个文件前 10 个满并发批全部返回 500、任意 1 个文件返回 HTTP 401（`UNAUTHORIZED`），等待重试耗尽后查询 `GET /api/core/dataset/detail`。<br>3. 恢复：夹具恢复正常返回后触发一次全量同步，完成后再次查询 `detail`；再将 `permissionSync` 改为 `false` 后查询 `detail`。 |
| S5 | 并发与状态切换边界；基线 `D0`，新建 `K_5` | 1. 去重与同库租约：令夹具 `detail` 挂起 3 秒，先触发 1 个执行中的同步任务占住 `dataset-permission-sync:<K_5>` 租约，期间连续投递 2 次全量同步、以及节点顺序相反的 2 次相同集合集 `[c1, c2]` / `[c2, c1]` 与 1 次不同集合集 `[c3]` 定向同步。<br>2. 陈旧轮次保护：在同步任务抓取外部 `detail` 挂起期间，调用 `PUT /api/core/dataset/update` 将 `permissionSync` 置为 `false`，并手动调整集合协作者为 `M_custom`，随后放行夹具响应让该轮进入写库阶段；再观察已在队列排队的后续权限同步任务执行结果。 |

## 预期结果

公共断言：所有写入集合 ACL 的记录在 `resource_permissions` 中均满足单一有效角色值（`4`/`2`/`1`/`4294967295`），绝不落入组合掩码（如 `7`），也不持久化或向日志输出任何 `username`；每个已同步为独立态（`inheritPermission: false`）的集合在 `resource_permissions` 中必有且仅有一条 `OwnerRoleVal(4294967295)` 记录。

| 子场景 | 验证方式 | 特有预期 | 证据获取方式 |
| --- | --- | --- | --- |
| S1 | API、数据库、队列 | 1. `K_1` 创建后立即 `collectionPermissionEnabled=true`；`K_1b` 深层导入后 `dir-1` 以 `syncChildren=false` 补建，局部 patch 开启 `permissionSync` 在同事务内完成存量集合快照物化（`collectionPermissionEnabled=true`、`collectionPermissionVersion` 递增）并在事务提交后入队全量 `datasetPermissionSync`。<br>2. `apiCollectionV2` 传入 `{ syncAll: true, apiFiles: [] }`（或旧客户端 `SYSTEM_ROOT` 归一）后，落盘 `K_1.syncAll=true` 且不创建 `SYSTEM_ROOT` / `ROOT_FOLDER` 哨兵集合，远端顶层节点直接落在知识库根并按根种子（含 `doc-parent#dir`）入队定向权限同步；`collection/sync` 正文变化导致集合换新 `_id` 后，按 `apiFileId` 查得新集合 `_id` 入队定向权限同步，新集合收敛到最新外部权限。<br>3. `K_1b` 整库同步按 `Dataset.syncAll=true`（或升级过渡期 `hasLegacySystemRoot` 等价语义）从 `listFiles({ parentId: null })` 展开全库且不误删整库；无论结构/正文同步成功或抛错，`finally` 均入队全量权限同步并将本地集合 ACL 收敛到外部最新权限。 | 创建/更新/详情响应、`datasets` 与 `dataset_collections` 前后快照、BullMQ 任务记录。 |
| S2 | 数据库、HTTP 夹具、日志 | 1. `file-omitted`、`file-invalid`、`file-404` 均按“外部未提供”跳过，保留原 `inheritPermission` 与本地 ACL 不变，`file-invalid` 记录 warn 日志而非清空协作者。<br>2. `file-empty` 翻转为 `inheritPermission: false`，协作者仅保留知识库 owner `{ tmbId: O_tmb, permission: OwnerRoleVal }`。<br>3. `file-mixed` 中：`RUN_user_a` 与 `A_tmb` 归并为同一主体并取更强角色 `WriteRoleVal(2)`；`G_id` 为 `4`、`Org_id` 为 `1`；`O_tmb` 因原列表无 owner 被原地提升为 `OwnerRoleVal`（不产生重复 `O_tmb` 行）；跨团队 `RUN_user_x`、非法 ID 及掩码 `7` 均被丢弃。<br>4. `dir-1` 变为 `inheritPermission: false` 且含 `B_tmb: 4 + O_tmb: owner`；继承态子级 `file-inherit`（保持 `inheritPermission: true`）自动物化合并 `B_tmb: 4`，同级明确目标态 `file-empty` 被 `stopResourceIds` 截断不被父目录覆盖；`doc-parent` 与 `doc-parent#dir` 共用单次 `GET /v1/file/detail?id=doc-parent` 请求并同步相同外部权限；定向同步穿过无 `apiFileId` 的 `local-dir` 同步其下外部子文件。 | `dataset_collections` 与 `resource_permissions` 精确快照、夹具按 `id` 的请求计数、worker 日志。 |
| S3 | API、数据库 | 1. 非 `apiServer` provider 及 `type: 'folder'` 开启 `permissionSync: true` 的创建与局部 patch 更新全部返回 HTTP `400`、`code: 400`、`zodError` 指向 `permissionSync`，数据库不写入脏配置、不触发 `enableDatasetCollectionPermissions` 或同步队列。<br>2. `type: 'folder'` 传 `permissionSync: false` 或空 patch `{}` 返回 HTTP `200`、`code: 200`。 | 各请求原始 HTTP 状态与响应体、`datasets` 文档快照。 |
| S4 | API、数据库、队列、日志 | 1. 单节点 500 时，健康节点成功更新 ACL，失败节点保留原 ACL，任务以成功结束（`failed: 1`），`detail` 中 `permissionSyncStatus='active'`。<br>2. 整轮全败、满并发批（10 个）全败或 `UNAUTHORIZED` 时，整轮中止且无半轮落库；重试结束后 `GET /api/core/dataset/detail` 返回 `permissionSyncStatus: 'error'` 且 `permissionSyncErrorMsg` 非空。<br>3. 全量同步恢复成功后清理该知识库已被取代的 failed jobs，`detail` 恢复 `permissionSyncStatus: 'active'` 且无 `permissionSyncErrorMsg`；关闭 `permissionSync` 后 `detail` 不再返回 `permissionSyncStatus` 字段。 | `GET /api/core/dataset/detail` 响应、前后 `resource_permissions` 差集、BullMQ failed/completed 队列记录。 |
| S5 | 数据库、队列、日志 | 1. 重复全量任务按 `datasetId` 去重，顺序相反的 `[c1, c2]` 与 `[c2, c1]` 生成相同指纹去重而 `[c3]` 保留独立任务；争抢同库租约的后到任务进入 `delayed`/`waiting` 重排且 `attemptsMade` 不因等锁递增。<br>2. 抓取期间关闭 `permissionSync` 后，在途轮次在写事务内递增 `collectionPermissionVersion` 重读发现配置已失配（`PermissionSyncStaleRoundError`），回滚丢弃旧目标态，手动设置的 `M_custom` ACL 完好保留；队列中排队的旧任务启动重读开关后以 `UnrecoverableError` 立即结束不重试。 | BullMQ job `id/name/attemptsMade/state` 快照、`datasets.collectionPermissionVersion` 与 `resource_permissions` 最终快照。 |
