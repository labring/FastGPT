# Train 模块 Diting 接口迁移设计文档

## 背景

当前 rerank/embedding 训练模块依赖 diting 服务完成三类操作：

| 操作 | Diting 接口 | 迁移策略 |
|------|------------|---------|
| 生成训练数据集 | `POST /api/v1/dataset-synthesis/build-fine-tune-data` | **迁移到 FastGPT** |
| 评估模型 | `POST /api/v1/evaluations/embed` / `rerank` | **迁移到 FastGPT** |
| 合成评估数据（QA对） | `POST /api/v1/dataset-synthesis/runs` | 保留 diting |

---

## 一、生成训练数据集（build-fine-tune-data）迁移

### 1.1 原接口逻辑分析

该接口是**纯算法逻辑，无外部模型依赖**。

**输入**：
```typescript
{
  items: Array<{
    dataId: string;
    datasetId: string;
    q: string;          // 原始长 chunk 问题
    a: string;          // 原始答案
    indexes: string[][]; // 问题对 [[q1, q2], ...], q1/q2 为短 query
  }>;
  min_negative_samples?: number; // 默认 1
  max_negative_samples?: number; // 默认 10
  include_original_q?: boolean;  // 默认 true
}
```

**输出**：
```typescript
{
  samples: Array<{
    query: string;          // q1（短 query）
    positive: string[];     // 正样本
    negatives: string[];    // 负样本
    source_id: string;
    dataset_id: string;
    original_q?: string;
    original_a?: string;
  }>;
  total_samples: number;
}
```

**核心算法**：

正样本构建（混合模式，按 indexes 中的 pair 编号决定）：
- **偶数序号的 pair**（index % 2 === 0）：`query = q1`, `positive = [q2]`（短query → 短query）
- **奇数序号的 pair**（index % 2 === 1）：`query = q1`, `positive = [q]`（短query → 长chunk）
- 若 `include_original_q`：同时也将 `query = q`, `positive = [q1]` 加入（长chunk → 短query）

负样本采样（拒绝采样）：
- 短query 型正样本的负样本：从**短 query 池**中随机采样
- 长chunk 型正样本的负样本：从**长 chunk 池**中随机采样
- 采样数量：`min_negative_samples ~ max_negative_samples` 之间随机
- 排除：不能与当前 positive 相同

### 1.2 迁移实现位置

```
packages/service/core/train/common/
└── synthesize/
    └── buildFineTuneData.ts   # 新增：纯 TypeScript 实现
```

### 1.3 接口签名设计

```typescript
type FineTuneDataItem = {
  dataId: string;
  datasetId: string;
  q: string;
  a: string;
  indexes: string[][];
};

type FineTuneSample = {
  query: string;
  positive: string[];
  negatives: string[];
  sourceId: string;
  datasetId: string;
  originalQ?: string;
  originalA?: string;
};

type BuildFineTuneDataParams = {
  items: FineTuneDataItem[];
  minNegativeSamples?: number;
  maxNegativeSamples?: number;
  includeOriginalQ?: boolean;
};

type BuildFineTuneDataResult = {
  samples: FineTuneSample[];
};

export function buildFineTuneData(params: BuildFineTuneDataParams): BuildFineTuneDataResult;
```

### 1.4 修改涉及文件

- `packages/service/core/train/embedding/external/diting/client.ts`：`synthesizeEmbeddingTrainDatas` 改为调用本地函数
- `packages/service/core/train/rerank/external/diting/client.ts`：`synthesizeRerankTrainDatas` 改为调用本地函数
- `packages/service/core/train/embedding/external/index.ts`：移除 mock/real 切换，直接导出本地实现
- `packages/service/core/train/rerank/external/index.ts`：同上

---

## 二、评估模型（evaluations）迁移

### 2.1 Embedding 评估（`/api/v1/evaluations/embed`）

**现状**：diting 中 **`/api/v1/evaluations/embed` 接口从未实现**（diting 只有 `/runs` 和 `/rerank` 两个评估端点）。FastGPT 中调用该接口的代码目前只能靠 mock 跑通，是待实现的功能。

因此这不是"迁移"，而是**直接在 FastGPT 内首次实现 embedding 评估逻辑**。

**实现方案**：

在 FastGPT 内部实现 `evaluateEmbeddingModelHelper`，流程改为：

