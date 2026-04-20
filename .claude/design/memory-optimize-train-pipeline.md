# 训练数据管线内存优化设计

## 背景与问题

当前训练数据管线在无 `sampleSize` 约束时存在显著内存峰值问题。根本原因是两个函数都在内存中持有全量文档的完整字段：

| 场景 | 当前峰值 |
|------|---------|
| 5 KB × 5万文档（无 sampleSize） | **~820MB** |
| `sampleDataFromDataset`：持有所有文档 q+a+indexes | ~600MB |
| `buildFineTuneData`：持有 qaText pool + 原始 items | ~220MB 叠加 |

### 核心洞察

1. **sampleDataFromDataset** 的质量过滤只需要 `q` 字段；返回值下游只需要 `dataId + datasetId + collectionId`（供分组用），不需要全量文档。
2. **buildFineTuneData** 的负样本采样只需决定"从哪些文档采"（ID），不需要它们的文字内容。内容在流式输出阶段按需拉取即可。

---

## 新架构总览

```
sampleDataFromDataset(datasetIds, options)
  Phase 1: DB fetch(_id, q, datasetId, collectionId)，check 11 推到 MongoDB 查询
           → 质量过滤（只对 q 字段）
           → 确定性 shuffle（train/eval）或随机 shuffle（random）
           → 两轮配额分配
  Return: SampledDataItem[]   ← 仅含 dataId + datasetId + collectionId

buildFineTuneDataStream(sampledItems, params)  ← 新函数，AsyncGenerator
  Phase 1（纯内存，无 DB）:
    → 按 sampledItems 构建 groups: Map<datasetId, Map<collectionId, dataId[]>>
    → 无 qaText，无 queryText
  Phase 2（纯内存，无 DB）:
    → ID 占位负样本采样：exclude/sampled 均用 dataId
    → 输出 FineTuneSampleIndex[]（纯 ID，约 24MB）
    → 清空 allProcessed
  Phase 3（流式 DB，分批）:
    → 每批收集 unique (sourceId + negativeDataIds)
    → 一次 batch fetch: q + a + $filter(indexes, type===indexType)
    → 对 q/a/index.text 应用 cleanText
    → resolve → yield FineTuneSample → GC

Processor
  → 接收 SampledDataItem[]
  → for await (sample of buildFineTuneDataStream) → batch insertMany
```

---

## 内存峰值对比

```
阶段                         当前              优化后
─────────────────────────────────────────────────────────────
sampleDataFromDataset
  Phase 1 扫描              600MB             110MB（只含 q）
  kbValidDocs 累计          600MB             GC → SampledDataItem[] 14MB
  返回值                    DatasetSelectItem 14MB

buildFineTuneDataStream
  Phase 1-2（构建 groups）   —                 14MB groups + 24MB indices
  qaText pool               200MB             0（完全消除）
  items 持有               600MB             0（不持有）
  Phase 3 每批流式          —                 ~6MB in-flight

整体峰值                    ~820MB            ~124MB（Phase 1 扫描）
稳态（流式处理中）          ~320MB            ~30MB
─────────────────────────────────────────────────────────────
```

---

## 类型定义

### SampledDataItem（sampleDataFromDataset 新返回类型）

```typescript
export type SampledDataItem = {
  dataId: string;
  datasetId: string;
  collectionId: string;
};
```

### ProcessedItem（buildFineTuneDataStream 内部，轻量）

```typescript
// 内部类型，不对外暴露
type ProcessedItem = {
  dataId: string;
  datasetId: string;
  collectionId: string;
  // 无 queryText，无 qaText，无 item 引用
};
```

### FineTuneSampleIndex（内部中间态）

```typescript
// 内部类型，不对外暴露
type FineTuneSampleIndex = {
  sourceId: string;          // query + positive 均来自此文档
  datasetId: string;         // 保留用于输出 FineTuneSample.datasetId
  negativeDataIds: string[]; // 负样本来源文档 IDs
};
```

> **说明**：query 和 positive 均来自同一文档（sourceId），无需分别记录 queryDataId 和 positiveDataId。

### FineTuneSample（最终输出，结构不变）

```typescript
export type FineTuneSample = {
  query: string;
  positive: string[];  // 始终 1 元素
  negatives: string[];
  sourceId: string;
  datasetId: string;
};
```

---

## 详细设计

### sampleDataFromDataset 变更

**接口变更**：

