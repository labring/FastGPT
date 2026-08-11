import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest';
import { VECTOR_DIM, QUERY_VECTOR } from '../testData';

// 集成测试需用真实 MilvusCtrl，先解除 test/mocks/common/vector.ts 里的全局 mock
vi.unmock('@fastgpt/service/common/vectorDB/milvus');
vi.unmock('@fastgpt/service/common/vectorDB/constants');

import { MilvusCtrl } from '@fastgpt/service/common/vectorDB/milvus';
import { DatasetVectorTableName } from '@fastgpt/service/common/vectorDB/constants';

/**
 * Milvus 端到端召回性能测试（collectionId 过滤）
 *
 * 对应设计文档「端到端检索性能测试」，范围收窄为：
 * - 只测 Milvus（不经过标签过滤 / mongo 链路），直接构造 `filterCollectionIdList`
 * - 对比 embRecall 在「不过滤 / 过滤 10 个 collection / 过滤 100 个 collection」下的召回延迟
 * - 目标：过滤召回延迟与不过滤保持同一数量级（< 10x）
 *
 * 运行要求：设置 `MILVUS_ADDRESS`（见 test/.env.example），未设置则整体跳过。
 * 数据规模可通过环境变量覆盖，默认 100 个 collection × 100 条向量 = 1 万条向量：
 *   MILVUS_PERF_COLLECTION_COUNT        默认 100
 *   MILVUS_PERF_VECTORS_PER_COLLECTION  默认 100
 *
 * 运行方式：pnpm test:vector（或直接 vitest -c vitest.integration.config.ts 本文件）
 */

const isEnabled = Boolean(process.env.MILVUS_ADDRESS);

const COLLECTION_COUNT = Number(process.env.MILVUS_PERF_COLLECTION_COUNT || 100);
const VECTORS_PER_COLLECTION = Number(process.env.MILVUS_PERF_VECTORS_PER_COLLECTION || 100);
const SEARCH_LIMIT = 10;
const MEASURE_ITERATIONS = 20;
const MEASURE_WARMUPS = 3;

const teamId = `perf_team_${Date.now()}`;
const datasetId = `perf_dataset_${Date.now()}`;
const collectionIds = Array.from({ length: COLLECTION_COUNT }, (_, i) => `perf_col_${i + 1}`);

// 确定性向量，便于复现；IP 度量下正数向量的打分稳定
const buildVector = (seed: number) =>
  Array.from({ length: VECTOR_DIM }, (_, index) => (((index + seed) % 10) + 1) / 100);

interface MeasureResult {
  avg: number;
  min: number;
  max: number;
  median: number;
  times: number[];
}

// Milvus 查询是网络调用，只统计墙钟延迟；预热 + 多次取平均/中位数
const measure = async (
  name: string,
  fn: () => Promise<unknown>,
  iterations = MEASURE_ITERATIONS,
  warmups = MEASURE_WARMUPS
): Promise<MeasureResult> => {
  for (let i = 0; i < warmups; i++) await fn();

  const times: number[] = [];
  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    await fn();
    times.push(performance.now() - start);
  }

  const avg = times.reduce((a, b) => a + b, 0) / times.length;
  const min = Math.min(...times);
  const max = Math.max(...times);
  const sorted = [...times].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];

  console.log(
    `    ${name.padEnd(22)}  平均: ${avg.toFixed(2).padStart(8)}ms   中位: ${median
      .toFixed(2)
      .padStart(8)}ms   最小: ${min.toFixed(2).padStart(8)}ms   最大: ${max
      .toFixed(2)
      .padStart(8)}ms`
  );
  return { avg, min, max, median, times };
};

// 并发插入各 collection 的向量。
// 实测该实例 500 向量/批的 insert RPC 约 5~6s，而 1000 向量/批会超线性变慢（~26s/批），
// 因此用小批 + 低并发更划算；并发大包曾触发 gRPC RST_STREAM，保持低并发 + 失败退避重试。
const INSERT_BATCH = 500;
const INSERT_CONCURRENCY = 3;
const INSERT_MAX_RETRY = 5;

