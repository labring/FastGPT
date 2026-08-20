# 知识库同义词功能新增设计文档

## 1. 背景

随着业务数据规模持续增长，用户在检索、匹配和分类等场景中使用的表达方式越来越多样。同一概念可能存在简称、别名、行业术语、口语化表达、中英文混用等多种写法，例如“手机号”和“手机号码”、“订单号”和“交易编号”等。如果系统仅依赖精确匹配或单一关键词识别，容易出现召回不足、识别不准确、用户体验不一致等问题。

为提升系统对不同表达方式的理解能力，需要新增同义词功能。该功能通过维护标准词与同义词之间的映射关系，在查询解析、文本匹配、搜索召回、规则判断等环节对等价表达进行统一处理，从而降低用户输入差异带来的影响，提高结果命中率和业务处理准确性。

同时，同义词能力也有助于沉淀业务领域词库，支持后续在搜索优化、智能推荐、自动分类、知识库问答等场景中复用，提升系统的可扩展性和语义理解能力。

当前现状：

- 知识库模型和独立业务集合中都没有知识库同义词配置。
- 数据模型 `packages/global/core/dataset/type.ts` 和 `packages/service/core/dataset/data/schema.ts` 中 `DatasetDataIndexItem` 只有 `type/dataId/text`。同义词功能不新增 index 级转换记录，避免转换链路随文件更新持续膨胀。
- 训练任务模型没有 `dataMetadata`，`TrainingModeEnum` 只有 `chunk/qa/auto/image/imageParse`。
- 向量训练入口在 `projects/app/src/service/core/dataset/queues/generateVector.ts`，通过 `createDatasetData` 和 `updateDatasetDataByIndexes` 写入 `MongoDatasetData.indexes` 与向量库。
- 全文检索使用 `MongoDatasetDataText.fullTextToken`，由 `jiebaSplit` 在创建或更新数据时生成。
- 检索入口为 `packages/service/core/dataset/search/index.ts`，召回主流程在 `packages/service/core/dataset/search/defaultRecall/index.ts`。
- embedding recall 和 full-text recall 分别在 `defaultRecall/embeddingRecall.ts`、`defaultRecall/fullTextRecall.ts`。
- rerank 独立在 `packages/service/core/dataset/search/defaultRecall/rerank.ts`，当前 document 输入为 `${q}\n${a}`。
- 知识库详情页当前只有集合、搜索测试、配置等页签，没有同义词页面。


## 2. 目标

- 在知识库维度维护一个同义词文件，支持上传、更新、下载、删除。
- 支持 CSV、XLSX、XLS 文件，第一列为标准词，第二列及之后为同义词。
- 文件解析后生成标准词与同义词映射，存储在独立 Mongo collection。
- 入库、编辑、重建和同义词增量任务中，`indexes.text` 始终保存原始文本；仅在写向量和写全文检索 token 时临时执行同义词标准化。
- 同步更新全文检索 token，使 full-text recall 可以命中标准词，同时不改变 `MongoDatasetData` 原始数据。
- 同义词文件更新时必须基于 mapping diff 做增量标准化/恢复，只处理受影响数据，避免全库索引重建。
- 先完成现有问题优化，再对既有 query 做一次同义词改写；不增加 query 数量、不改变现有召回链路。
- rerank 阶段增强 query/document，降低原词和标准词不一致导致的重排降权。
- workflow 知识库检索节点不新增独立输出；在现有 `quoteQA` 的每个知识库引用中增加该 chunk 实际用到的同义词元数据。
- 保持兼容：没有配置同义词的知识库，入库、检索、重建行为不变。

### 2.1 已确认的产品决策

- 同义词匹配采用“最长词优先”。同一位置可以命中多个 term 时，只处理最长 term。
- 英文和数字 term 按完整词边界匹配，匹配时不区分大小写；中文 term 允许连续子串匹配。
- 替换只执行一次扫描，替换结果不参与二次匹配。
- 多知识库检索出现同一原词映射到不同标准词时，接受“保留原词并拼接全部去重标准词”的 query 扩展方案，不增加 query 数量和 recall 调用次数。
- 同义词文件上传、更新或删除导致的 embedding 重建费用由客户承担，沿用知识库训练的余额校验、账单归属和 usage 记录链路。
- 文件限制采用 10 MiB、10,000 个 mapping、50,000 个 term、单 term 128 个 Unicode code point，并与现有团队套餐限制取较小值。
- request 级 Jieba 自定义词典仅在隔离实例基准测试通过时进入首版，否则继续使用现有分词器，禁止修改共享 Jieba 实例。
- synonym job 期间的普通导入、编辑和批量重建采用快速失败，本期不增加持久化排队系统。
- 复制/克隆知识库默认不复制同义词配置，避免隐式产生大规模 embedding 重建费用。

### 2.2 设计原则

- `dataset_synonyms` 是知识库同义词文件和生效版本的唯一事实来源，Dataset 主表不重复保存文件 ID。
- Mongo 事务只保证 Mongo 内 job、mapping 和训练任务的一致性；向量库写入通过版本校验、幂等重试和补偿删除实现最终一致性。
- 同义词更新期间同时保留 active 和 pending 两个版本。检索在过渡期兼容两个版本，全部受影响数据完成后再原子切换 active 版本。
- 所有会改变知识库数据或派生索引的入口必须竞争同一个 dataset mutation lock；仅查询 active job 不能作为并发锁。

## 3. 非目标

- 不支持一个知识库同时生效多个同义词文件。
- 不修改 `q/a` 原文，也不修改 `indexes.text` 原文；同义词标准化只作用于派生索引写入、查询标准化和 rerank 增强上下文。
- 不采用“文件更新后全库重建”的实现路径；无法用 diff 精确缩小范围时，也只能通过 term 粗筛后由 worker 精确判断。
- 不改变现有集合导入、数据编辑和检索 API 的基础参数语义。

## 4. 总体架构

新增同义词能力分为五层：

1. 文件管理层：上传、更新、下载、删除同义词文件，维护 `dataset_synonyms`。
2. 映射管理层：解析文件，规范化 mapping，维护 `dataset_synonym_mappings`。
3. 索引转换层：提供 `applySynonymTransform`、`buildSynonymDerivedIndexes`、`buildSynonymDerivedFullText`、`buildSynonymMatcher`。
4. 训练与重建层：在入库、数据编辑、重建任务中对向量输入和全文 token 应用同义词，原始 `indexes.text` 不改写。
5. 检索增强层：query 标准化、chunk mapping 提取、rerank 增强、知识库引用元数据透传。

目标主流程：

```text
用户上传/更新同义词文件
  -> 通用文件上传获得 fileId
  -> API 校验权限、fileId 归属和文件格式
  -> 解析 CSV/XLSX/XLS
  -> 原子抢占 dataset_mutation_locks 写入锁并获得 fencingToken
  -> 规范化 mapping 并与旧 mapping 做 diff
  -> 写入 pendingVersion mapping，保留稳定 logicalMappingId，旧 activeVersion 继续可读
  -> 只为 diff 影响的数据创建携带 jobId/fileVersion 的 synonymStandardize/synonymRestore 任务
  -> worker 基于原始 indexes.text 临时标准化，按幂等协议更新向量库与 MongoDatasetDataText.fullTextToken
  -> 全部任务完成后原子切换 activeVersion，清理旧版本 mapping 和旧文件
  -> 现有问题优化完成后，对既有 query 执行一次同义词改写
  -> rerank 使用同义词增强输入
  -> workflow 通过现有 quoteQA 输出引用，每个命中 chunk 携带自身使用的同义词元数据
```

## 5. 数据模型设计

### 5.1 Dataset 主表不增加同义词文件字段

Dataset 主表不增加 `synonymFiles`。文件信息、生效版本和处理中版本统一由 `dataset_synonyms` 管理，避免 Dataset 主表与独立集合形成两个事实来源。

查询知识库同义词配置时固定使用 `teamId + datasetId` 读取 `dataset_synonyms`。一个知识库只允许存在一条配置记录，由数据库唯一索引保证，而不是依赖应用层数组长度检查。

### 5.2 新增 dataset_synonyms

新增文件：

```text
packages/service/core/dataset/synonym/schema.ts
```

集合名常量新增到 `packages/global/core/dataset/constants.ts`：

```ts
export const DatasetSynonymCollectionName = 'dataset_synonyms';
```

模型：

```ts
type DatasetSynonymSchemaType = {
  _id: string;
  teamId: string;
  datasetId: string;
  fileName?: string;
  fileId?: string; // S3 key；删除配置后为空
  size?: number;
  uploadTime?: Date;
  uploaderId?: string;
  activeVersion: number;
  latestVersion: number;
  pendingVersion?: number;
  pendingFileId?: string;
  pendingFileName?: string;
  pendingSize?: number;
  pendingUploaderId?: string;
  pendingUploadTime?: Date;
  updateTime: Date;
};
```

索引全部使用 `defineIndex` 声明：

- `{ teamId: 1, datasetId: 1 }`，`unique: true`，保证一个知识库只有一条同义词配置。
- `{ teamId: 1, fileId: 1 }`，partial unique，仅匹配 `fileId` 存在的记录，避免同一正式文件被重复绑定。
- `{ teamId: 1, pendingFileId: 1 }`，partial unique，仅匹配 `pendingFileId` 存在的记录。

版本语义：

