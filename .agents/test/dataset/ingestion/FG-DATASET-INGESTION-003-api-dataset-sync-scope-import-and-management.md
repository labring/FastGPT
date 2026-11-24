---
case_version: 1
id: "FG-DATASET-INGESTION-003"
title: "API 知识库同步范围配置、树形导入与删除收口"
business: "dataset/ingestion"
types: [api, ui, e2e]
category: basic
scenario: success
priority: P0
status: ready
tags: [api-dataset, sync-scope, 覆盖基础场景, 覆盖异常场景, 覆盖边界场景]
evidence: [ui, response, database]
sources:
  - .agents/design/core/dataset/api-dataset-sync-scope-design.md
  - packages/global/openapi/core/dataset/apiDataset/api.ts
  - packages/global/openapi/core/dataset/collection/createApi.ts
  - packages/service/core/dataset/apiDataset/service.ts
  - projects/app/src/pages/api/core/dataset/apiDataset/syncState.ts
  - projects/app/src/pages/api/core/dataset/update.ts
  - projects/app/src/pages/api/core/dataset/collection/update.ts
  - projects/app/src/pages/api/core/dataset/collection/delete.ts
  - projects/app/src/pageComponents/dataset/detail/Import/diffSource/APIDataset.tsx
  - projects/app/src/pageComponents/dataset/detail/CollectionFolderCard.tsx
  - projects/app/src/pageComponents/dataset/detail/Info/index.tsx
routes:
  - "GET /api/core/dataset/apiDataset/syncState"
  - "POST /api/core/dataset/apiDataset/list"
  - "POST /api/core/dataset/collection/create/apiCollectionV2"
  - "POST /api/core/dataset/update"
  - "POST /api/core/dataset/collection/update"
  - "POST /api/core/dataset/collection/delete"
  - "POST /api/core/dataset/collection/listV2"
related:
  - FG-DATASET-INGESTION-004
automation: []
baseline: "8476352ca9"
---

# API 知识库同步范围配置、树形导入与删除收口

## 用例简介

API 知识库以 `Dataset.syncAll` 和 `DatasetCollection.syncChildren` 作为同步范围的唯一真实来源，不再创建 `SYSTEM_ROOT` / `ROOT_FOLDER` 哨兵目录。本例验证用户在树形导入弹窗中进行深层单选导入、暂停目录内补选或恢复同步、在信息页与目录侧栏切换全量/目录同步开关，以及主动删除 API 集合时父级与全量开关的事务级收口和权限/非法输入拦截。

## 前置准备

- 环境与版本：本地 dev 环境 `BASE_URL`（如 `http://127.0.0.1:3000`），代码基线 `8476352ca9`；使用真实 MongoDB、Redis 与已配置模型目录；无需启动 Pro BullMQ 同步 Worker（同步引擎异步执行由 `FG-DATASET-INGESTION-004` 验证）。
- 远端夹具：在本地启动可控自定义 API 知识库 HTTP 服务（响应格式 `{ success, message, data }`），以本次 `runId` 隔离目录树，初始包含：
  - 顶层目录 `DirA` -> 子目录 `DirB` -> 文件 `file1.md`、`file2.md`、`file3.md`；
  - 顶层文件 `rootDoc.md`；
  - 带子文档的文件 `docA`（含子文档 `docA1.md`）。
- 身份与权限：本轮新建测试团队 `T_<runId>`，包含：
  - 团队所有者 / 集合 owner `OwnerA`（具备知识库与集合 `Owner`/`Manage` 权限）；
  - 协作者 `WriterB`（仅具备知识库与集合 `Write` 权限，无 `Manage`/`Owner` 权限）。
  认证凭证通过环境变量或临时 cookie/API Key 注入，不写入用例或报告。
- 测试数据：
  - `OwnerA` 创建自定义 API 知识库 `DS_API_<runId>`（指向上述本地 HTTP 夹具，初始 `syncAll` 缺省/false）与普通知识库 `DS_COMMON_<runId>`（用于 C5 负面校验）。
  - 在 `DS_API_<runId>` 下额外手动创建一个普通自建目录 `LocalFolder`（无 `apiFileId`，用于 C5 负面校验）。