const insertCollections = async (vectorCtrl: MilvusCtrl) => {
  // 只存批次元信息，向量在插入前惰性构建，避免一次性物化全部向量导致 OOM
  // （1000×1000 向量全量构建约 12GB 堆）
  const batches: { collectionIndex: number; collectionId: string; start: number; count: number }[] =
    [];
  collectionIds.forEach((collectionId, collectionIndex) => {
    for (let start = 0; start < VECTORS_PER_COLLECTION; start += INSERT_BATCH) {
      batches.push({
        collectionIndex,
        collectionId,
        start,
        count: Math.min(INSERT_BATCH, VECTORS_PER_COLLECTION - start)
      });
    }
  });

  let cursor = 0;
  const insertWithRetry = async (
    batch: { collectionIndex: number; collectionId: string; start: number; count: number },
    attempt = 0
  ): Promise<void> => {
    const vectors = Array.from({ length: batch.count }, (_, i) =>
      buildVector(batch.collectionIndex * VECTORS_PER_COLLECTION + batch.start + i)
    );
    try {
      await vectorCtrl.insert({
        teamId,
        datasetId,
        collectionId: batch.collectionId,
        vectors
      });
    } catch (error) {
      if (attempt < INSERT_MAX_RETRY) {
        await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
        return insertWithRetry(batch, attempt + 1);
      }
      throw error;
    }
  };

  const workers = Array.from({ length: Math.min(INSERT_CONCURRENCY, batches.length) }, async () => {
    while (cursor < batches.length) {
      const batch = batches[cursor++];
      await insertWithRetry(batch);
      if (cursor % 25 === 0) {
        console.log(`    [insert] ${cursor}/${batches.length} batches`);
      }
    }
  });
  await Promise.all(workers);
};

describe.skipIf(!isEnabled)('Milvus 端到端召回性能（collectionId 过滤）', () => {
  const vectorCtrl = new MilvusCtrl();

  beforeAll(async () => {
    await vectorCtrl.init();

    console.log(
      `\n[Milvus 数据准备] ${COLLECTION_COUNT} collections × ${VECTORS_PER_COLLECTION} vectors，开始插入...`
    );
    await insertCollections(vectorCtrl);
    console.log('    [insert] 插入完成，flush + load...');

    // flushSync 等待数据落到已索引的 sealed segment，loadCollectionSync 确保可检索，
    // 让延迟接近生产行为（不测 growing segment 的全扫描）
    const client = await vectorCtrl.getClient();
    await client.flushSync({ collection_names: [DatasetVectorTableName] });
    await client.loadCollectionSync({ collection_name: DatasetVectorTableName });
    console.log('    [flush] 数据已落盘并加载，开始测量\n');
  }, 10_800_000);

  afterAll(async () => {
    try {
      await vectorCtrl.delete({ teamId, datasetIds: [datasetId] });
    } catch (error) {
      // 清理失败不影响结果
    }
  });

  test('不过滤 vs 过滤 10 / 100 个 collection 的召回延迟', async () => {
    console.log(
      `\n[Milvus collectionId 过滤召回性能] ${COLLECTION_COUNT} collections × ${VECTORS_PER_COLLECTION} vectors/collection，limit=${SEARCH_LIMIT}`
    );

    const base = {
      teamId,
      datasetIds: [datasetId],
      vector: QUERY_VECTOR,
      limit: SEARCH_LIMIT,
      forbidCollectionIdList: [] as string[]
    };

    // 1. 基线：不过滤
    const baselineResult = await vectorCtrl.embRecall({ ...base });
    expect(baselineResult.results.length).toBeGreaterThan(0);
    const baseline = await measure('不过滤 (baseline)', () => vectorCtrl.embRecall({ ...base }));

    // 2. 过滤 10 个 collection（10% 命中）
    const filter10Ids = collectionIds.slice(0, 10);
    const filter10Result = await vectorCtrl.embRecall({
      ...base,
      filterCollectionIdList: filter10Ids
    });
    expect(filter10Result.results.length).toBeGreaterThan(0);
    expect(filter10Result.results.every((item) => filter10Ids.includes(item.collectionId))).toBe(
      true
    );
    const filter10 = await measure('过滤 10 个 collection', () =>
      vectorCtrl.embRecall({ ...base, filterCollectionIdList: filter10Ids })
    );

    // 3. 过滤 100 个 collection（全部命中）
    const filter100Result = await vectorCtrl.embRecall({
      ...base,
      filterCollectionIdList: collectionIds
    });
    expect(filter100Result.results.length).toBeGreaterThan(0);
    expect(filter100Result.results.every((item) => collectionIds.includes(item.collectionId))).toBe(
      true
    );
    const filter100 = await measure('过滤 100 个 collection', () =>
      vectorCtrl.embRecall({ ...base, filterCollectionIdList: collectionIds })
    );

    // 目标：过滤延迟与不过滤保持同一数量级（< 10x），floor 50ms 避免基线过快时的抖动误判
    console.log(
      `\n  [对比] 过滤10/不过滤: ${(filter10.avg / baseline.avg).toFixed(2)}x | 过滤100/不过滤: ${(
        filter100.avg / baseline.avg
      ).toFixed(2)}x`
    );
    expect(filter10.avg).toBeLessThan(Math.max(baseline.avg * 10, 50));
    expect(filter100.avg).toBeLessThan(Math.max(baseline.avg * 10, 50));
  }, 300_000);
});
