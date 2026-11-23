---
case_version: 1
id: "FG-DATASET-INGESTION-004"
title: "API 知识库同步引擎范围约束、远端移动与防误删保护"
business: "dataset/ingestion"
types: [integration]
category: boundary
scenario: special
priority: P0
status: ready
tags: [api-dataset, sync-engine, bullmq, 覆盖基础场景, 覆盖异常场景, 覆盖边界场景]
evidence: [database, queue, log, response]
sources:
  - .agents/design/core/dataset/api-dataset-sync-scope-design.md
  - pro/admin/src/service/core/dataset/dataset/sync.ts
  - packages/service/core/dataset/apiDataset/syncPlan.ts
  - packages/service/core/dataset/apiDataset/tree.ts
  - packages/service/core/dataset/apiDataset/utils.ts
  - packages/service/core/dataset/apiDataset/custom/api.ts
  - packages/service/core/dataset/datasetSync/index.ts
routes: []
related:
  - FG-DATASET-INGESTION-003
automation: []
baseline: "8476352ca9; pro/b2198137"
---

# API 知识库同步引擎范围约束、远端移动与防误删保护

## 用例简介

API 知识库通过 Pro 同步 Worker 的 `apiDatasetProcessor` 异步拉取远端变更，并严格依据 `Dataset.syncAll` 与 `DatasetCollection.syncChildren` 判定同步边界。本例验证真实同步任务在局部暂停、全量总开关开启、带子文档派生目录删正文、远端文件移动到未展开目录，以及远端真删除与瞬时故障时的落库、清理与防误删保护行为。

## 前置准备

- 环境与版本：在本地 dev 模式运行包含本次改动的 Pro `initDatasetSyncWorker`（基线 FastGPT `8476352ca9` + fastgpt-pro `b2198137`），连接真实 MongoDB、PG 向量库与隔离 Redis BullMQ 队列；复制 dev 模型目录配置，不修改共享业务数据。
- 远端夹具：在本地启动可控自定义 API 知识库 HTTP 服务，实现 `listFiles`、`getFileDetail` 与文件内容读取接口，按本次 `runId` 独立维护内存目录树，并支持按场景动态增删改节点、移动节点及注入 HTTP 500 / 非协议 HTML 响应。
- 身份与权限：本轮新建测试团队 `T_<runId>` 与 owner 成员；通过真实 Mongo 夹具与 `DatasetSync` BullMQ 队列投递同步任务。本例为服务集成测试，不覆盖浏览器 UI 交互或向量检索质量。
- 复位约定：每个子场景使用独立创建的自定义 API 知识库 `DS_<runId>_C<n>`，先构造对应初始 Mongo 集合与远端目录树快照，再投递一次真实同步任务。
- 验证能力：
  - BullMQ 任务完成/失败事件（单次任务最长等待 120 秒，超时判失败或阻塞，不使用固定 sleep 判成功）；
  - MongoDB 只读查询（按 `teamId` 与 `datasetId` 过滤 `datasets`、`dataset_collections`、`dataset_datas`、`dataset_trainings`）；
  - Pro Worker 日志（核对 `Dataset sync task started`、`Dataset sync api dataset finished`、`Dataset sync expired collections deleted`、`Dataset sync query root collection detail failed`、`API dataset response format is invalid` 等实际日志）。
- 关联标识：记录 `runId`、`teamId`、各子场景 `datasetId`、BullMQ `jobId` 及操作前后集合 `_id/apiFileId/parentId/syncChildren/hashRawText` 快照。
- 清理方式：停止本轮本地 HTTP 夹具与独占 Worker，按本轮 `datasetId` 清单清理 Mongo、PG 与 Redis 中登记的数据，确认无残留队列任务与无关数据改动。

## 测试步骤