- 复位约定：C1–C4 在 `DS_API_<runId>` 上按顺序连续流转，每步记录操作前后 Mongo 快照；C5 复用 `DS_API_<runId>` 与 `DS_COMMON_<runId>`，只执行被拒绝的请求，不破坏前置状态；C6 新建空 API 知识库 `DS_FULL_<runId>` 独立验证整库全量导入。
- 验证能力：浏览器 UI 操作与网络面板、HTTP API 响应 JSON、MongoDB 只读查询（`datasets`、`dataset_collections`、`team_audit_logs`，按 `teamId` 与 `datasetId` 严格过滤）。本例当前无自动化脚本，由 AI 或测试人员结合真实浏览器与 API 执行。
- 关联标识：记录 `runId`、`teamId`、`DS_API_<runId>`、`DS_COMMON_<runId>`、`DS_FULL_<runId>` 及各集合 `_id` / `apiFileId`。
- 清理方式：测试结束后调用知识库删除接口清理 `DS_API_<runId>`、`DS_COMMON_<runId>`、`DS_FULL_<runId>`，停止本地 HTTP 夹具进程，并查库确认本轮 `datasetId` 下无残留 `datasets` 和 `dataset_collections` 记录。

## 测试步骤

| 子场景 | 类型与起始状态 | 输入与操作 |
| --- | --- | --- |
| C1 | 基础场景；`DS_API_<runId>` 初始为空，无已导入 API 集合 | `OwnerA` 打开知识库详情页进入 API 知识库导入弹窗（`APIDataset`），展开 `DirA` -> `DirB`，仅勾选深层文件 `file1.md` 并完成上传提交（触发 `POST /api/core/dataset/collection/create/apiCollectionV2`，携带 `ancestorPaths`）；随后调用 `GET /api/core/dataset/apiDataset/syncState` 并刷新集合列表。 |
| C2 | 边界场景；承接 C1（`DirA`、`DirB` 均为 `syncChildren: false`，仅 `file1.md` 已导入） | 再次打开 `APIDataset` 导入弹窗，观察 `DirA`/`DirB` 标签与可展开性；① 展开 `DirB`，仅勾选 `file2.md` 导入；② 再次打开导入弹窗，直接勾选暂停态目录 `DirB`（不展开单选）并提交导入。 |
| C3 | 基础/配置切换；承接 C2（此时 `DirA.syncChildren: false`、`DirB.syncChildren: true`、`Dataset.syncAll: false`） | ① 在知识库右侧信息页（`Info`）开启「全量同步」开关（`POST /api/core/dataset/update`，`syncAll: true`），刷新页面确认状态；② 调用 `POST /api/core/dataset/collection/update` 将 `DirB` 的 `syncChildren` 设为 `false`，刷新信息页与 `DirB` 目录侧栏（`CollectionFolderCard`）；③ 在 `DirB` 目录侧栏点击「点击恢复」并在确认弹窗点击确认。 |
| C4 | 边界场景；承接 C3，先将 `DS_API_<runId>` 恢复为 `syncAll: true` 且 `DirA`/`DirB` 均为 `syncChildren: true`，并导入 `rootDoc.md` 与带子文档节点 `docA`（含 `docA#dir` 与 `docA1.md`） | ① `OwnerA` 调用 `POST /api/core/dataset/collection/delete`（传 `collectionIds`）删除 `DirB` 下的 `file3.md`；② 重新将 `syncAll` 置 `true` 后，删除根目录直属 `rootDoc.md`；③ 按 `apiFileIds: ['docA']` 调用删除接口删除带子文档节点 `docA`。 |
| C5 | 异常场景；承接 C4（`DS_API_<runId>` 与 `DS_COMMON_<runId>` 均存在） | 依次执行 5 组非法/越权请求：① 对 `DS_COMMON_<runId>` 调 `POST /api/core/dataset/update` 传 `syncAll: true`；② 对 `DS_API_<runId>` 的 `LocalFolder` 与 `file1.md` 分别调 `POST /api/core/dataset/collection/update` 传 `syncChildren: false`；③ 调 `create/apiCollectionV2` 传入伪造不存在的 `ancestorPaths`（如 `['non_exist_dir']`）；④ `WriterB` 调 `dataset/update` 改 `syncAll` 与 `collection/update` 改 `DirA.syncChildren`；⑤ `WriterB` 调 `collection/delete` 删除 `DirB` 下的 `file2.md`。 |
| C6 | 基础/边界场景；独立新建空 API 知识库 `DS_FULL_<runId>` | `OwnerA` 调用 `POST /api/core/dataset/collection/create/apiCollectionV2`，传入 `{ datasetId: DS_FULL_<runId>, syncAll: true, apiFiles: [] }`，完成后查询 `syncState`、`listV2` 与 Mongo 集合表。 |