- `activeVersion` 是线上检索默认使用的稳定版本。
- `latestVersion` 是只增不减的版本序列，创建 job 时原子递增并把结果分配给 `pendingVersion`；失败和删除后也不复用旧版本号。
- `pendingVersion` 是正在重建索引的目标版本，必须大于 `activeVersion`。
- 更新开始时只写 pending 字段，不覆盖当前 `fileId/fileName/size/uploaderId`。
- job 完成时在 Mongo 事务内把 pending 文件和版本提升为 active，并清空 pending 字段。
- processing/rollingBack 阶段保留 active 配置和 pending 信息供重试或恢复使用；最终进入 `failed/cancelled` 前清空 pending 信息，不能让知识库进入无可用配置状态。

### 5.3 新增 dataset_synonym_mappings

新增文件：

```text
packages/service/core/dataset/synonym/mappingSchema.ts
```

集合名常量：

```ts
export const DatasetSynonymMappingCollectionName = 'dataset_synonym_mappings';
```

模型：

```ts
type DatasetSynonymMappingSchemaType = {
  _id: string;
  logicalMappingId: string;
  teamId: string;
  datasetId: string;
  synonymFileId: string;
  fileVersion: number;
  standardizedTerm: string;
  normalizedStandardizedTerm: string;
  synonymTerms: string[];
  normalizedSynonymTerms: string[];
  allTerms: string;
  fingerprint: string;
  jobId: string;
  createdTime: Date;
  updatedTime: Date;
};
```

索引全部使用 `defineIndex` 声明：

- `{ teamId: 1, datasetId: 1, fileVersion: 1, normalizedStandardizedTerm: 1 }`，`unique: true`。
- `{ teamId: 1, datasetId: 1, fileVersion: 1, logicalMappingId: 1 }`，`unique: true`，支持按引用 ID 批量回查版本快照。
- `{ teamId: 1, datasetId: 1, fileVersion: 1 }`。
- `{ teamId: 1, synonymFileId: 1 }`。
- `{ jobId: 1 }`。

更新约束：

- `_id` 标识某个版本的 mapping 快照；`logicalMappingId` 标识跨版本的同一个逻辑标准词组。
- `normalizedStandardizedTerm` 未变化时，pending mapping 继承旧 mapping 的 `logicalMappingId`；无论 fingerprint 是否变化，都创建新的版本快照，不能原地覆盖 active mapping。
- 新增标准词创建新的 `logicalMappingId`；被删除标准词不出现在 pendingVersion，但旧 activeVersion 快照保留到版本切换和任务清理完成。
- unchanged mapping 也可以复制为 pendingVersion 快照，以换取简单、稳定的按版本读取语义；实现可使用批量写入降低开销。
- `normalizedStandardizedTerm` 和 `normalizedSynonymTerms` 只用于冲突检测、匹配与唯一性约束，展示和替换输出仍使用用户文件中的原始大小写形式。
- 不使用 `status='deleted'` 表达版本删除。版本差集本身就是 removed mapping，避免 active、pending、deleted 状态组合产生歧义。

### 5.4 DatasetDataIndexItem 保持原文

不在 `DatasetDataIndexItem` 增加 `synonymMetadata`，也不把转换结果写回 `indexes.text`。

`DatasetData` 顶层增加可选字段：

```ts
synonymIndexVersion?: number
```

该字段只表示当前向量和全文 token 最近一次成功提交的 pendingVersion，不保存具体替换记录。未配置过同义词的数据允许省略或视为版本 `0`。

约束：

- `indexes.text` 永远保存用户导入、编辑或系统生成的原始 index 文本。
- 写向量时使用 `buildSynonymDerivedIndexes` 生成临时标准化文本，只把临时文本送入 embedding 和向量库。
- 写全文检索时使用 `buildSynonymDerivedFullText` 生成临时标准化全文，只写入 `MongoDatasetDataText.fullTextToken`。
- workflow `quoteQA` 中每个引用的 `synonymMappings` 通过该数据 `synonymIndexVersion` 对应的 mapping，对 chunk 原始 `q/a/indexes.text` 动态计算，不依赖历史持久化转换记录。
- 同义词文件删除或变更时不需要恢复 `indexes.text`，只需要按新配置重建受影响向量和全文 token。
- 存在 pendingVersion 时，只有 `synonymIndexVersion === pendingVersion` 的数据按 pending mapping 解释，其他数据一律按当前 activeVersion 解释；这样无需为了版本号对未受影响数据执行全库 updateMany。
- 不存在 pendingVersion 时，所有数据一律按 activeVersion 解释，旧 `synonymIndexVersion` 不阻止旧 mapping 清理。
- worker 只有在新向量写入成功且 Mongo 条件事务提交时才能更新 `synonymIndexVersion`；该字段用于失败恢复和过渡期 rerank。

### 5.5 新增 dataset_synonym_jobs

新增文件：

```text
packages/service/core/dataset/synonym/jobSchema.ts
```

集合名常量：

```ts
export const DatasetSynonymJobCollectionName = 'dataset_synonym_jobs';
```

模型：

```ts
type DatasetSynonymJobSchemaType = {
  _id: string;
  teamId: string;
  datasetId: string;
  synonymFileId?: string;
  fileId?: string;
  fileVersion: number;
  fencingToken: number;
  type: 'upload' | 'update' | 'delete';
  status: 'pending' | 'diffing' | 'marking' | 'processing' | 'rollingBack' | 'completed' | 'failed' | 'cancelled';
  diffSummary?: {
    added: number;
    removed: number;
    changed: number;
    unchanged: number;
    affectedDataCount: number;
    completedDataCount: number;
    failedDataCount: number;
    scannedDataCount: number;
  };
  markingCursor?: string;
  errorMsg?: string;
  cleanupPending?: boolean;
  retiredVersion?: number;
  retiredFileId?: string;
  cleanupError?: string;
  createTime: Date;
  updateTime: Date;
  finishTime?: Date;
};
```

索引全部使用 `defineIndex` 声明：

- `{ teamId: 1, datasetId: 1, status: 1 }`
- `{ teamId: 1, datasetId: 1 }`，partial unique，条件为 `status in ['pending', 'diffing', 'marking', 'processing', 'rollingBack']`，保证同一知识库只有一个非终态 synonym job。
- `{ teamId: 1, datasetId: 1, fileVersion: -1 }`，`unique: true`。
- `{ updateTime: -1 }`
- `{ cleanupPending: 1, updateTime: 1 }`，partial index，仅匹配 `cleanupPending: true` 的待恢复清理任务。

状态约束：

- 同一 `teamId + datasetId` 只能有一个 `pending/diffing/marking/processing/rollingBack` job。
- 上传、更新、删除同义词文件必须先原子获取 dataset mutation lock，再在 Mongo 事务内创建 job 并把状态推进到 `diffing`；失败时不修改 activeVersion。
- 导入、编辑、批量重建、同义词更新都必须在写训练任务前通过同一个 dataset 写入闸门；存在进行中的 synonym job 时拒绝或排队，不能只依赖“操作前 count 一次训练任务”。
- worker 处理正向任务时必须校验 job 为 `processing`，处理反向任务时必须校验 job 为 `rollingBack`；两类任务都要校验 `fileVersion/fencingToken` 与训练任务及 mutation lock 一致，不一致的陈旧任务直接停止且不得写入。
- 版本切换事务把旧 active 版本和旧文件记录到完成 job 的 `retiredVersion/retiredFileId`，并设置 `cleanupPending`。事务外仅在训练任务和 operation 全部收敛、资源不再被 active/pending 配置引用时执行幂等清理；失败写入 `cleanupError`，进程启动时按游标分批恢复。

### 5.6 Dataset 写入闸门

仅在事务内执行“查询是否存在 active job”无法构成互斥：普通导入和 synonym job 可能在不同事务快照中同时看到空结果。为此新增 `dataset_mutation_locks`，所有相关写入口都必须通过同一条原子 compare-and-set 路径获取锁。

新增模型：

```ts
type DatasetMutationLockSchemaType = {
  teamId: string;
  datasetId: string;
  ownerId: string;
  ownerType: 'dataMutation' | 'synonymJob';
  fencingToken: number;
  leaseUntil: Date;
  updateTime: Date;
};
```

使用 `defineIndex` 声明 `{ teamId: 1, datasetId: 1 }` 唯一索引。锁记录长期保留，不能依赖“先查后插”。普通写入以 `sharedOwners[]` 获取共享短租约；同义词 job 获取 `ownerId/ownerType/leaseUntil` 独占长租约并递增 `fencingToken`。共享和独占获取都通过 Mongo 原子更新完成，竞争失败统一返回“知识库正在更新，请稍后重试”。首次并发创建锁文档产生的 `E11000` 由共享获取逻辑转为非 upsert 重试，不能把两个普通写入误判为互斥。

新增通用 helper：

```ts
withDatasetMutationGate({
  teamId,
  datasetId,
  operation,
  leaseMs,
  run
}): Promise<T>
```

约束：

- 同义词上传、更新、删除、集合导入、数据创建、数据编辑和批量重建都必须在任何 Mongo 或向量写入前获取锁。
- 普通数据变更使用可并发的共享短租约，执行期间自动续租并在 `run` 完成后主动释放；synonym job 使用独占长租约并由 worker 周期续租，直到 job 进入终态才释放。
- synonym worker 调用通用数据写函数时必须传入当前 `ownerId/fencingToken` 复用已持有的锁，不能以 `dataMutation` 身份再次获取锁造成自锁。
- 锁获取、job 创建、`pendingVersion` 分配必须在受 fencing token 保护的事务中完成。事务提交前再次断言锁的 `ownerId + fencingToken` 未变化。
- worker 每次写向量前、提交 Mongo 更新前、删除旧向量前都必须校验 `ownerId + fencingToken + leaseUntil`。旧 owner 即使在超时后恢复，也不能继续提交写入。
- 租约过期只允许新 owner 接管，不直接判定旧 job 成功。接管方根据 job 和训练任务状态执行重试或失败收敛。
- 接管 synonym job 时，新 owner 在 Mongo 事务内把 job 和所有未完成任务更新为新的 fencingToken；旧 worker 即使完成 embedding，也会在提交前因 token 不匹配而进入新向量补偿清理。
- API 当前采用快速失败，不在服务端无限排队；前端提示“同义词索引更新中，请稍后重试”。
- mutation lock 是并发互斥，`synonymJobId/fileVersion/fencingToken` 是 worker 防止陈旧写入的版本屏障，两者都必须存在。