```typescript
export async function sampleDataFromDataset(
  datasetIds: string[],
  options: {
    datasetType?: 'train' | 'eval' | 'random';
    sampleSize?: number;
    weights?: Record<string, number>;
    filterConfig?: ChunkFilterConfig;
  } = {}
): Promise<SampledDataItem[]>   // ← 返回类型由 DatasetSelectItem[] 改为 SampledDataItem[]
```

**Phase 1 查询变更**：

```typescript
// check 11（indexes 为空）推到 MongoDB 查询，避免加载 indexes 内容
const match = {
  datasetId: new Types.ObjectId(datasetId),
  'indexes.0': { $exists: true }   // ← 新增
};

// 只取 q 用于质量过滤，不取 a 和 indexes
const lightDocs = await MongoDatasetData.find(match)
  .select('_id q datasetId collectionId')   // ← 去掉 a 和 indexes
  .lean();
```

**filterAndCleanDocs 调整**：

- 移除 check 11（已由 DB 查询承担）
- 移除 Step 0b 的 cleanText（不再输出 a/indexes，cleanText 推迟到 Phase 3 流式解析）
- 质量过滤仍在 q 上执行：内部对 q 应用 cleanText 后做 checks 1-10，得出有效/无效结论
- 过滤通过后只记录 `{ dataId, datasetId, collectionId }`

```typescript
function filterToSampledItems(
  rawDocs: any[],
  config: Required<ChunkFilterConfig>
): SampledDataItem[] {
  const result: SampledDataItem[] = [];
  for (const doc of rawDocs) {
    const rawQ: string = doc.q ?? '';
    if (!rawQ.trim()) continue;
    const cleanedQ = cleanText(rawQ.trim());
    if (cleanedQ.length < 10) continue;
    if (!isValidChunk(cleanedQ, config)) continue;   // checks 1-10 on cleaned q
    result.push({
      dataId: doc._id.toString(),
      datasetId: doc.datasetId.toString(),
      collectionId: doc.collectionId?.toString() ?? ''
    });
  }
  return result;
}
```

**配额分配后取数**：

```typescript
// Phase 3 取数：从 kbSampledItems[i] 切片，不再需要 DatasetSelectItem
let selected: SampledDataItem[];
if (datasetType === 'eval') {
  selected = kbSampledItems[i].slice(trainCount, trainCount + quota);
} else {
  selected = kbSampledItems[i].slice(0, quota);
}
```

---

### buildFineTuneDataStream 算法

```typescript
export async function* buildFineTuneDataStream(params: {
  sampledItems: SampledDataItem[];
  indexType?: string;               // 默认 'default'
  negativeStrategy?: 1 | 2 | 3 | 4; // 默认 2
  minNegativeSamples?: number;      // 默认 1
  maxNegativeSamples?: number;      // 默认 10
}): AsyncGenerator<FineTuneSample>
```

#### Phase 1：构建 groups（纯内存，无 DB）

```
for each sampledItem:
  ProcessedItem = { dataId, datasetId, collectionId }
  groups[datasetId][collectionId].push(ProcessedItem)

内存：allProcessed = SampledDataItem 数组的轻量副本（~14MB for 200k）
```

#### Phase 2：ID 占位负样本采样

`sampleNegatives` 签名变更（`selfQAText` 改为 `selfDataId`）：

```typescript
function sampleNegativeIds(
  allProcessed: ProcessedItem[],
  groups: Map<string, Map<string, ProcessedItem[]>>,
  selfDataId: string,        // ← 改为 dataId
  selfDatasetId: string,
  selfCollectionId: string,
  strategy: 1 | 2 | 3 | 4,
  minCount: number,
  maxCount: number
): string[]                  // ← 返回 dataId[]，不再返回 qaText[]
```

`sampleFromItems` 关键改动（exclude/sampled/output 全部改用 dataId）：

```typescript
function sampleFromItems(
  candidates: ProcessedItem[],
  excludeIds: Set<string>,   // ← 用 dataId
  sampledIds: Set<string>,   // ← 用 dataId
  target: number,
  outIds: string[]           // ← 输出 dataId[]
): void {
  ...
  const id = arr[i].dataId;
  if (!excludeIds.has(id) && !sampledIds.has(id)) {
    outIds.push(id);         // ← 改这里
    sampledIds.add(id);
  }
}
```

全局兜底使用 dataId 同理。