## 预期结果

公共断言：所有接口响应均校验 HTTP 状态与业务 `code`/`data`；数据库查询均按本轮 `teamId` 与 `datasetId` 过滤；任意场景结束后，`dataset_collections` 中均不得出现 `apiFileId: 'SYSTEM_ROOT'` 或 `name: 'ROOT_FOLDER'` 的哨兵记录。

| 子场景 | 验证方式 | 特有预期 | 证据获取方式 |
| --- | --- | --- | --- |
| C1 | UI、API、Mongo | `create/apiCollectionV2` 返回 `failedCount: 0`、`successCount: 3`；Mongo 中新建 `DirA`（`parentId: null`, `syncChildren: false`）、`DirB`（`parentId: DirA._id`, `syncChildren: false`）与 `file1.md`（`parentId: DirB._id`），不将 `file1.md` 误挂知识库根；`syncState` 返回 `syncAll: false` 且 `collections` 准确反映三个节点的 `sourceId` 与 `syncChildren`。 | 导入请求响应 JSON、`syncState` 响应、`dataset_collections` 快照 |
| C2 | UI、API、Mongo | 弹窗中 `DirA`/`DirB` 展示「暂停同步新增」标签且复选框未锁死、可继续展开；① 补选 `file2.md` 后 `file2.md` 落在 `DirB` 下，且 `DirB.syncChildren` 仍为 `false`、`file3.md` 未被拉取；② 勾选 `DirB` 时展示恢复同步标签，提交后 `DirB.syncChildren` 更新为 `true`，且缺失的 `file3.md` 被补齐入库。 | 弹窗截图/DOM 文本、两次导入前后 `dataset_collections` 差集 |
| C3 | UI、API、Mongo、审计 | ① 开启「全量同步」后 `Dataset.syncAll === true`，同事务内 `DirA.syncChildren` 被批量重置为 `true`，审计表 `team_audit_logs` 新增 `DATASET_CONFIG_UPDATE` 记录；② 将 `DirB.syncChildren` 置 `false` 后，同事务内 `Dataset.syncAll` 自动关闭为 `false`，信息页开关变为关闭，`DirB` 侧栏展示「已暂停自动同步该目录新增文件，」及「点击恢复」；③ 确认恢复后 `DirB.syncChildren` 变为 `true`，页面提示「已开启自动同步新增内容，将在下次手动或定时同步时拉取新增文件」，且 `Dataset.syncAll` 保持 `false`。 | `datasets` 与 `dataset_collections` 快照、审计日志查询、页面提示与刷新后状态 |
| C4 | API、Mongo | ① 删除 `file3.md` 后同事务内仅直接父目录 `DirB.syncChildren` 置 `false`、`Dataset.syncAll` 置 `false`，祖父目录 `DirA.syncChildren` 保持 `true`（不级联上翻）；② 删除顶层 `rootDoc.md` 后 `Dataset.syncAll` 置 `false`；③ 按 `apiFileIds: ['docA']` 删除时，`docA#dir` 派生目录及其子文档 `docA1.md` 与正文完整删除无孤儿残留。 | 删除前后 `datasets`、`dataset_collections` 快照对比 |
| C5 | API、Mongo | ①② 返回业务错误 `invalidParams`，数据库无写入；③ 请求失败返回目录结构已变更错误，Mongo 无新建目录或文件残留；④⑤ 返回权限不足错误，且 `DS_API_<runId>` 的 `syncAll`、各目录 `syncChildren` 及 `file2.md` 均未改变。 | 5 次请求响应错误码与操作前后 Mongo 快照比对 |
| C6 | API、Mongo | `create/apiCollectionV2` 返回 `failedCount: 0`；`DS_FULL_<runId>` 的 `Dataset.syncAll === true`；远端顶层节点 `DirA`、`rootDoc.md`、`docA` 等直接落在知识库根（`parentId: null`），`syncState` 返回 `syncAll: true`，且库内无 `SYSTEM_ROOT` / `ROOT_FOLDER` 记录。 | `syncState`、`listV2` 响应与 `datasets`/`dataset_collections` 全量查询 |