### 5.7 TrainingModeEnum 增加同义词任务

文件：

- `packages/global/core/dataset/constants.ts`
- `packages/service/core/dataset/training/schema.ts`
- `packages/service/core/dataset/training/query.ts`
- `projects/app/src/service/core/dataset/training/utils.ts`
- `projects/app/src/web/core/dataset/trainingStatus.ts`
- `projects/app/src/pages/api/core/dataset/collection/trainingDetail.ts`
- `projects/app/src/pageComponents/dataset/detail/CollectionCard/TrainingStates.tsx`

新增：

```ts
synonymStandardize = 'synonymStandardize',
synonymRestore = 'synonymRestore'
```

所有以 `Record<TrainingModeEnum, ...>` 或 switch 穷举训练模式的位置必须同步更新：两种 synonym mode 在排序和 UI 上归入向量化阶段；超时配置按普通文本向量重建设置，并在集合训练详情中展示实际计数。OpenAPI 中直接使用 `z.enum(TrainingModeEnum)` 的位置会自动包含新值，但仍需检查示例和描述。

训练任务 schema 增加明确的 Zod 子 schema，并由其推导类型，不使用无约束的 `Object`：

```ts
const DatasetTrainingDataMetadataSchema = z.object({
  synonymFileId: ObjectIdSchema.optional(),
  synonymJobId: ObjectIdSchema.optional(),
  fileVersion: z.number().int().nonnegative().optional(),
  fencingToken: z.number().int().nonnegative().optional(),
  affectedLogicalMappingIds: z.array(ObjectIdSchema).optional()
});
```

单条数据 saga 的持久化日志使用独立的 `dataset_synonym_operations` collection，而不是嵌入训练任务。operation 记录稳定 `operationId`、`trainingId/dataId/jobId/targetVersion`、`attempt/inputTokens`、新旧 vector IDs、错误信息以及 `prepared -> vectorsPrepared -> mongoCommitted -> completed` 状态。训练任务被 rollback 删除后，队列对账器仍会扫描未完成 operation，补交实际 embedding usage 并清理 Mongo 提交前的新向量或提交后的旧向量。

为 `MongoDatasetTraining` 使用 `defineIndex` 增加 `{ 'dataMetadata.synonymJobId': 1, dataId: 1, mode: 1 }` partial unique 索引，仅匹配 `dataMetadata.synonymJobId` 存在的同义词任务，保证 marking 分批重试不会创建重复任务。该索引是新增索引，不存在需要登记的历史废弃索引。

## 6. 文件格式、解析与规范化

### 6.1 文件格式

支持：

- `.csv`
- `.xlsx`
- `.xls`

规则：

- 第一行为表头。
- 第一列为标准词。
- 第二列及之后均为同义词。
- 空行跳过。
- 标准词为空跳过。
- 同义词为空跳过。
- term 包含换行或其他控制字符时拒绝该行并返回行号，避免文件解析、边界判断和正则粗筛产生不同语义。
- 文件大小上限初始设为 10 MiB、有效 mapping 行数上限为 10,000、标准词与同义词合计上限为 50,000、单个 term 上限为 128 个 Unicode code point；限制统一定义为服务端常量，API 和解析器使用同一来源。
- 超限必须在创建 job 和产生 embedding 费用前失败，并返回具体超限项。

示例：

```csv
标准术语,同义词,,,
退款,退货,退单,退钱
订单,订单号,交易,购买订单
```

### 6.2 解析模块

新增：

```text
packages/service/core/dataset/synonym/controller.ts
```

主要函数：

```ts
parseSynonymCSV(fileContent: string): Promise<ParsedSynonymData[]>
parseExcelToCSV(buffer: Buffer): string
readSynonymFileFromS3(fileKey: string): Promise<string>
normalizeSynonymMappings(rows: ParsedSynonymData[]): NormalizedSynonymMapping[]
```

规范化规则：

- 所有 term 执行 `trim()`；首版不折叠内部空白，也不对原字符执行 NFKC/NFC 转换。
- 英文匹配键只折叠 ASCII `A-Z` 大小写，原始展示值和标准词输出值保留文件中的大小写；其他 Unicode Latin 字符保持原字符精确匹配。
- 同义词去空、去重，去重基于规范化后的 term。
- 标准词出现在本行同义词中时直接报错，返回行号和冲突 term。
- 同一标准词重复时合并同义词。
- `allTerms = [standardizedTerm, ...synonymTerms].join(' ')`。
- `fingerprint` 基于标准词和排序后的同义词计算，用于文件更新 diff。

强映射校验：

- 同一知识库内任意 term 只能归属一个标准词组。
- 一个 term 不能同时作为某行标准词和另一行同义词。例如 `A -> B` 与 `B -> C` 必须报错，避免标准化时出现 A/B/C 级联替换。
- 不允许两个标准词互相出现在对方同义词中，例如 `A -> B` 与 `B -> A`。
- 不允许同一同义词映射到多个标准词，例如 `A -> X` 与 `B -> X`。
- 不允许标准词之间只通过同义词形成连通分量，例如 `A -> X`、`B -> X` 或 `A -> X`、`X -> Y` 都视为冲突。
- 解析时构建 term graph，每一行视为一个 canonical group；如果任意 term 已归属其他 group，立即报错并返回：当前行号、历史行号、冲突 term、历史标准词、当前标准词。
- `applySynonymTransform` 只执行单跳替换：命中同义词 term 后直接替换为本 mapping 的 `standardizedTerm`，替换后的文本不再参与二次扫描。

### 6.3 匹配语义

入库派生索引、全文 token、query 改写、chunk mapping 提取和 rerank 增强必须复用同一个 matcher，禁止各模块自行实现字符串替换。

匹配规则：

- 从左到右扫描原文；同一起始位置存在多个候选时选择 Unicode code point 数量最长的 term。
- 已匹配区间不再参与其他 mapping，替换后的标准词不再被扫描，因此不会发生级联替换。
- 中文 term 允许连续子串匹配。例如同义词“苹果手机”可以命中“苹果手机退款”。
- 纯英文、纯数字及英文数字组合 term 必须满足完整词边界。边界只阻止相邻的 Latin 字母、Unicode 数字和下划线，中文不视为英文边界字符；例如 `AI` 可以命中 `use AI`、`(AI)` 和 `使用AI能力`，不能命中 `RAID`、`AIOps` 或 `AI_2`。
- 中英混合 term 按完整序列匹配；如果 term 首尾是英文或数字，对对应一侧应用英文词边界。例如 `GPT模型` 可以命中 `使用GPT模型`，但不能命中 `MyGPT模型`。
- ASCII 英文字母匹配不区分大小写，中文和其他字符保持精确匹配。命中后统一输出 mapping 的 `standardizedTerm` 原始展示值。
- 除英文大小写外，不做 Unicode 兼容字符等价匹配。例如全角和半角形式默认视为不同 term；这是为了让历史数据的 Mongo 粗筛与 worker 精确匹配保持相同语义，避免增量任务漏标。
- 标准词自身不替换，也不记入 `usedMappings`；只有同义词命中才产生替换和引用元数据。
- 多个候选长度相同的理论冲突由强映射校验提前拒绝；matcher 仍以 normalized term 字典序作为稳定兜底，保证不同进程结果一致。

示例：

```text
标准词：手机；同义词：苹果手机、移动电话
输入：苹果手机怎么退款
输出：手机怎么退款

标准词：人工智能；同义词：AI
输入：AI assistant uses RAID
输出：人工智能 assistant uses RAID
```

## 7. 索引转换工具

新增目录：

```text
packages/service/core/dataset/indexTransform/
```

新增文件：

```text
packages/service/core/dataset/indexTransform/utils.ts
packages/service/core/dataset/indexTransform/controller.ts
packages/service/core/dataset/indexTransform/strategies.ts
```

核心函数：

```ts
type SynonymMappingForPrompt = {
  mappingId: string; // logicalMappingId
  datasetId: string;
  fileVersion: number;
  matchedTerm: string;
  standardizedTerm: string;
};

applySynonymTransform(
  originalText: string,
  matcher: DatasetSynonymMatcher
): {
  transformedText: string;
  usedMappings: SynonymMappingForPrompt[];
}

buildSynonymMatcher(
  mappings: { _id: string; standardizedTerm: string; synonymTerms: string[] }[]
): DatasetSynonymMatcher

getDatasetSynonymConfig({
  teamId,
  datasetId
}): Promise<{
  active?: {
    fileId?: string;
    version: number;
    matcher: DatasetSynonymMatcher;
  };
  pending?: {
    fileId?: string;
    version: number;
    matcher: DatasetSynonymMatcher;
  };
} | null>

buildSynonymDerivedIndexes({
  indexes,
  synonymConfig
}): {
  derivedIndexes: DatasetDataIndexItemType[];
  usedMappings: SynonymMappingForPrompt[];
}

buildSynonymDerivedFullText({
  q,
  a,
  indexes,
  synonymConfig
}): Promise<{
  fullTextToken: string;
  usedMappings: SynonymMappingForPrompt[];
}>
```