Phase 2 结束后：

```typescript
// 清空 allProcessed，释放 groups 中的引用
allProcessed.length = 0;
```

#### Phase 3：流式 DB 解析

```typescript
const RESOLVE_BATCH_SIZE = 500;   // 可配置

for (const batch of chunk(sampleIndices, RESOLVE_BATCH_SIZE)) {
  // 收集本批次所有需要查询的 unique IDs
  const uniqueIds = deduplicate([
    ...batch.map(i => i.sourceId),
    ...batch.flatMap(i => i.negativeDataIds)
  ]);

  // 一次批量 fetch（只拉 q + a + 目标类型索引）
  const docs = await MongoDatasetData.aggregate([
    { $match: { _id: { $in: uniqueIds.map(id => new Types.ObjectId(id)) } } },
    { $project: {
        _id: 1, q: 1, a: 1, datasetId: 1,
        indexes: {
          $filter: { input: '$indexes', as: 'idx',
                     cond: { $eq: ['$$idx.type', indexType] } }
        }
    }}
  ]);
  const docMap = new Map(docs.map(d => [d._id.toString(), d]));

  for (const idx of batch) {
    const srcDoc = docMap.get(idx.sourceId);
    if (!srcDoc?.indexes?.length) continue;  // source 无目标 indexType，跳过

    const cleanQ = cleanText(srcDoc.q ?? '');
    const cleanA = cleanText(srcDoc.a ?? '');
    const queryText = cleanText(srcDoc.indexes[0].text);
    const positiveText = buildQAText(cleanQ, cleanA);

    const negatives = idx.negativeDataIds
      .map(id => docMap.get(id))
      .filter((d): d is NonNullable<typeof d> => d != null)
      .map(d => buildQAText(cleanText(d.q ?? ''), cleanText(d.a ?? '')));

    yield {
      query: queryText,
      positive: [positiveText],
      negatives,
      sourceId: idx.sourceId,
      datasetId: idx.datasetId
    };
  }
  // batch 用完后 GC（docMap + docs）
}
```

---

### Processor 变更

```typescript
// Step 4: 采样，得到 SampledDataItem[]（仅含 ID + 分组元数据）
const sampledItems = await sampleDataFromDataset(targetDatasetIds, {
  datasetType: 'train',
  sampleSize: generateConfig.sampleSize,
  weights: generateConfig.weights
});

if (sampledItems.length === 0) { /* throw empty error */ }

// Step 5: 流式生成 + 批量保存（不再一次性持有全部样本）
const SAVE_BATCH_SIZE = 1000;
let saveBatch: (typeof trainData[0])[] = [];
let totalGenerated = 0;

for await (const sample of buildFineTuneDataStream({
  sampledItems,
  indexType: generateConfig.indexType ?? 'default',
  negativeStrategy: generateConfig.negativeStrategy ?? 2,
  minNegativeSamples: generateConfig.minNegativeSamples,
  maxNegativeSamples: generateConfig.maxNegativeSamples
})) {
  saveBatch.push({
    trainsetId,
    teamId: trainset.teamId,
    query: sample.query,
    positiveDocs: sample.positive,
    negativeDocs: sample.negatives,
    source: RerankTrainDataSourceEnum.dataset,
    metadata: { sourceInfo: { datasetInfo: { dataId: sample.sourceId, datasetId: sample.datasetId } }, generateConfig },
    createTime: new Date()
  });
  totalGenerated++;

  if (saveBatch.length >= SAVE_BATCH_SIZE) {
    await MongoRerankTrainsetData.insertMany(saveBatch);
    saveBatch = [];
  }
}
if (saveBatch.length > 0) {
  await MongoRerankTrainsetData.insertMany(saveBatch);
}

if (totalGenerated === 0) { /* throw no-data error */ }
```

`forceRegenerate` 的事务逻辑：需要在流式写入前先删除旧数据（不能用事务包整个流式过程），调整为：

```typescript
if (generateConfig.forceRegenerate) {
  await MongoRerankTrainsetData.deleteMany({ trainsetId, source: RerankTrainDataSourceEnum.dataset });
}
// 然后流式写入（无事务）
```

> **权衡**：原有事务语义（先生成再原子替换）无法包裹长时间流式写入。改为先删再分批写：若中途失败，旧数据已删、新数据不完整。可通过 trainset 状态机（generating → ready/failed）让调用方感知，retry 时重新写入。

