# 知识库文档级训练存量迁移

在 App 的系统迁移中增加一次性任务。升级后由管理员启动，Runner 完成转换和校验后记录 `succeeded`。迁移逻辑全部收敛在迁移任务目录内（仅新增注册表项与展示文案），不修改现有训练业务、对账、队列和业务 Schema。脚本通过原生 Mongo 集合只读读取 `dataset_trainings` 和 `dataset_datas` 的历史状态，写入 `dataset_collections.training`、`dataset_qa_trainings`、`dataset_datas` 及续跑账单。迁移对旧 `dataset_trainings` 及其索引只读，旧表和迁移生成的无 TTL 临时快照集合待人工复核后由运维手动删除。已完成的正文、向量和全文索引直接沿用。本文是 PR #8498 的拟实施方案，源格式以 PR 基线 `1c5de9500` 为准，目标字段以 [Training Schema](../../../../packages/global/core/dataset/type.ts) 为准。续跑顺序见[文档级训练 Worker](../../../../projects/app/src/service/core/dataset/training/documentWorker.ts#L223)。

## 注册与执行

使用任务 ID `20261125_migrate_dataset_document_training`，按当前 4.18.0 迁移系列放在 `projects/app/src/migration/tasks/4180/20261125_migrate_dataset_document_training/`。在 `systemMigrations` 末尾登记 `version: '4.18.0'` 和 `manual: true`。管理员在「系统升级」确认旧训练已停止后启动任务。失败后的重试沿用同一次迁移的断点，`succeeded` 是终态。系统迁移入口只接受等待中的任务启动和失败任务重试。任务进入现有普通后台队列。系统配置已由 App 启动链准备，向量物理索引初始化与训练状态转换互不依赖。[手动任务先例](../../../../projects/app/src/migration/registry.ts#L260) · [手动启动与重试](../../../../projects/app/src/migration/service.ts#L146)

`index.ts` 编排四个阶段，`service.ts` 负责只读扫描、转换和校验。进度、失败明细与一次性执行状态由 `SystemMigrationContext` 管理。测试在 `projects/app/test/migration/tasks/` 镜像任务目录，注册时同步 `system_migration` 展示文案。[现有断点任务](../../../../projects/app/src/migration/tasks/4180/20261022_initialize_dataset_vector_indexes/index.ts#L18) · [系统升级任务约定](../../../../projects/app/src/migration/tasks/README.md)

## 切换顺序

首次执行时，旧 `dataset_trainings` 为空且 `dataset_datas` 无待迁旧状态，可免暂停和快照复制。已有新版轮次的 `rebuild*Pending / rebuild*Running` 属于正常新版训练。零存量时依次将四个阶段上报为 `running` 和 `succeeded`，返回零统计，由 Runner 记录任务成功。已有 checkpoint 或失败明细时优先恢复该次迁移进度，源表在此期间被 TTL 清空也继续使用原输入。[Runner 完成校验](../../../../projects/app/src/migration/runner.ts#L416)

1. 冻结训练写入，包括同步、导入、追加、重建、重试、删除和充值触发的训练恢复。让旧版 App、Pro 尽量跑完可执行项，确认旧消费者及其唤醒入口全部退出。新版 App 的启动屏障管不到旧进程，旧进程退出由切换操作确认。[App 启动顺序](../../../../projects/app/src/instrumentation-node.ts#L231)
2. 切换前由运维做常规一致性备份，覆盖 `dataset_trainings`、需回退的目标集合、账单和图片 TTL 记录。`preflight` 将旧任务和候选分块分别复制到无 TTL 的 `migration_20261125_dataset_training_tasks` 与 `migration_20261125_dataset_training_data`。快照行用原记录 `_id` 作主键。`source` 保存旧任务的完整原始字段，分块快照保存归属和训练状态，分块正文及索引在原记录读取。发生 TTL 缺口时，在快照封存前按相同结构从备份补入缺失记录。重试继续复用同一份冻结快照。旧表的 7 天 TTL 仍按原策略运行。[旧任务 TTL](../../../../packages/service/core/dataset/training/schema.ts#L139)
3. 在新版 App 启动前通过 BullMQ 全局暂停 `datasetTraining` 队列。新版 App 和 Pro 可以上线，管理员仍可打开系统迁移页面。管理员启动迁移后，脚本通过 `datasetTrainingMQService.getQueue()` 检查队列已暂停且在途 Job 为零，并在整个有存量执行期间通过 `LeaseCache` 持有 `datasetTrainingReconcile` lease，与启动和定时对账互斥。lease 被占用时由管理员在对账结束后重试。两次尝试之间继续冻结训练写入并保持队列暂停。已建轮次由 `usageId` 识别。欠费 QA 按本次切换时刻起算 30 天。[训练队列](../../../../packages/dal/redis/bullmq/services/datasetTraining.ts) · [对账入口](../../../../projects/app/src/service/core/dataset/training/documentReconcile.ts#L13)
4. 任务成功后，核对结果计数和代表性旧分块的召回，恢复 `datasetTraining` 队列，由现有启动或定时对账投递可执行文档，再放开训练写入。抽查一篇迁入文档续跑和一篇历史已索引文档检索后，由运维手动删除旧 `dataset_trainings` 和迁移生成的临时快照集合。

## 批次与完成条件

| 阶段 | 处理及出口 |
| --- | --- |
| `preflight` | 处理零存量或恢复已有进度。有存量时确认队列暂停且在途 Job 为零，取得 `datasetTrainingReconcile` lease，固定切换时间及两份输入的 `_id` 上界和预期总量。按 `_id` 复制并核验两份无 TTL 快照，校验租户归属、已有新版轮次冲突和源格式。按 `teamId` 重算并保存余额判定。 |
| `legacyTasks` | 按临时快照的旧任务 `_id` 游标恢复解析、QA、首次索引及增强记录。重建任务的错误和欠费信息作为下一阶段的补充依据。 |
| `remainingData` | 按临时快照的分块 `_id` 续扫，补齐没有旧任务的 `indexing / error` 及两类重建状态。上一阶段已转换的分块在本阶段校验并计为已迁入。确认每个保留下来的工作项都有对应文档轮次。 |
| `validation` | 按冻结快照核对迁入、已完成、重复 `parse` 跳过和父级已删除的计数，检查每个有效工作项的目标状态、归属与唯一账单。在队列仍暂停时按团队刷新余额，同步本次迁入文档的执行状态。仍有无法归属或还原的有效记录时，带错误明细结束为 `failed`。校验通过后返回有限标量统计，由 Runner 记录成功。 |

采用分批断点续跑，复用 `SYSTEM_MIGRATION_BATCH_SIZE`（默认 100）。checkpoint 保存切换时间、快照封存状态、预检状态，以及每份输入的 `_id` 上界、复制游标、处理游标与计数。两份快照都与预期总量核对后才标记为可用。中途退出时按固定上界续拷，已复制的 `_id` 幂等保留。若旧表 TTL 在复制期间造成缺口，预检失败，从切换备份补进尚未封存的快照后再重试。[迁移运行约定](../../../../.agents/skills/system/system-migration-development/SKILL.md)

分块复制分别按 `indexStatus` 和 `rebuilding: true` 统计上界与总量，并使用各自的 `_id` 复制游标。同时命中的分块归入 `rebuilding: true` 一侧，两侧写入同一份分块快照。`indexStatus` 查询可使用现有状态索引，旧布尔标记由独立查询兼容。未保留旧标记索引的库仍可能在这条兼容查询中扫描分块集合。[分块输入查询](../../../../projects/app/src/migration/tasks/4180/20261125_migrate_dataset_document_training/snapshot.ts)

转换从核验通过的快照恢复工作，目标状态改变后仍能在重放时找到源记录。扫描时分批读取，逐条验证任务 lease 和 `datasetTrainingReconcile` lease，在同一 Mongo 事务中提交该条的工作项、源记录回执和所需的账单与轮次。每批结束后保存失败快照、推进 checkpoint、更新进度。重试时先处理已记录的失败项，再继续扫描。错误明细保存定位 ID 和原因，正文和草稿仍从快照或业务源读取。

账单、文档轮次和首批工作共用事务。每篇文档的新账单在迁移脚本内按 `(migrationId, collectionId)` 派生确定性的 12 字节 `ObjectId` 作为 `usageId`，幂等写入 `MongoUsage` 和 `MongoUsageItem`（字段结构对齐 `createTrainingUsage`），并绑定到 `collection.training.usageId`。QA 和新建的历史分块用源任务 `_id` 作确定键，已有分块按完整归属和预期旧状态更新。大文档可分多批或跨阶段写入，训练暂停覆盖整个迁移期。后续批次和重放通过比对 `collection.training.usageId` 是否等于该确定性 ID 来区分本次迁移自建轮次与外部新版业务轮次：自建轮次直接复用并校验，外部轮次则报冲突。完成条件是每条有效源记录都可核对去向，旧表和临时快照仍可用于人工逐项复核。

## 历史状态映射

| 源记录 | 写入结果 |
| --- | --- |
| `parse` | 同一文档只取目标归属一致的单条旧记录，以冻结快照中 `_id` 最大的一条为准。写入 `collection.training.parse`，可执行项为 `active`，最终失败为 `error` 并保留原错误。同归属的较早记录只计为跳过，重试仍使用同一条记录。 |
| `qa` | 用旧任务 `_id` 写入 `dataset_qa_trainings`，保留原文、`chunkIndex`、元数据和最终错误。 |
| `imageParse / image / auto / index`，关联待首次索引的分块 | 沿用原 `dataId`，按任务的实际阶段写入 `indexStatus`。从旧任务恢复 `q / a / imageDescMap`，其中 `q / a` 的显式空串也以任务值为准。外部索引草稿写入 `draftIndexes`，`indexSize` 写入 `trainingIndexSize`，保留分块正式 `indexes`。最终失败另写 `indexError` 和 `indexErrorMsg`。 |
| `index`，关联已完成且索引引用有效的分块 | 计为已完成的残留任务。切换后由新版直接检索该分块。 |
| 旧 `chunk`、无 `dataId` 的历史增强任务 | 归属和输入能证明是首次索引时，用旧任务 `_id` 建立分块，保留阶段、元数据和草稿。含知识库临时图片时，在同一事务中按现有规则移除其 TTL。已有 `dataId` 时复用分块。能证明是重建时迁入对应重建阶段。缺失关联、ID 碰撞或无法判断来源时列入待核对项。 |
| 旧 `indexing`，找不到旧任务 | 保留原分块及其现有索引引用。能确认正文可用于重新索引的，标为 `index` 阶段的可重试错误，保留原错误或补充缺少源任务的原因。用户重试时用现存内容，过期前仅存在于任务里的草稿需从快照或备份恢复。无法确认分块完整性的列入待核对项。无对应旧任务的存量 `error` 分块属于已取消/终态分块，迁移时保持原终态不扫描、不重新纳入活跃工作阶段。 |
| `rebuildIndex* / rebuildSynonym*` | 分块状态为准，包括只有 `Pending` 且从未生成旧任务的分块。`Running` 回到对应 `Pending`。因欠费锁定被标成 `rebuildIndexFailed / rebuildSynonymFailed`（错误原因为旧版 `common:code_error.team_error.ai_points_not_enough`）的分块还原为对应 `Pending` 并清空 `indexErrorMsg`；非欠费导致的真正重建失败统一迁为对应 `Pending` 并写入 `indexError: true` 与原 `indexErrorMsg`。在每个有剩余工作或异常的文档上建立轮次，保留正式索引、全文及词表版本。 |

暂时失败仍有旧重试次数的项迁为可执行，由新版 Worker 使用自己的重试策略。旧租约、退避时间和重试计数只用于辨别源状态。更早的 `mode=rebuild`、`waitingRebuild / rebuilding / rebuildError` 和旧词表版本字段若仍存在，通过原生 Mongo 读取并按历史迁移的归属规则核对后再映射。此前的两支 4.17.1 脚本可在 `1a9668cb1` 查到，已于 `bffeaeb82` 从 PR 基线移除。

### 欠费和账单

- 旧 `BLOCKED_LOCK_TIME` 同时用于积分不足和知识库容量不足，按原错误原因区分。积分原因导致的失败（含旧版 `lockTrainingDataByTeamId` 改写成 `rebuild*Failed` 的重建分块）恢复为原阶段的可执行项。容量不足和其他最终失败保留业务错误。
- 欠费状态按迁移时的团队余额重算。`preflight` 复用现有余额检查，将每团队的判定保存到迁移快照元数据，跨批和重试使用同一结果。团队欠费时，有可执行工作的文档设为 `paused_unpaid`，`pausedAt` 统一使用本次迁移固定的切换时刻，QA 从此起算保留 30 天。`validation` 在队列仍暂停时刷新余额，并按本次迁移的 `usageId` 更新仍属本次迁移的轮次。余额满足检查的文档设为 `active` 并清除 `pausedAt`；仍欠费的可执行文档保留本次切换时刻。[充值恢复逻辑](../../../../packages/service/core/dataset/training/runtime.ts#L80) · [暂停超期处理](../../../../projects/app/src/service/core/dataset/training/documentReconcile.ts#L21)
- 每篇待续跑或待处理异常的文档新建一个确定性 `_id` 的训练账单，只绑定 `collection.training.usageId`。旧版可能多篇共用同一 `billId`，也可能同篇有多个 `billId`。已有用量留在历史账单，新账单从零开始，只承接新版 Worker 处理的剩余工作。账单和轮次使用同一个事务，跨批与断点恢复时按确定性 `usageId` 复用已验证的绑定。[新版账单绑定](../../../../packages/service/core/dataset/training/orchestration.ts#L151)

## 已有索引如何处理

- 已完成分块沿用原 `_id`、`indexes[].dataId`、向量和全文记录。`indexStatus: 'indexed'` 与字段缺失均为完成态。普通分块无需为本次升级重算 Embedding 或回填状态。新版向量召回仍按 `indexes.dataId` 反查分块，全文沿用现有存储路径。[完成态判断](../../../../packages/global/core/dataset/data/utils.ts#L64) · [向量召回](../../../../packages/service/core/dataset/search/defaultRecall/embeddingRecall.ts#L237) · [全文入口](../../../../packages/service/core/dataset/data/textStore.ts#L148)
- 真正待重建的分块保留旧索引至新版 Worker 提交。Worker 先生成新向量，再提交 Mongo 索引引用和全文写入，成功后回收被替换的向量。已有数据库物理索引继续按现行策略维护。[重建提交](../../../../projects/app/src/service/core/dataset/data/data.ts#L630)
- 孤儿向量沿用 `checkInvalidVector`。它按 `teamId + datasetId + indexes.dataId` 查引用，当前 Cron 只扫距执行时 2 到 6 小时的记录。窗口之外如有历史孤儿，单独做只读盘点，再按归属和引用校验决定是否清理。Milvus 全文随向量行维护，其他后端的孤儿全文记录可按 `dataset_data_texts.dataId` 回查分块。[孤儿向量判定](../../../../projects/app/src/service/common/system/cronTask.ts#L101) · [Cron 扫描窗口](../../../../projects/app/src/service/common/system/cron.ts#L45)

## 冲突与回退

核对 `teamId / datasetId / collectionId` 和已知 `dataId`。已删除文档的任务单独计数。仍有效但归属、阶段或欠费原因无法判定的记录，保留源与现有索引，确认后再放行。遇到已有 `collection.training` 时，比对 `usageId` 是否匹配本次迁移的确定性 ID，不匹配则保留已有轮次等待核对。

失败时保持训练暂停。源字段有误时，从管理页的错误明细读取 `sourceStage` 和 `id`，对照切换备份确认正确值。`legacyTasks` 对应任务快照，`remainingData` 对应分块快照。对尚无 `receipt` 的对应记录写入 `repair`，保留原始 `source` 供核对。以下示例补回分块的旧错误原因。

```js
db.getCollection('migration_20261125_dataset_training_data').updateOne(
  { _id: ObjectId('000000000000000000000001'), receipt: { $exists: false } },
  { $set: { repair: { indexErrorMsg: '原始错误原因' } } }
)
```

将示例中的 `_id` 和错误原因换成复核后的实际值，确认 `matchedCount` 为 `1` 后在管理页重试。任务快照可修正 `q`、`a`、`imageId`、`indexes`、`imageDescMap`、`dataMetadata`、`chunkIndex`、`indexSize` 和 `errorMsg`。分块快照只接受 `indexErrorMsg`。迁移用冻结值核对归属、关联 ID 和分块状态。同一个事务写入修正后的 `source`、工作项和回执，并移除 `repair`。若错误发生在已提交的目标或账单验收阶段，按失败明细核对并修复相应目标，再继续验证。[修复字段](../../../../projects/app/src/migration/tasks/4180/20261125_migrate_dataset_document_training/records.ts)

若中止切换，从切换前的同一备份恢复受影响的目标数据、图片 TTL 和迁移执行状态，删除临时快照集合，确认需要续跑的旧任务仍可读取后再启用旧链路。训练放行后按前向修复处理，保留旧表与临时快照供核对，人工确认后再手动删除。

## 迁移验收

- [ ] 用升级库副本只读盘点普通任务、增强中间结果、欠费（含欠费重建失败）、容量不足、历史 `chunk`、缺少任务的 `indexing / error`、两类重建（含非欠费旧重建失败）和已完成分块。确认跨批的重复 `parse` 只迁一条，并核对跳过计数。对零存量库确认免暂停且四个阶段均为 `succeeded`。
- [ ] 在快照复制中途退出，验证重试续拷及核对完成后才开始转换。模拟未复制的旧记录被 TTL 清理，确认缺口能阻止成功，补回冻结输入后可继续。
- [ ] 在已封存快照的未提交失败项中补回一项旧任务载荷和一项分块错误原因，确认同一断点续迁，并对照备份核对旧任务原记录。
- [ ] 使用真实 Redis 验证队列暂停期间无训练领取，迁移持有 `datasetTrainingReconcile` lease 时对账被安全跳过，且管理员仍可启动和重试迁移。恢复队列后由现有对账唤醒文档。
- [ ] 在业务批次提交后、游标推进前中断，以及大文档跨批/跨阶段写入时，验证确定性 `usageId` 正确复用、外部新版轮次正确报冲突，QA、分块、集合状态和账单绑定一致。确认同一旧账单下的多篇文档各自续跑。对照临时快照验证脚本对旧 `dataset_trainings` 表及其索引没有写入。
- [ ] 抽查已完成分块的 `_id`、向量 ID、全文结果和升级前后一致的检索命中。对待重建分块确认旧向量在新引用提交前仍可用，被替换的向量随后回收；确认非欠费旧重建失败已转为 `rebuild*Pending + indexError: true`，欠费重建失败已还原为 `rebuild*Pending`。
- [ ] 验证旧欠费时间统一按迁移切换时刻重算。模拟迁移中充值，确认该团队的迁入文档在放行前恢复 `active`，仍欠费的团队按新暂停时刻进入保留期。启动新版对账后，确认工作从已保存阶段继续，容量错误与非欠费重建失败保持可见，并用错误列表返回的 ID 完成编辑重试和删除。
- [ ] 演练放行前恢复，确认旧消费者能继续读取切换前的记录；验收完成后演练手动清理旧表与临时快照集合。