转换原则：

- 只替换同义词为标准词，不替换标准词本身。
- `q/a` 原文不变。
- `indexes.text` 原文不变。
- `applySynonymTransform` 返回的 `transformedText` 仅用于本次向量写入、全文 token 生成、query 标准化和 rerank 增强，不持久化到 `MongoDatasetData.indexes`。
- 函数返回的 transformations 仅作为本次调用的调试、日志和知识库引用元数据候选数据，不写入 index 子文档。
- matcher 必须按 `teamId + datasetId + fileVersion` 缓存；版本切换后旧 cache key 自然失效，不能通过修改全局 matcher 影响其他知识库。

## 8. 文件管理 API

新增 API 目录：

```text
projects/app/src/pages/api/core/dataset/synonym/
```

所有 API 必须：

- 在 `packages/global/openapi/core/dataset/synonym/` 定义 request/response Zod schema、路由元数据和 OpenAPI 文档，不在 handler 内重复手写接口类型。
- 在 API 边界使用 `parseApiInput` 校验 `req.body/req.query`，内部文件内容和数据库数据仍使用普通 schema 校验。
- 所有对外字段补齐 description，空成功响应使用 `z.undefined()`。
- 在读取文件内容或创建 job 前完成 `authDataset`、S3 key 归属、扩展名、文件元数据和大小校验。

### 8.1 上传

```http
POST /api/core/dataset/synonym/upload

{
  "datasetId": "xxx",
  "fileId": "dataset/xxx/tmp/xxx.csv"
}
```

职责：

- 文件二进制上传统一走现有最新文件上传链路；同义词 API 不接收 multipart 文件。
- 根据 `fileId` 读取上传文件，校验文件归属当前团队/知识库、未过期、未被其它业务引用。
- `allowedExtensions` 限制为 `csv/xlsx/xls`，基于 `fileId` 元数据和文件名双重校验。
- `authDataset` 校验写权限。
- 解析文件并创建 mappings。
- 若已有旧文件，内部走更新逻辑。
- 创建 `dataset_synonym_jobs` 并进入状态机。

响应：

```ts
{
  synonymId: string;
  fileName: string;
  size: number;
  uploadTime: Date;
  jobId: string;
  fileVersion: number;
}
```

### 8.2 更新

```http
POST /api/core/dataset/synonym/update

{
  "datasetId": "xxx",
  "oldSynonymId": "xxx",
  "fileId": "dataset/xxx/tmp/xxx.csv"
}
```

更新必须执行 mapping diff 增量标准化：

1. 校验 `fileId` 归属、格式、大小和未被引用状态。
2. 原子获取 mutation lock，在 Mongo 事务内创建 `dataset_synonym_jobs`，获得新的 `fileVersion/fencingToken` 并进入 `diffing`。
3. 解析新文件并生成 normalized mappings。
4. 读取旧 active mappings。
5. 按 `standardizedTerm` 和 `fingerprint` 计算 added/removed/changed/unchanged。
6. 在 Mongo 事务内写入 pendingVersion mappings 和 `dataset_synonyms` pending 文件字段；相同标准词继承 `logicalMappingId`，不覆盖 activeVersion 快照。
7. 根据 diff 计算受影响数据，只为这些数据创建携带 `synonymJobId/fileVersion` 的同义词训练任务。
8. 若 `affectedDataCount=0`，在同一事务内立即把 pendingVersion 提升为 activeVersion、切换正式文件字段并把 job 置为 `completed`。

响应：

```ts
{
  synonymId: string;
  fileName: string;
  size: number;
  uploadTime: Date;
  jobId: string;
  fileVersion: number;
  diffSummary?: {
    added: number;
    removed: number;
    changed: number;
    unchanged: number;
    affectedDataCount: number;
  };
}
```

### 8.3 获取当前配置

```http
GET /api/core/dataset/synonym/detail?datasetId=xxx
```

返回：

```ts
{
  file?: DatasetSynonymSchemaType & { uploaderName?: string };
  currentJob?: DatasetSynonymJobSchemaType;
}
```

配置记录存在但 `fileId` 为空时，`file` 省略；`currentJob` 用于展示上传、更新、删除、回滚和失败进度。

### 8.4 下载

```http
GET /api/core/dataset/synonym/download?id=xxx
```

校验文件归属和读取权限后，从 S3 返回原文件流。

### 8.5 删除

```http
DELETE /api/core/dataset/synonym/delete?id=xxx
```

删除等价于新 mapping 为空的 diff 更新：

- 创建内容为空的 pendingVersion，基于 activeVersion 的全部标准词和同义词，对 `q/a/indexes.text` 原文粗筛受影响数据并创建 `synonymRestore` 任务。
- 受影响任务完成后把“无文件”状态提升为 active，再清理旧版本 mappings 和旧文件引用。
- 不允许删除文件后保留历史标准化向量，否则 query 与索引语义会长期不一致。

## 9. 同义词服务层

新增：

```text
packages/service/core/dataset/synonym/controller.ts
```

主要函数：

```ts
uploadSynonymFile(params): Promise<DatasetSynonymSchemaType>
updateSynonymFileIncremental(params): Promise<{ synonymFile; diffSummary }>
deleteSynonymFile(params): Promise<void>
getSynonymConfig(params): Promise<DatasetSynonymSchemaType | null>
searchSynonymMappings(params): Promise<DatasetSynonymMappingSchemaType[]>
batchGetSynonymMappings(params): Promise<Record<string, Mapping | null>>
calculateSynonymMappingDiff(params): SynonymMappingDiff
applySynonymMappingDiff(params): Promise<{ jobId: string; diffSummary }>
markAffectedSynonymData(params): Promise<{ affectedDataCount: number }>
activatePendingSynonymVersion(params): Promise<void>
cleanupRetiredSynonymVersions(params): Promise<void>
```

互斥规则：

- 上传、更新、删除必须原子获取 `dataset_mutation_locks` 的 `teamId + datasetId` 锁，不使用 job count 或“先检查 `retryCount > 0`”作为并发控制。
- 导入、编辑、批量重建和同义词更新在任何 Mongo/向量写入前都必须获取同一把锁。
- 同一知识库同一时间只允许一个 synonym job 处于 `pending/diffing/marking/processing/rollingBack`，避免连续更新覆盖任务上下文。
- worker 领取同义词训练任务时必须按 `dataMetadata.synonymJobId + fileVersion + fencingToken` 校验 job 和锁；旧 job、已取消 job、租约失效或版本不一致的任务不允许写向量和全文索引。

事务与分批规则：

- 文件二进制已由统一上传链路写入临时文件区；Mongo 事务成功后把 `fileId` 绑定到 `dataset_synonyms` 并移除临时 TTL。
- 事务失败时不绑定新 `fileId`，旧文件和旧 mapping 保持可用，临时文件继续按 TTL 清理。
- 更新时不得先删除旧文件，避免知识库短暂进入“无同义词配置”状态。
- job 创建、`latestVersion/pendingVersion` 分配和 pending 文件字段写入使用一个短事务。
- pendingVersion mappings 按批次幂等写入；全部批次完成并校验数量、fingerprint 后，job 才能从 `diffing` 进入 `marking`。
- marking 按 `_id` 游标分批扫描。每一批在短事务内幂等 upsert 训练任务、更新 `markingCursor/scannedDataCount/affectedDataCount`；不能用覆盖整个扫描过程的长事务。
- 只有游标到达末尾且 mappings/任务计数校验通过后，才能把 job 从 `marking` 切换为 `processing`。
- 旧版本 mapping 和旧文件的物理清理由版本切换后的后台清理执行，不放在文件更新事务中。

知识库生命周期：

- 删除知识库也必须通过 mutation lock。存在 processing/rollingBack synonym job 时先拒绝删除并提示等待任务收敛，不能边重建向量边删除配置。
- 删除知识库时同步取消尚未执行的 synonym 训练任务，删除配置、全部 mapping 版本、终态 job、mutation lock 和 active/pending S3 文件，并复用现有向量及 DatasetData 清理链路。
- 删除流程必须支持幂等重试；S3 或向量清理失败进入现有清理/补偿机制，不能因为部分资源已不存在而整体失败。
- matcher/Jieba 隔离实例缓存必须在知识库删除和版本切换后失效。

## 10. 训练与入库改造

### 10.1 创建数据时应用同义词

文件：

```text
projects/app/src/service/core/dataset/data/data.ts
```

在 `createDatasetData` 中：

1. 根据 `teamId + datasetId` 读取同义词配置。
2. `indexOperation.formatIndexes` 生成系统和外部索引草稿。
3. `MongoDatasetData.indexes` 保存原始 `text`，不写入标准化结果。
4. 对非图片向量 index 生成临时标准化文本，再调用 `insertVectors`。
5. `MongoDatasetDataText.fullTextToken` 使用标准化后的临时全文分词。

注意：

- `imageEmbedding` 类型 index 不应做同义词转换。
- `q/a` 字段和 `indexes.text` 字段都保存原文。

### 10.2 编辑数据时应用同义词

影响函数：

- `updateByIndexes`
- `updateSystemIndexes`
- `writeDatasetDataIndex`

原则：

- 生成或接收新的 index 草稿后，直接按原文比较 patch diff。
- 只有原始 `q/a/indexes.text` 变化，或当前 synonym job 判定该数据受影响时，才重建向量和全文 token。
- Q/A 变化后，`MongoDatasetDataText.fullTextToken` 用临时标准化后的全文更新，`q/a` 原文不变。

### 10.3 重建数据时应用同义词

`generateVector.ts` 的 `rebuildData` 会调用：

