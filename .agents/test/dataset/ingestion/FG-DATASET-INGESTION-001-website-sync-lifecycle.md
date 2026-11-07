---
case_version: 1
id: FG-DATASET-INGESTION-001
title: 网站同步去重、更新与不完整同步的数据保护
business: dataset/ingestion
types: [integration]
category: boundary
scenario: special
priority: P0
status: ready
tags: [website, crawlee, 覆盖基础场景, 覆盖异常场景, 覆盖边界场景]
evidence: [database, log, queue, response]
sources:
  - pro/admin/src/service/common/crawler/index.ts
  - pro/admin/src/service/core/dataset/dataset/sync.ts
  - packages/service/core/dataset/collection/controller.ts
  - packages/service/core/dataset/datasetSync/index.ts
  - packages/dal/redis/bullmq/services/datasetSync.ts
routes: []
related: []
automation:
  - runner: node
    script: .agents/test/dataset/ingestion/FG-DATASET-INGESTION-001.mjs
    items: [C1, C2, C3, C4, C5, C6, C7]
baseline: pro/aaa0e109faf612d6d5f5f01c8686e82dfec9a80d
---

# 网站同步去重、更新与不完整同步的数据保护

## 用例简介

网站知识库经真实 BullMQ 同步任务抓取静态页面，写入集合、数据和训练队列。完整同步可以删除已不存在的旧页面；部分抓取或写入失败、达到页面上限时，应保留未确认过期的旧集合。抓取与转换保持单并发。

## 前置准备

- 在已获授权的本机 dev 模式执行本次 Pro 版本的 `initDatasetSyncWorker`；使用真实 dev Mongo/PG、独立 Redis 实例和本轮专用 Mongo 数据库。复制 dev 的系统模型目录配置，不复制业务用户或文档。测试角色为本轮新建团队 owner；所有 ID 记录在证据中。
- 这是服务集成测试，直接准备 Mongo 夹具并经真实 DAL 队列投递，不覆盖网页操作、HTTP 认证、embedding 模型调用或检索质量。训练入队成功不等于向量训练完成。dev 模式私网检查放行，不据此断言生产 SSRF 防护。
- 本地 HTTP 夹具以 run 标识隔离：正文为固定短文本，重复侧栏链接指向根、A、B。默认 maxPage=3，selector=`main`，自动索引和图片索引关闭。响应延迟用于记录实际并发；记录每个 URL 请求次数。
- 每行使用新 dataset，先通过相同真实 worker 建立所需基线，再修改本行夹具。C5 的链接位于 nav、main 为空，并用真实 Markdown 转换器确认正文长度为 0；不能把含完整 URL 的短链接误当成短 Markdown。C6 仅对本轮私有库的集合增加 Mongo validator，使指定新页面真实写入失败；结束后还原 validator。不得在共享业务库注入故障。
- 每次任务记录 BullMQ 完成/失败事件、datasetId/jobId、前后集合 `_id/rawLink/hashRawText/name`、数据及训练记录、目标 worker 日志。任务最长等待 120 秒；禁止仅凭队列完成就判业务成功。
- 清理只处理本轮数据库、Redis 容器和已登记 dataset 对应的 PG 数据；保留脱敏证据。所有临时凭证放仓库外，禁止写入报告。
- 自动化入口：先安装 monorepo 与 Pro 依赖并执行 `cd pro/admin && pnpm build:workers`。本机已有 `redis:7.2-alpine` 镜像，脚本不会自动下载。显式设置 `FASTGPT_TEST_SOURCE_APP_ENV`、`FASTGPT_TEST_SOURCE_ADMIN_ENV` 为本机 dev 配置文件的绝对路径，Mongo/PG 仅允许 localhost。正常检出默认使用仓库 `pro`；测试独立 Pro 工作树时设置 `FASTGPT_TEST_PRO_ROOT`。通过 `pnpm test:cases --report <临时HTML报告>` 执行；仅选择需要复测的场景时使用调度器 `--items`，不重复通过项。脚本不接入日常 CI。

## 测试步骤

| 子场景 | 起始状态与操作 |
| --- | --- |
| C1 | 新 dataset；根/A/B 含重复侧栏、锚点和回链，执行一次同步。 |
| C2 | 独立恢复 C1；不改正文重复同步，再只修改 A 的 head title 后同步。 |
| C3 | 独立恢复 C1；根移除 B 的链接并且所有存活页不再引用 B，执行完整同步。 |
| C4 | 独立恢复 C1；保留 B 链接，但 B 返回 HTTP 500，再同步。 |
| C5 | 新 dataset；根的 main 为空，nav 链接指向正文正常的 A，确认提取 Markdown 长度为 0 后执行同步。 |
| C6 | 独立恢复 C1；添加新页 N，旧页 B 不再可达，私有库 validator 拒绝 N 的集合写入，再同步；避免在页面上限前截断，夹具仅保留根/A/N。 |
| C7 | 独立恢复 C1；添加第四个有效页面 N，并把 B 变为不可达的旧页；提供根/A/N/X 共四个入口，maxPage=3 后同步。 |

## 预期结果

公共断言：所有查询按 teamId、datasetId 精确限定；检查实际 Mongo/训练队列副作用和 worker 完成日志，不使用 mock。单并发场景观察 HTTP 最大在途数为 1。所有选中项结束后清理本轮资源并核实无遗留 worker/队列。

| 子场景 | 验证方式 | 特有预期 | 证据获取方式 |
| --- | --- | --- | --- |
| C1 | Mongo、队列、HTTP、日志 | 根/A/B 各请求一次且恰好 3 个 link 集合，rawLink 唯一，hashRawText 非空，有对应数据及训练任务。crawlCompleted=true，无抓取或写入失败。 | 任务、集合与训练快照、请求计数、worker 日志 |
| C2 | Mongo、日志 | 重复同步集合 ID/hash 集合不变且没有新增训练任务；只改 A 标题后 ID/hash 不变、name 更新，更新成功后完成同步。 | 三次精确集合及训练 ID 快照 |
| C3 | Mongo、PG、日志 | 根/A 存在，B 的旧集合及关联数据/训练记录被清理，日志记录完整同步。 | 清理前后集合/数据/训练查询与日志 |
| C4 | Mongo、HTTP、日志 | B 的旧集合 ID/hash 仍在；有失败请求，crawlCompleted=false，过期删除被跳过。 | HTTP 500、旧 ID 存活查询、完成和保护日志 |
| C5 | Mongo、HTTP、日志 | A 被实际访问并创建集合；根无有效正文不入库，failedCount>0、crawlCompleted=false，禁止过期删除。 | 请求计数、A 集合、保护日志 |
| C6 | Mongo、日志 | N 的真实写入失败且无 N 集合；B 的旧 ID 仍在，pageSyncFailed=true、删除跳过原因 page-sync-failed。 | validator 配置、写失败日志、旧集合存活查询 |
| C7 | Mongo、HTTP、日志 | 有效写入不超过 3 页；即使请求队列排空也 crawlCompleted=false，B 旧 ID 保留。 | 入队截断日志、集合快照、保护日志 |