```
evaluateEmbeddingModelHelper(evalDatasetCollectionId, modelId)
  ├─ 查询评估集所有数据（q, expectedContextIds）
  ├─ 对每条 q 调用 dispatchDatasetSearch(searchMode=embedding, usingReRank=false)
  │   → 返回检索结果及排名
  ├─ 计算期望 id 在结果列表中的排名 rank
  └─ 计算 MRR@K、Precision@K
```

**新函数签名**（位于 `evaluate-model.ts`）：

```typescript
type EvalMetrics = {
  score: number;        // MRR@10 综合分数
  runLogs: {
    detailed_results: Record<string, number>; // mrr@5, precision@5 等
    total_rows: number;
    expect_count: number;
  };
};

async function evaluateEmbeddingModelHelper(
  evalDatasetCollectionId: string,
  modelId: string,
  teamId: string,
  tmbId: string
): Promise<EvalMetrics>;
```

### 2.2 Rerank 评估（`/api/v1/evaluations/rerank`）

**原逻辑**：
1. 接收 `dataset`（包含 q、retrieval_reference_list、expected_dataid）
2. 用 reranker 对每条 q 的 `retrieval_reference_list` 重新排序
3. 计算 expected_dataid 在重排后列表中的排名
4. 计算 MRR@K、NDCG@K、MAP@K、Precision@K

**迁移方案**：

FastGPT 已有 rerank 检索能力，但此处需要先用 embedding 搜索得到候选列表再 rerank。复用评估集中已存储的 `retrievalContextsFull`（embedding 搜索结果），直接对其调用 reranker 重排：

```
evaluateRerankModelHelper(evalDatasetCollectionId, modelId)
  ├─ 查询评估集所有数据（q, expectedContextIds, retrievalContextsFull）
  ├─ 对每条 q 调用 reranker(q, retrievalContextsFull)
  │   → 返回重排后的列表
  ├─ 计算期望 id 在重排后列表中的排名 rank
  └─ 计算 MRR@K、NDCG@K、MAP@K、Precision@K
```

**新函数签名**（位于 rerank 的 `evaluate-model.ts`）：

```typescript
async function evaluateRerankModelHelper(
  evalDatasetCollectionId: string,
  modelId: string,
  teamId: string,
  tmbId: string
): Promise<EvalMetrics>;
```

### 2.3 指标计算工具函数（Embedding 与 Rerank 完全共享）

Embedding 评估和 Rerank 评估的**算法核心完全相同**：
1. 获得每条 query 对应的有序文档 ID 列表（来源不同，但结构相同）
2. 查找 `expectedContextIds` 在列表中的排名
3. 用排名计算 MRR、NDCG、MAP、Precision@K

只有步骤 1 不同：Embedding 调 `dispatchDatasetSearch`，Rerank 用 `retrievalContextsFull` + reranker。

提取共享实现：

```
packages/service/core/train/common/
└── metrics/
    └── rankingMetrics.ts   # MRR、NDCG、MAP、Precision 计算（embedding/rerank 共用）
```

```typescript
type RankingMetricsResult = {
  detailed_results: Record<string, number>;  // embed_top5_mrr / rerank_top5_mrr 等
  mrr_scores: Record<string, number[]>;
  ndcg_scores: Record<string, number[]>;
  map_scores: Record<string, number[]>;
  retrieval_ranks: number[][];
  column_stats: Record<string, any>;
  total_rows: number;
  expect_count: number;
};

/**
 * 通用排名指标计算
 * @param cases       每条 query 的有序文档 ID 列表 + 期望文档 ID 列表
 * @param kValues     k 值列表，默认 [5, 10, 15]
 * @param prefix      指标前缀，embedding 用 'embed'，rerank 用 'rerank'
 */
export function computeRankingMetrics(
  cases: Array<{ rankedIds: string[]; expectedIds: string[] }>,
  kValues?: number[],
  prefix?: string
): RankingMetricsResult;
```

### 2.4 对齐 EmbeddingEvalResult 类型

当前 `EmbeddingDiTingDetailedResults` 缺少 NDCG 和 MAP，实现后需同步更新：