```ts
updateDatasetDataByIndexes(...)
```

因此只要 `updateDatasetDataByIndexes` 内部统一接入同义词转换，普通重建、批量重建和同义词重建可以复用同一路径。

`updateDatasetDataByIndexes` 必须遵守：

- 入参和 `MongoDatasetData.indexes` 都使用原始 index 文本。
- 内部构造 `derivedIndexes` 作为向量写入输入。
- `derivedIndexes` 不持久化到 `MongoDatasetData.indexes`。

### 10.4 专用同义词队列

新增：

```text
projects/app/src/service/core/dataset/queues/synonym/standardize.ts
projects/app/src/service/core/dataset/queues/synonym/restore.ts
```

并在：

```text
projects/app/src/service/core/dataset/training/utils.ts
```

接入：

```ts
if (mode === TrainingModeEnum.synonymStandardize) {
  generateSynonymStandardize();
} else if (mode === TrainingModeEnum.synonymRestore) {
  generateSynonymRestore();
}
```

`startTrainingQueue` 同步启动这两个 worker。

`synonymStandardize` worker：

- 按 `TrainingModeEnum.synonymStandardize` 领取带 `dataMetadata.synonymJobId/fileVersion/fencingToken` 的任务。
- 校验 job 状态为 `processing`，且 job 与 mutation lock 的 `fileVersion/fencingToken` 与任务一致。
- 读取任务 `fileVersion` 对应的 pending 同义词配置。
- 对每个 index：
  - 使用原始 `indexes.text` 生成临时标准化文本。
  - 临时标准化文本与旧派生索引可能不同，则重建对应向量。
  - 原始 `indexes.text` 不更新。
- 更新 `MongoDatasetDataText.fullTextToken`。
- 所有 vector operation 完成 usage 与补偿清理后，删除训练任务并更新 job 的 `completedDataCount/failedDataCount`。
- 当同 job 没有剩余任务且失败计数为 0 时执行 activeVersion 切换；存在最终失败任务时进入 `rollingBack`，不能直接置为 `failed`。

`synonymRestore` worker：

- 按 `TrainingModeEnum.synonymRestore` 领取带 `dataMetadata.synonymJobId/fileVersion/fencingToken` 的任务。
- 校验 job、fileVersion、fencingToken 和锁租约。
- 使用原始 `indexes.text` 重建向量。
- 更新全文 token 为原文分词。
- 删除训练任务并推进 job 计数和终态。

### 10.5 Mongo 与向量库最终一致性

向量库不参与 Mongo 事务，worker 必须把单条数据重建实现为可重试的 saga，不能把“Mongo 事务成功”等同于“向量写入原子成功”。

单条数据处理协议：

1. 读取原始数据、pendingVersion mapping、job 和 mutation lock，校验 `synonymJobId + fileVersion + fencingToken + leaseUntil`。
2. 根据原始 `indexes.text` 构造目标派生文本；若精确比较确认派生结果不变，只更新任务计数，不调用 embedding，不产生 embedding usage。
3. 为单条数据和目标版本生成稳定 `operationId = synonymJobId:dataId:targetVersion`，并在独立 operation collection 持久化 `prepared` 状态；每次确实重新调用 embedding 时递增 attempt，usage 幂等键为 `operationId:embedding:attempt`。
4. 新向量写入成功后，再次校验 fencing token，并在 Mongo 事务内条件更新 data index 引用、`MongoDatasetDataText.fullTextToken`、任务进度和 usage。条件不匹配时事务不得提交。
5. Mongo 提交成功后删除旧向量。旧向量删除失败只记录可重试清理任务，不回滚已经可用的新索引。
6. 新向量成功但 Mongo 提交失败时，立即删除本次新向量；删除失败写入补偿清理记录，后续按 `operationId` 重试。
7. worker 重试前读取 operation 状态；`vectorsPrepared` 先通过 `synonymIndexVersion` 和当前 vector IDs 判断 Mongo 是否已经提交，不能误删已生效的新向量。未提交时补交本次实际 usage、回收新向量并递增 attempt 后重新 embedding；已提交时只补交 usage 和删除旧向量。若训练任务已被 rollback 删除，由独立对账器继续完成相同补偿。

终态规则：

- 所有数据任务成功后，在持有相同 fencing token 的 Mongo 事务内把 `pendingVersion` 提升为 `activeVersion`，更新正式文件字段并把 job 置为 `completed`。
- 任一任务重试耗尽时 job 进入 `rollingBack`，activeVersion 不切换；必须创建反向恢复任务，把已经处理的数据恢复到 activeVersion，全部收敛后才能进入 `failed`、清理 pendingVersion 并释放锁。
- 补偿清理必须可观测；operation 记录 jobId、dataId、operationId、attempt 和最后错误，失败时保留非 completed 状态供下一轮队列重试，避免静默遗留孤儿向量。

## 11. 同义词文件更新策略

同义词文件更新必须使用 mapping diff 增量更新，不允许退化为全库标准化。

### 11.1 Diff 计算

diff 类型：

```ts
type SynonymMappingDiff = {
  added: NormalizedSynonymMapping[];
  removed: DatasetSynonymMappingSchemaType[];
  changed: {
    oldMapping: DatasetSynonymMappingSchemaType;
    newMapping: NormalizedSynonymMapping;
  }[];
  unchanged: DatasetSynonymMappingSchemaType[];
  affectedLogicalMappingIds: string[];
  affectedTerms: string[];
  jobId: string;
};
```

计算规则：

- 以 `normalizedStandardizedTerm` 作为 mapping 身份键。
- 新旧均存在且 `fingerprint` 相同：`unchanged`，pendingVersion 快照继承旧 `logicalMappingId`。
- 新旧均存在但 `fingerprint` 不同：`changed`，pendingVersion 快照继承旧 `logicalMappingId`，activeVersion 快照不修改。
- 新文件存在、旧文件不存在：`added`，创建新的 `logicalMappingId`。
- 旧文件存在、新文件不存在：`removed`，只存在于 activeVersion，不写入 pendingVersion。
- `affectedLogicalMappingIds = added.logicalMappingId + removed.logicalMappingId + changed.oldMapping.logicalMappingId`，用于 diff 摘要、任务调试和引用追踪。
- `affectedTerms = added.allTerms + changed.old/new allTerms + removed.allTerms` 去重。

### 11.2 受影响数据筛选

只标记满足以下任意条件的数据：

```ts
{
  teamId,
  datasetId,
  $or: [
    { q: affectedTermsRegex },
    { a: affectedTermsRegex },
    { 'indexes.text': affectedTermsRegex }
  ]
}
```

说明：

- `affectedTermsRegex` 覆盖 added/removed/changed mapping 的标准词和同义词，基于 `q/a/indexes.text` 原文粗筛。
- 构造 `affectedTermsRegex` 时必须转义正则特殊字符；英文使用大小写不敏感选项。粗筛不强制词边界，允许误命中但不能漏掉 matcher 的真实命中，最终由统一 matcher 做精确判断。
- 粗筛命中的数据不一定真的需要重建，worker 必须基于原始 `indexes.text` 重新生成派生向量文本和全文 token，只有派生结果变化才重建向量。
- 如果 diff 全部为 unchanged，则不标记任何数据，不创建训练任务。
- 小词表可在正则长度上限内使用 `$regex` 粗筛；阈值必须按最终 UTF-8 字节数计算，不能只按 term 数量判断。
- 大词表不能拆成数百个 regex 反复扫描没有对应索引的 `q/a/indexes.text`。超过阈值时改为按 `_id` 游标单次分页扫描必要字段，在 worker 内用 affected matcher 精确判断，并持久化 `lastDataId/scannedDataCount` 以支持断点续扫。
- 无论使用 regex 还是单次游标扫描，只为 matcher 实际命中且 active/pending 派生结果不同的数据创建训练任务；“扫描过数据”不等于“处理或重建数据”。

### 11.3 任务标记

标准化任务创建：

```ts
MongoDatasetTraining.insertMany(
  affectedDataList.map((data) => ({
    teamId,
    tmbId,
    datasetId,
    collectionId: data.collectionId,
    billId,
    mode: TrainingModeEnum.synonymStandardize,
    dataId: data._id,
    dataMetadata: {
      synonymJobId,
      fileVersion,
      fencingToken,
      synonymFileId: newSynonymId,
      affectedLogicalMappingIds
    },
    retryCount: 5
  }))
);
```

删除文件或 removed-only diff 可创建恢复任务：

```ts
MongoDatasetTraining.insertMany(
  affectedDataList.map((data) => ({
    teamId,
    tmbId,
    datasetId,
    collectionId: data.collectionId,
    billId,
    mode: TrainingModeEnum.synonymRestore,
    dataId: data._id,
    dataMetadata: {
      synonymJobId,
      fileVersion,
      fencingToken,
      affectedLogicalMappingIds
    },
    retryCount: 5
  }))
);
```

任务创建：

- 只在本次受影响数据数大于 0 时创建 `TrainingModeEnum.synonymStandardize` 或 `TrainingModeEnum.synonymRestore` 任务。
- 同一 `synonymJobId + dataId + mode` 必须去重，避免 term 分批粗筛导致重复任务。
- worker 只处理同 `synonymJobId/fileVersion/fencingToken` 的任务，直到没有剩余任务。
- 任务结束并完成 activeVersion 切换后，再清理不再被 active job、补偿任务或引用查询使用的旧版本 mapping。

### 11.4 Job 状态机

状态迁移：

```text
pending
  -> diffing
  -> marking
  -> processing
  -> completed

processing -> rollingBack -> failed
pending/diffing/marking -> cancelled
pending/diffing/marking -> failed
```