---

## ID 占位采样的设计取舍

### 去重语义变化

| | 当前（qaText 去重） | 新设计（dataId 去重） |
|--|-------------------|-------------------|
| 不同 doc，相同 q+a 内容 | 两者不会同时作为负样本 | 可能同时出现 |
| 实际影响 | 避免重复内容作为负样本 | 极少发生（质量过滤已过滤低质量文档） |

结论：接受此轻微质量降级，内存收益（220MB → 0）远大于影响。

### Source doc 无目标 indexType 时

sampleDataFromDataset 的 check 11 确保 `indexes.length > 0`，但不检查特定 indexType。Phase 3 解析时，若 source doc 无 target indexType 的 index，该 sample 跳过（不输出）。实际 sample 数量可能略小于 `sampledItems.length`，属预期行为。

---

## 测试策略

所有测试使用真实 MongoDB（`MONGODB_TEST_URI`），无需 mock。

### sampleDataFromDataset 测试（新增/更新）

```
T-S1: 返回 SampledDataItem（只含 dataId/datasetId/collectionId，无 q/a/indexes 字段）
T-S2: 低质量 q 文档被过滤（短文本、高重复率等）
T-S3: indexes 为空的文档被 DB 查询排除
T-S4: train/eval 分割确定性（同一数据集 train+eval 不重叠，覆盖率=100%）
T-S5: sampleSize 配额分配（等权、不等权）
T-S6: 空 KB 不报错，其他 KB 正常返回
```

### buildFineTuneDataStream 测试（新增）

```
T-B1: 基本流式输出：插入 N 条文档，AsyncGenerator yield N 个 FineTuneSample
T-B2: query = source doc 的 target indexType index text（cleanText 后）
T-B3: positive = [buildQAText(cleanQ, cleanA)]；A 为空时 positive = [Q]
T-B4: 无 target indexType 的 source doc 被跳过（不 yield）
T-B5: strategy=1 → negatives 来自同库同 collection（验证 dataId 归属）
T-B6: strategy=2 → negatives 来自同库其他 collection
T-B7: strategy=3 → negatives 来自其他知识库
T-B8: strategy=4 → negatives 混合三个来源
T-B9: negatives 不包含自身 sourceId 对应的 qaText
T-B10: negatives dataId 无重复
T-B11: minNeg/maxNeg 约束生效
T-B12: 空 sampledItems → generator 直接结束（无 yield）
```

---

## 涉及文件

| 文件 | 变更类型 | 说明 |
|------|---------|------|
| `packages/service/core/train/common/utils.ts` | **修改** | `sampleDataFromDataset` 返回 `SampledDataItem[]`；新增 `filterToSampledItems`；移除 `filterAndCleanDocs`（全量版本）；Phase 1 query 加 `'indexes.0':{$exists:true}`，去掉 `a`/`indexes` 投影 |
| `packages/service/core/train/common/synthesize/buildFineTuneData.ts` | **重写** | 移除 `buildFineTuneData`（同步纯函数）；新增 `buildFineTuneDataStream`（AsyncGenerator）；`ProcessedItem` 去掉 text 字段；`sampleFromItems` 改为 dataId 模式 |
| `packages/service/core/train/rerank/data/processor.ts` | **修改** | 流式消费 `buildFineTuneDataStream`；批量 insertMany；`forceRegenerate` 改为先删再写 |
| `packages/service/core/train/embedding/data/processor.ts` | **修改** | 同上 |
| `test/cases/service/core/train/build-fine-tune-data.test.ts` | **重写** | T-B1 ~ T-B12，使用真实 MongoDB |
| `test/cases/service/core/train/rerank-sampling.test.ts` | **更新** | 验证返回 `SampledDataItem[]` 而非 `DatasetSelectItem[]` |

**无需修改**：`api.d.ts`、`type.d.ts`、`mq.ts`、`constants.ts`（已在上轮重构中更新）。

---

## 执行步骤

| # | 操作 | 验证 |
|---|------|------|
| 1 | 更新 `sampleDataFromDataset` → 返回 `SampledDataItem[]` | T-S1~T-S6 通过 |
| 2 | 重写 `buildFineTuneDataStream`（纯内存 Phase 1-2） | T-B1~T-B12 通过 |
| 3 | 修改 processor.ts（rerank + embedding） | 编译通过 |
| 4 | 运行全量 train 相关测试 | 全部通过 |