| 子场景 | 类型与起始状态 | 输入与操作 |
| --- | --- | --- |
| C1 | 基础场景；`DS_<runId>_C1`（`syncAll: false`），本地已有 `DirA`（`syncChildren: false`）-> `DirB`（`syncChildren: true`）-> `file1.md`（以及历史兼容目录 `DirLegacy`，`syncChildren` 字段缺省为 `undefined`） | 远端同时变更：① 根目录新增 `rootNew.md`；② `DirA` 下新增 `aNew.md`；③ `DirB` 下新增 `bNew.md` 且修改 `file1.md` 正文；④ `DirLegacy` 下新增 `legacyNew.md`。投递真实同步任务并等待完成。 |
| C2 | 边界/配置切换；`DS_<runId>_C2`（`syncAll: true`），本地存在历史残留暂停目录 `DirA`（`syncChildren: false`）与已导入 `file1.md`，且不存在 `SYSTEM_ROOT` 哨兵 | 远端根目录新增 `rootNew.md`、`DirA` 下新增 `aNew.md`。投递真实同步任务并等待完成。 |
| C3 | 边界场景；`DS_<runId>_C3`（`syncAll: false`），本地已有带子文档文件的派生目录 `docA#dir`（`syncChildren: false`，`metadata.apiFileSourceId: 'docA'`）及其子文档 `docA1.md`，正文 `docA` 已被用户主动删除 | 远端 `docA` 仍存在（正文未删），其下包含修改后的 `docA1.md` 与新增子文档 `docA2.md`。投递真实同步任务并等待完成。 |
| C4 | 边界场景；`DS_<runId>_C4`（`syncAll: false`），本地已导入 `DirB`（`syncChildren: true`）-> `file1.md`；远端另有未导入子树 `DirC/DirD`（内含无关文件 `other.md`） | 在远端将 `file1.md` 从 `DirB` 移动到 `DirC/DirD` 下（`getFileDetail` 返回新 `parentId: 'DirD'`）。投递真实同步任务并等待完成。 |
| C5 | 异常/容错场景；`DS_<runId>_C5`（`syncAll: false`），本地已导入顶层目录 `DirKeep` -> `keep.md` 与文件 `fileDel.md` | 分两步同步：① 远端彻底删除 `fileDel.md`（`getFileDetail` 返回明确 `NOT_FOUND`）并同步；② 将远端 `DirKeep` 详情接口注入异常（先测 HTTP 500，再测返回含 `"not found"` 文本的网关 HTML 非协议响应）并同步。 |

## 预期结果

公共断言：每次同步均等待 BullMQ 任务终态并核对 Worker 完成日志；所有数据库快照按 `teamId` 与 `datasetId` 严格限定；全程不创建 `SYSTEM_ROOT` 哨兵节点。

| 子场景 | 验证方式 | 特有预期 | 证据获取方式 |
| --- | --- | --- | --- |
| C1 | Mongo、队列、日志 | `rootNew.md` 与 `aNew.md` 未入库；`bNew.md` 与 `legacyNew.md`（验证 `syncChildren: undefined` 兼容视为 `true`）均新增入库且挂在对应父目录下；`file1.md` 正文更新并产生新训练记录；`DirA` 与 `DirB` 已有子树未被剪枝。 | 同步前后 `dataset_collections`/`dataset_trainings` 差集、Worker 完成日志 |
| C2 | Mongo、队列、日志 | 同步引擎直接从远端根枚举，不依赖 `SYSTEM_ROOT`；`syncAll: true` 覆盖局部 `DirA.syncChildren: false`，`rootNew.md` 与 `aNew.md` 均被拉取入库且层级与远端一致。 | 同步前后 `dataset_collections` 快照、远端夹具请求日志 |
| C3 | Mongo、队列、日志 | 本地不重建已删除的正文 `docA`，也不拉取新增的 `docA2.md`；派生目录 `docA#dir` 保留且仍为 `syncChildren: false`，子文档 `docA1.md` 正常更新。 | `dataset_collections` 与 `dataset_trainings` 快照对比 |
| C4 | Mongo、队列、日志 | 同步引擎通过 `getFileDetail` 识别为远端移动而非删除，自动补建 `DirC` 与 `DirD`（两者 `syncChildren` 均为 `false`），并将 `file1.md` 的 `parentId` 迁移至 `DirD._id`；`file1.md` 未被误删，且 `DirC/DirD` 下无关文件 `other.md` 未被拉取。 | 夹具 `getFileDetail` 调用记录、同步前后 `dataset_collections` 快照及父级校正日志 |
| C5 | Mongo、队列、日志 | ① `fileDel.md` 及其关联数据/训练记录被清理，日志记录 `Dataset sync expired collections deleted`；② 两种非 `NOT_FOUND` 故障下，均记录 `Dataset sync query root collection detail failed`（HTML 响应同时记录 `API dataset response format is invalid`），`DirKeep` 与 `keep.md` 集合及数据完整保留，不触发误删。 | 两轮同步前后集合快照、夹具响应记录与 Worker 错误/警告日志 |