关键规则：

- `pending -> diffing`：原子获取 mutation lock，在事务内创建 job，分配新的 `fileVersion/fencingToken`，绑定本次临时 `fileId`。
- `diffing -> marking`：解析文件、完成强映射校验、mapping diff 和全部 pendingVersion mapping 分批写入。校验失败时清理 pending 数据、记录错误、释放锁并把 job 置为 `failed`，不修改 activeVersion mappings。
- `marking -> processing`：游标分批扫描完毕，全部受影响训练任务已幂等写入，且 `markingCursor/diffSummary` 校验通过。
- `processing -> completed`：所有同 `synonymJobId/fileVersion/fencingToken` 的训练任务完成；原子切换 activeVersion，更新计数和 finishTime，再异步清理旧版本 mappings、旧文件和孤儿向量。
- `processing -> rollingBack`：存在不可恢复错误或任务重试耗尽；创建反向任务，把已经提交 pendingVersion 的数据恢复到 activeVersion。
- `rollingBack -> failed`：反向任务全部完成，activeVersion 始终未切换；清理 pendingVersion 和 pending 文件后记录 errorMsg/finishTime 并释放 mutation lock。
- `cancelled`：只允许取消尚未进入 `processing` 的 job；清理 pending 数据后释放锁。进入 `processing` 后只能继续重试或进入 `rollingBack`，避免向量和全文 token 半更新。
- worker 每次写向量、写全文 token、删除训练任务前，都必须重新读取 job 和 mutation lock；正向任务要求 `status='processing'`，反向任务要求 `status='rollingBack'`，并共同校验 `fileVersion/fencingToken` 和租约。
- 前端同义词页展示 job 状态，不直接根据训练任务数量推断文件更新状态。

## 12. 检索改造

### 12.1 Query 标准化

文件：

```text
packages/service/core/dataset/search/utils.ts
```

新增：

```ts
getSynonymMappings({ teamId, datasetIds, query })
standardizeQuery(query, matcher)
```

`datasetSearchQueryExtension` 改造：

- 参数增加 `datasetIds?: string[]`。
- 保持现有问题优化/LLM query extension 和后续召回链路不变。
- 先执行现有问题优化，得到原有的 `searchQueries`；没有启用问题优化时，原始 query 视为唯一待改写 query。
- 再对每一条已优化 query 执行同义词改写，不额外拆分 query、不增加按 dataset 的 recall 调用。
- 单一标准词命中时，将原词替换为标准词。
- 同一原词在多个选中知识库映射到不同标准词时，保留原词并把去重后的多个标准词直接拼入 query，格式为：

```text
原 query：苹果手机怎么退款
改写 query：苹果 Apple 水果 手机怎么退款
```

- 拼接顺序按 `datasetIds` 的请求顺序优先、标准词字典序兜底；同一个标准词只保留一次。
- 每个冲突 term 必须拼接全部去重后的标准词，不设置单 term 固定上限，避免静默丢失映射语义。
- 为避免 query 过长，仅对最终改写 query 设置统一字符数或 token 预算；超过预算时按上述稳定顺序截断追加内容并记录日志。
- 同义词改写只执行一次扫描，追加到 query 的标准词不参与后续替换，避免跨知识库冲突导致级联。

版本过渡期规则：

- 没有 `pendingVersion` 时只使用 activeVersion matcher，单知识库单一命中可直接把同义词替换为标准词。
- 存在 `pendingVersion` 时，召回候选中可能同时存在 activeVersion 和 pendingVersion 派生向量。此时 query 必须保留原词，并追加 active/pending 两个版本涉及的全部去重标准词，不能只替换为 pending 标准词。
- 版本过渡扩展与多知识库冲突扩展使用同一套稳定排序和总预算，不增加 `searchQueries` 数量。
- activeVersion 原本不存在（首次上传）或 pendingVersion 为空（删除）时也按同一规则处理；原词始终保留，因此新旧索引都可召回。
- job 完成并清空 `pendingVersion` 后，查询自动恢复为只使用 activeVersion 的常规改写。

多知识库冲突处理：

- 同义词 mapping 的生效作用域固定为单个 `datasetId`。
- 多知识库检索时可以聚合 mapping 构建 query 改写字典，但 value 必须是 `standardizedTerms + datasetIds`，不能在冲突时任选一个标准词覆盖其它值。
- 冲突 term 使用“原词 + 多个标准词”拼接规则，所有知识库复用同一条改写 query，因此 embedding recall、full-text recall、rerank 的既有调用参数和次数不变。
- rerank 内部使用的 mapping 和引用项中的 `synonymMappings` 必须携带 `datasetId`；同一原词在不同知识库命中不同标准词时，按命中 chunk 分别记录，便于追踪本次扩展的来源。

调用处：

```text
packages/service/core/dataset/search/index.ts
```

调用 `datasetSearchQueryExtension` 时传入 `props.datasetIds`。

### 12.2 Chunk mapping 提取

新增：

```text
packages/service/core/dataset/search/synonym.ts
```

函数：

```ts
extractChunkSynonyms(data: DatasetDataSchemaType, chunkId: string): SynonymMappingForPrompt[]
extractQuerySynonyms(query: string, datasetIds: string[]): Promise<SynonymMappingForPrompt[]>
mergeSynonymMappings(mappings: SynonymMappingForPrompt[]): SynonymMappingForPrompt[]
```

在 `defaultRecall/result.ts` 的 `buildSearchResultItem` 中：

- 基于命中数据所属 `datasetId` 和 `synonymIndexVersion` 对应的 mappings，对 chunk 原始 `q/a/indexes.text` 动态计算 chunk 级同义词。
- 写入 `SearchDataResponseItemType.synonymMappings`。
- `synonymMappings` 只包含当前 chunk 原文实际命中的 mapping，不混入仅由 query 命中的 mapping，也不聚合其他引用项的 mapping。
- 每条 mapping 携带 `datasetId`，并保留命中的原词、标准词和 mapping ID；同一 mapping 在单个引用项内去重。
- 未命中同义词时省略可选的 `synonymMappings` 字段；workflow dispatch 不再额外遍历并聚合所有引用的 mapping。

新增 chunk 引用同义词元数据 schema，并由 `SearchDataResponseItemSchema` 引用：

```ts
export const ChunkSynonymMappingMetadataSchema = z.object({
  mappingId: ObjectIdSchema,
  datasetId: ObjectIdSchema,
  fileVersion: z.number().int().nonnegative(),
  matchedTerm: z.string(),
  standardizedTerm: z.string()
});

export const SearchDataResponseItemSchema = DatasetDataItemSchema.omit({
  // 保持现有 omit 配置
}).extend({
  // 保持现有字段
  synonymMappings: z.array(ChunkSynonymMappingMetadataSchema).optional()
});
```

字段语义：

- `mappingId`：mapping 的稳定 `logicalMappingId`，用于跨文件版本追踪同一个逻辑词组。
- `datasetId`：mapping 所属知识库，避免多知识库检索时映射来源混淆。
- `fileVersion`：构造该 chunk 派生索引时使用的版本；仅当存在 pendingVersion 且 `synonymIndexVersion === pendingVersion` 时取 pendingVersion，否则取 activeVersion。
- `matchedTerm`：该 chunk 原文实际命中的同义词。
- `standardizedTerm`：索引和检索增强使用的标准词。

`SearchDataResponseQuoteItemSchema` 是从完整引用中裁剪出的精简引用，也必须在 `pick` 中增加 `synonymMappings: true`，确保引用精简后不丢失 chunk 同义词元数据。

### 12.3 Full-text 自定义分词

`fullTextRecall.ts` 当前使用：

```ts
$text: { $search: await jiebaSplit({ text: query }) }
```

新增同义词后，query 标准化可以覆盖主要召回。当前 `jiebaSplit` 使用进程级共享的 `Jieba.withDict(dictBuffer)` 实例，不能在请求处理中向共享实例动态插入知识库词典，否则会造成不同团队和知识库之间的词典污染。

如果 `@node-rs/jieba` 能以可接受的内存和延迟创建知识库版本隔离实例，可增加：

```ts
jiebaSplitWithCustomDict({
  text: query,
  customWords: allStandardTermsAndSynonyms
})
```

自定义词典来自指定 `datasetId + fileVersion` mappings 的 `standardizedTerm + synonymTerms`，实例缓存键必须包含 datasetId 和 fileVersion，且不得修改全局 jieba 实例。

该能力属于条件增强项：实现前需要基准测试实例创建成本、50,000 terms 下内存占用和并发隔离。若不满足要求，首版继续使用现有 `jiebaSplit`，依靠标准化后的 query 和已标准化的 `fullTextToken` 完成召回，不能为了功能完整度引入全局可变词典。

## 13. Rerank 同义词增强

文件：

```text
packages/service/core/dataset/search/defaultRecall/rerank.ts
```

当前 rerank document：

```ts
text: `${item.q}\n${item.a}`.trim()
```

新增：

```ts
buildSynonymAwareRerankQuery(...)
buildSynonymAwareRerankDocument(...)
```

默认短格式：

```text
原始问题
标准化问题
```

document 增强：

```text
{q}
{a}

同义词：原词 = 标准词；另一个原词 = 标准词
```

限制：

- 最多追加 20 条 mapping。
- 最多追加 512 字符。
- 原文永远在前，同义词上下文在后。

调用链：

- `defaultSearchDatasetData` 计算 query 级 mapping。
- `searchDatasetData` 或 `reRankSearchResults` 接收 `querySynonymMappings`。
- `datasetDataReRank` 统一构造 query/document。

## 14. Workflow 知识库引用元数据