```typescript
// packages/global/core/train/embedding/type.d.ts
export interface EmbeddingDiTingDetailedResults {
  embed_top5_mrr?: number;
  embed_top5_ndcg?: number;   // 新增
  embed_top5_map?: number;    // 新增
  embed_top5_precision?: number;
  embed_top10_mrr?: number;
  embed_top10_ndcg?: number;  // 新增
  embed_top10_map?: number;   // 新增
  embed_top10_precision?: number;
  embed_top15_mrr?: number;
  embed_top15_ndcg?: number;  // 新增
  embed_top15_map?: number;   // 新增
  embed_top15_precision?: number;
  overall_mrr?: number;
  overall_ndcg?: number;      // 新增
  overall_map?: number;       // 新增
  overall_precision?: number;
  [key: string]: any;
}

export interface EmbeddingEvalResult {
  detailed_results: EmbeddingDiTingDetailedResults;
  mrr_scores?: Record<string, number[]>;
  ndcg_scores?: Record<string, number[]>;  // 新增（对齐 Rerank）
  map_scores?: Record<string, number[]>;   // 新增（对齐 Rerank）
  precision_scores?: Record<string, number[]>;
  retrieval_ranks?: number[][];
  column_stats?: Record<string, any>;
  total_rows?: number;
  expect_count?: number;
}
```

---

## 三、文件变更总览

### 新增文件

| 文件 | 说明 |
|------|------|
| `packages/service/core/train/common/synthesize/buildFineTuneData.ts` | 训练数据集生成算法 |
| `packages/service/core/train/common/metrics/rankingMetrics.ts` | MRR/NDCG/MAP/Precision 计算工具 |

### 修改文件

| 文件 | 变更内容 |
|------|---------|
| `packages/service/core/train/embedding/external/index.ts` | `synthesizeEmbeddingTrainDatas` 改为本地实现；`evaluateEmbeddingModel` 改为本地实现 |
| `packages/service/core/train/rerank/external/index.ts` | `synthesizeRerankTrainDatas` 改为本地实现；`evaluateRerankModel` 改为本地实现 |
| `packages/service/core/train/embedding/task/helpers/evaluate-model.ts` | 重写为直接调用 dispatchDatasetSearch + 本地指标计算 |
| `packages/service/core/train/rerank/task/helpers/evaluate-model.ts` | 重写为直接调用 reranker + 本地指标计算 |

### 保留不变文件（继续使用 diting）

| 文件 | 说明 |
|------|------|
| `packages/service/core/train/embedding/external/diting/client.ts` 中的 `synthesizeEmbeddingEvalData` | 合成评估数据 QA 对继续使用 diting |
| `packages/service/core/train/rerank/external/diting/client.ts` 中的 `synthesizeRerankEvalData` | 同上 |

---

## 四、关键依赖和风险

### 4.1 Embedding 评估的语料库问题

原 diting 方案：把全部评估数据的向量都传给 diting，由 diting 做全量向量检索。
新方案：复用 FastGPT 已有的数据集检索（基于 pg vector / milvus），查询范围为评估集关联的数据集集合。

**风险**：原 diting 可能在评估时使用了特定的语料库边界，而 FastGPT 的数据集搜索是全库检索（受 datasetIds 限制）。需确认评估集数据与训练数据集在同一个 dataset 范围内。

### 4.2 Rerank 评估的候选列表

原 diting 方案：从 FastGPT 传入的 `retrieval_reference_list` 直接用于 rerank 评估。
新方案：读取评估集中存储的 `retrievalContextsFull`（在生成评估集时已通过 performDatasetSearch 计算）。

**前提**：评估集生成阶段（generate-evaldataset.ts）已正确存储了 `retrievalContextsFull`，直接读取即可。

### 4.3 指标一致性

需要确保迁移后计算的 MRR、NDCG、MAP 等指标与原 diting 实现一致，通过单元测试验证。

---

## 五、实施步骤

1. **实现 `buildFineTuneData` 算法**（纯算法，无外部依赖，优先验证）
2. **编写单元测试**对比 mock 数据验证算法正确性
3. **实现 `rankingMetrics` 工具函数**
4. **重写 embedding evaluate-model**，改为 dispatchDatasetSearch + 本地指标计算
5. **重写 rerank evaluate-model**，改为本地 reranker 调用 + 本地指标计算
6. **更新 external/index.ts** 移除 diting 依赖（仅保留 synthesizeEvalData 使用 diting）
7. **运行集成测试**验证端到端流程