### 14.1 节点输出保持不变

不在 `NodeOutputKeyEnum` 增加 `datasetUsedSynonymMappings`，也不修改知识库检索节点模板的输出列表。节点继续只通过现有 `quoteQA` 输出知识库引用；每个引用项通过 `SearchDataResponseItemType.synonymMappings` 携带对应 chunk 实际使用的同义词元数据。

### 14.2 dispatch 返回

文件：

```text
packages/service/core/workflow/dispatch/dataset/search.ts
```

`DatasetSearchResponse` 不增加独立的同义词输出参数：

```ts
export type DatasetSearchResponse = DispatchNodeResultType<{
  [NodeOutputKeyEnum.datasetQuoteQA]: SearchDataResponseItemType[];
}>;
```

检索层构造 `searchRes` 时已经为每个引用写入各自的 `synonymMappings`，dispatch 直接透传：

```ts
data: {
  quoteQA: searchRes
}
```

`emptyResult` 保持现有结构：

```ts
data: {
  quoteQA: []
}
```

约束：

- `quoteQA` 中每个引用只携带自身 chunk 的 `synonymMappings`，不能在 dispatch 层合并成节点级列表后再回填给所有引用。
- 引用裁剪、序列化和工作流变量传递链路必须保留 `synonymMappings`；`SearchDataResponseQuoteItemSchema` 等精简引用结构应在对应 pick schema 中显式加入该字段。
- 没有配置同义词或 chunk 未命中同义词时，不改变原有 `quoteQA` 语义。

## 15. 前端设计

### 15.1 路由与页签

文件：

- `projects/app/src/pages/dataset/detail/index.tsx`
- `projects/app/src/pageComponents/dataset/detail/NavBar.tsx`

新增：

```ts
synonym = 'synonym'
```

PC 和移动端都在 `tabList` 增加：

```ts
{ label: t('dataset:synonym_tab_title'), value: TabEnum.synonym }
```

详情页动态加载：

```ts
const Synonym = dynamic(() => import('@/pageComponents/dataset/detail/Synonym'));
```

渲染：

```tsx
{currentTab === TabEnum.synonym && <Synonym />}
```

### 15.2 管理页组件

新增：

```text
projects/app/src/pageComponents/dataset/detail/Synonym/index.tsx
```

功能：

- 空状态说明和示例表格。
- 下载模板。
- 上传同义词文件。
- 展示当前文件名称、大小、上传人、上传时间。
- 下载当前文件。
- 更新当前文件。
- 删除当前文件。
- 上传/更新过程展示进度和失败状态。

### 15.3 前端 API

文件：

```text
projects/app/src/web/core/dataset/api.ts
```

新增：

```ts
postUploadSynonymFile
postUpdateSynonymFile
getSynonymConfig
downloadSynonymFile
deleteSynonymFile
```

### 15.4 i18n

文件：

- `packages/web/i18n/zh-CN/dataset.json`
- `packages/web/i18n/en/dataset.json`
- 如存在繁体文件，也同步补齐。

新增 key：

- `synonym_tab_title`
- `synonym_usage_tip`
- `synonym_confirm_delete`
- `synonym_download_template`
- `synonym_empty_title`
- `synonym_empty_description`
- `synonym_upload_success`
- `synonym_upload_failed`
- `synonym_update`
- `synonym_update_success`
- `synonym_update_failed`
- `synonym_fetch_failed`
- `synonym_download_started`
- `synonym_delete_success`
- `synonym_download_failed`
- `synonym_template_filename`
- `synonym_template_col_standard`
- `synonym_template_col_synonyms`

## 16. 权限、计费与任务状态

权限：

- 上传、更新、删除要求知识库写权限。
- 列表、下载至少要求知识库读权限。

计费：

- 同义词标准化会重建向量，embedding 费用由发起操作的客户承担，使用发起人的 `teamId/tmbId` 和现有知识库训练账单链路完成余额校验、bill 创建与 usage 记录。
- 上传、更新或删除 API 在创建 job 前根据 dataset 统计和 diff 规模估算 embedding 成本上界并执行现有余额校验；受影响数据粗筛在异步 marking 阶段完成，API 不同步扫描全库。估算只用于准入和提示，不直接扣费。
- worker 仅按实际发生的 embedding token 创建 usage。精确比较后无需重建、复用同一 `operationId` 的已有结果、仅更新全文 token、重试但未再次调用 embedding 的情况均不得重复计费。
- worker 因瞬时错误确实再次调用 embedding 时，按实际新增 token 计费；任务和 usage 必须关联 `synonymJobId/dataId/operationId`，便于审计重复请求。
- FastGPT 本仓库会把稳定 `operationId:embedding:attempt` 传给 Plus `concatUsage`；Plus 计费服务必须按该字段去重，才能跨网络超时和进程重启保证不重复记账。该去重逻辑不在本仓库，属于上线前必须同步发布的配套合约。
- job 最终失败不自动退还已经成功调用 embedding 的费用；前端在用户确认上传、更新、删除前明确提示会产生知识库训练费用。
- usage 名称新增：
  - `synonym_standardize`
  - `synonym_restore`

任务状态：

- 使用 `dataset_synonym_jobs` 表示同义词文件更新的可靠状态机，使用 `MongoDatasetTraining` 承载具体数据重建任务。
- 同义词任务插入后，前端集合列表会表现为训练中。
- 同义词页整体进度优先读取 job 的 `diffSummary.completedDataCount/affectedDataCount/failedDataCount`。
- collection 训练状态仍可按 `datasetId + mode in [synonymStandardize, synonymRestore]` 聚合展示，但 worker 写入必须以 `synonymJobId/fileVersion/fencingToken` 为准。

## 17. 实施顺序

本功能按一个完整闭环交付，不拆分“先全量重建、后增量优化”的阶段。建议实施顺序如下：

- 新增 `dataset_mutation_locks`、`dataset_synonyms`、版本化 mapping/job schema、`synonymIndexVersion` 和 global 类型，所有索引使用 `defineIndex`。
- 先让现有集合导入、数据创建、编辑和批量重建接入 mutation lock，再开放同义词写 API，避免上线后存在未受保护的旧入口。
- 新增解析、规范化、统一 matcher、文件管理服务和版本缓存。
- 新增 mapping diff、受影响数据筛选和旧版本 mapping 延迟清理。
- 新增上传、更新、列表、下载、删除 API、Zod 合约和 OpenAPI 文档，API 入参统一使用 `parseApiInput`。
- 新增 `synonymStandardize`、`synonymRestore` mode 和 worker。
- 实现 `operationId` 幂等、fencing token 校验、孤儿向量补偿和 active/pending 版本切换后，再接通上传、更新、删除触发链路。
- 接入训练状态和 usage。
- 创建/编辑/重建数据时应用同义词。
- query 标准化参与召回。
- `SearchDataResponseItemType` 增加 `synonymMappings`。
- chunk mapping 提取。
- rerank query/document 同义词增强。
- workflow 现有 `quoteQA` 的每个引用项透传 chunk 级 `synonymMappings`，不新增独立输出参数。
- 新增前端同义词页，展示 diff 摘要、增量任务状态和失败提示。
- 补充引用 schema、workflow dispatch 透传和测试，不修改节点模板输出列表。

## 18. 测试计划

单元测试：

- CSV/XLSX/XLS 解析。
- mapping 规范化、重复标准词合并、强映射冲突校验。
- 级联和闭环校验：`A -> B`、`B -> C`，`A -> B`、`B -> A`，多个标准词共享同义词均应失败。
- mapping diff：added/removed/changed/unchanged 分类、`logicalMappingId` 跨版本继承、active 快照不被覆盖。
- 受影响数据筛选：term 粗筛、分批去重、空 diff 不创建任务。
- `applySynonymTransform`、`buildSynonymDerivedIndexes` 和 `buildSynonymDerivedFullText`。
- 最长词优先：`苹果手机` 与 `手机` 重叠时只命中 `苹果手机`。
- 英文词边界和大小写：`AI` 命中 `AI/ai/(AI)`，不命中 `RAID/AIOps/AI_2`。
- 中英混合词边界、内部空白和 Unicode 原字符精确匹配、单跳替换和稳定兜底排序。
- query 标准化去重。
- 问题优化后再执行同义词改写，保持原有 `searchQueries` 数量和召回链路不变。
- 多知识库冲突时保留原词并按稳定顺序拼接多个标准词，不发生二次替换或级联。
- full-text query 在现有分词器下的标准化召回；若隔离 Jieba 实例基准通过，再覆盖自定义词典分词。
- chunk mapping 提取。
- rerank query/document 构造。
- chunk mapping 在单个引用项内去重，且不同引用之间不聚合、不串写。

集成测试：

- 上传同义词文件后创建新数据，向量 index 使用标准词，`q/a` 保持原文。
- 上传同义词文件后创建和重建数据，`q/a/indexes.text` 保持原文，向量输入和全文 token 使用派生标准化文本。
- 更新同义词文件后只标记 diff 影响的数据，未受影响数据不创建训练任务、不重建向量。
- changed mapping 继承旧 `logicalMappingId` 且不覆盖 active `_id` 快照；旧任务缺少匹配的 `synonymJobId/fileVersion/fencingToken` 时不能继续处理。
- 普通数据写入与 synonym job 并发竞争时只能有一个 owner 获得 mutation lock；租约过期后旧 fencing token 不能继续提交。
- processing 期间 active/pending 版本同时存在，query 保留原词并扩展两个版本标准词；完成后原子切换 activeVersion。
- 向量写入成功但 Mongo 提交失败时清理新向量；Mongo 提交成功但旧向量删除失败时创建补偿任务。
- 同一 `operationId` 已记录 embedding 结果时重试不重复调用、不重复计费；崩溃窗口内无法恢复结果而确实发生的新增 embedding 调用按实际 token 计费并留下审计记录。
- 删除文件后仅对 term 粗筛命中的数据重建原文向量和原文全文 token，`q/a/indexes.text` 全程不变。
- 同义词改写在问题优化后执行，不增加 `searchQueries` 数量。
- 多知识库检索中，同一原词映射到不同标准词时，问题优化后的 query 保留原词并拼接多个标准词，既有召回链路不增加分组调用。
- full-text 和 embedding 均能召回标准词内容。
- rerank 开启时追加同义词上下文。
- workflow 只返回现有 `quoteQA`；每个引用项分别携带其 chunk 实际命中的 `synonymMappings`。
- 删除知识库时清理 synonym 配置、mapping、job、lock、训练任务和 active/pending 文件；重复执行删除保持幂等。

回归测试：

- 未配置同义词的知识库，导入、编辑、重建、检索结果不变。
- 图片数据和 `imageEmbedding` index 不被同义词处理。
- API 权限不足时上传、更新、删除失败。
- 文件解析失败时不会写入 Mongo，multipart 临时文件会在请求 finally 中清理。
- 50,000 terms 并发检索时，不修改共享 Jieba 实例，也不发生跨团队 matcher/cache 污染。

## 19. 风险与注意事项

- 增量 diff 的粗筛条件可能误命中数据，worker 必须做精确转换结果比较，避免无意义向量重建。
- `affectedTerms` 过多时不能拼接超长 `$regex` 或通过大量 regex 批次反复扫描集合，必须切换为可断点恢复的单次 `_id` 游标扫描。
- 同义词文件操作仍应与导入、重建、同义词标准化互斥，避免同一数据同时被不同任务改写 index。
- “事务内查询 active job”不是互斥锁，任何写入口遗漏 mutation lock 都会重新引入竞态；需要通过调用点清单和集成测试防止漏接。
- Mongo 与向量库不存在分布式事务，必须保留 operation 状态和孤儿向量补偿任务，不能吞掉清理失败。
- processing 期间不能提前覆盖 active mapping；否则 query 与部分尚未重建的向量会出现长期不一致。
- 同义词转换不能修改 `q/a` 原文，否则会影响引用展示和用户编辑体验。
- 同义词转换不能修改 `indexes.text` 原文，否则会引入转换链路膨胀和级联恢复问题。
- 旧版本 mapping 不能在版本切换和补偿任务完成前物理删除，否则 worker 无法比较 active/pending 派生结果。
- 只用 term 粗筛无法完全避免误命中，必须接受少量 worker 精确判断成本，换取不持久化转换链路。
- 图片向量索引不应参与文本替换。
- `synonymMappings` 必须跟随所属引用项传递；引用裁剪或精简序列化不能把该字段误删，也不能把其他 chunk 的 mapping 合并进来。
- 动态修改共享 Jieba 词典会造成跨知识库污染；自定义词典只能使用按 datasetId + fileVersion 隔离的实例，无法证明隔离时不得上线该增强项。

## 20. 已确认实施约束

- 文件限制为 10 MiB、10,000 个 mapping、50,000 个 term、单 term 128 个 Unicode code point；如项目已有更严格的团队套餐上传限制，取两者较小值。
- request 级 Jieba 自定义词典只有在隔离实例基准测试通过时纳入首版；否则首版使用现有分词器和同义词标准化文本，不修改共享 Jieba 实例。
- synonym job 期间普通导入、编辑和批量重建当前设计为快速失败，由前端提示稍后重试；本期不增加持久化排队系统。
- 复制/克隆知识库不复制同义词配置，在复制结果页提示用户按需重新上传，避免隐式产生大规模 embedding 重建费用。

## 21. Mongo-only 存储与旧数据升级

### 21.1 目标与上线方式

- 采用一次停机切换，不要求旧节点与新节点混合运行。迁移期间必须停止 app、worker 和其他可能写入同义词配置的进程。
- `dataset_synonym_mappings` 的不可变版本快照是同义词唯一事实来源；S3 不再承担原文件下载、失败任务 retry、审计或退休版本清理。
- 保留 `activeVersion/latestVersion/pendingVersion`、`logicalMappingId`、chunk `synonymIndexVersion` 和版本化 job/operation。Mongo-only 只改变文件内容的存储位置，不改变增量重建的一致性模型。
- 新代码不对未迁移旧结构做静默 fallback。配置或 mapping 缺少版本字段时返回明确迁移错误，避免错误地把同义词当作空配置。

### 21.2 写入与下载接口

- 上传和更新提供两种等价输入：`multipart/form-data` 文件和 JSON `mappings`。文件仅在请求内存/临时上传处理中解析，不写 S3；JSON mapping 形态为 `{ standardizedTerm, synonymTerms[] }`。
- 两种输入必须进入同一个 `normalizeSynonymMappings -> diff -> pendingVersion snapshot -> job` 链路，使用相同限制、冲突校验、计费和 mutation lock，不能形成两套数据语义。
- config 仅保留展示元数据 `fileName/size/uploadTime/uploaderId`。JSON 输入使用规范化 CSV 的 UTF-8 byte size，并允许客户端提供展示文件名；`fileId/pendingFileId` 不再写入。
- 下载接口按 `activeVersion` 流式/分批读取 mappings，生成 UTF-8 BOM CSV。CSV 单元格按 RFC 4180 转义，列数按当前版本最大同义词数量展开；不保证恢复旧 XLS/XLSX 的 sheet、格式和原始行序。
- failed job retry 读取该 job 的 `fileVersion` mapping 快照并创建新版本。为了保证可重试，完整写入后的失败版本不得在 rollback 时删除；取消尚未进入 processing 的版本仍可删除。

### 21.3 Schema 与索引

- `dataset_synonyms` 删除运行时 S3 字段 `fileId/pendingFileId`；旧文档中的字段由迁移脚本保留，不参与新代码读取和写入，观察期后可单独清理。
- `dataset_synonym_jobs` 删除 `fileId/retiredFileId`；退休资源清理只等待 operation 收敛并删除 `retiredVersion` mappings。
- migration 生成的版本 1 mapping 没有创建 job，因此 mapping 的 `jobId` 改为可选，并增加可选 `source = legacyMigration` 作为审计标识。正常新版本仍必须由业务代码写入 `jobId`。
- config 增加 `schemaVersion = 2`。新写入和迁移数据都必须写入该值；运行时据此拒绝旧结构。
- 原 `{ teamId, fileId }` 和 `{ teamId, pendingFileId }` 唯一索引通过 `defineIndex(..., deprecated: true)` 精确登记删除。版本化 mapping 唯一索引只能在迁移预检确认不存在归一化冲突后建立。

### 21.4 停机升级脚本

脚本放在 `projects/app/scripts/migration/`，通过 `MONGODB_URI` 连接 MongoDB，默认 dry-run；只有显式 `--execute` 才写库。脚本不访问或删除 S3。

每个知识库按以下规则独立迁移：

1. 读取一条 legacy `dataset_synonyms` config 和其 `dataset_synonym_mappings`。重复 config、孤立 mapping、无效 ObjectId、缺失标准词/同义词或归一化冲突均标记为失败并跳过该知识库。
2. 使用当前 `normalizeSynonymMappings` 语义重新计算规范字段；迁移不能猜测或自动合并跨标准词冲突。
3. legacy mapping 原地补齐 `logicalMappingId = _id`、`fileVersion = 1`、规范字段、`fingerprint`、`source = legacyMigration`，并把 `createdTime/updatedTime` 映射到 `createTime/updateTime`。保留 legacy 字段以支持观察期审计。
4. 有有效 mapping 的 config 补齐 `activeVersion = latestVersion = 1`、`schemaVersion = 2`；无 mapping 的 config 写为 `activeVersion = latestVersion = 0` 并计入 empty 统计，不伪造版本，后续可直接重新上传。
5. 写入前后比较 mapping count 以及按稳定排序计算的内容 hash。只有全部 mapping 更新且校验一致，才更新 config；单个知识库失败不能留下 config 已切换但 mapping 未完成的状态。
6. 重复运行时，已是 `schemaVersion = 2` 且校验通过的数据计入 skipped；部分迁移数据按相同确定性结果继续补齐，不重复创建 mapping、config 或 job。

脚本输出至少包含：扫描知识库数、可迁移数、已迁移数、已是新结构数、无 mapping 数、冲突数、失败数、mapping 扫描/更新数，以及每个跳过或失败知识库的 ID 和原因。

### 21.5 Chunk 与回退边界

- legacy chunk 缺少 `synonymIndexVersion` 时，仅在 config 已迁移为 `activeVersion = 1` 且不存在 pendingVersion 的条件下视为版本 1；后续编辑或重建会写入显式版本。
- 执行脚本后、Mongo-only 新写入开始前，可以使用备份回退到旧代码。新代码产生版本 2 后，未经兼容修改的旧代码会把多个版本一起读取，因此不能直接回退旧二进制。
- 迁移脚本不删除旧 S3 文件。S3 清理由运维在观察期结束、确认不再需要旧二进制回退后单独执行。

### 21.6 已确认约束

- 文件入口改为 multipart 直传应用服务，同时保留 JSON mappings API；原有“先上传 S3 再提交 fileId”的同义词接口不再兼容。
- 迁移遇到单个知识库归一化冲突时，跳过该知识库并让脚本整体继续，不中止其他知识库迁移。
- 升级脚本不删除旧 S3 文件，由运维在观察期后单独清理。
