/**
 * pipeline-memory-benchmark.test.ts
 *
 * 完整 pipeline 内存 benchmark：
 *   sampleDataFromDataset → buildFineTuneDataStream → insertMany(MongoDB) → cursor→JSONL
 *
 * 测量每个阶段的堆内存峰值（通过 10ms 轮询捕获，排除 GC 时机噪音）。
 * 测试规模：N = 500 / 2000 / 5000
 *
 * 输出示例（console.log，不影响 CI）：
 *   ┌─────────────────────────────────────────────────────────────────────┐
 *   │  Pipeline Memory Benchmark  N=5000                                  │
 *   ├──────────────────────┬──────────────┬──────────────┬───────────────┤
 *   │  Stage               │  Peak (MB)   │  Delta (MB)  │  Time (ms)    │
 *   ├──────────────────────┼──────────────┼──────────────┼───────────────┤
 *   │  1. insert test data │   —          │   —          │  3200         │
 *   │  2. sampleFromDataset│  12.4        │  +8.1        │  780          │
 *   │  3. buildStream+save │  18.6        │  +4.2        │  1420         │
 *   │  4. cursor→JSONL     │  11.2        │  +0.4        │  320          │
 *   └──────────────────────┴──────────────┴──────────────┴───────────────┘
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { describe, test, expect, vi } from 'vitest';
import { Types } from '@fastgpt/service/common/mongo';
import { MongoDatasetData } from '@fastgpt/service/core/dataset/data/schema';
import { MongoRerankTrainset } from '@fastgpt/service/core/train/rerank/trainset/schema';
import { MongoRerankTrainsetData } from '@fastgpt/service/core/train/rerank/data/schema';
import { sampleDataFromDataset } from '@fastgpt/service/core/train/common/utils';
import { buildFineTuneDataStream } from '@fastgpt/service/core/train/common/synthesize/buildFineTuneData';
import {
  RerankTrainDataSourceEnum,
  RerankTrainsetStatusEnum
} from '@fastgpt/global/core/train/rerank/constants';
import { DatasetDataIndexTypeEnum } from '@fastgpt/global/core/dataset/data/constants';

// ─── Mock ─────────────────────────────────────────────────────────────────────
vi.mock('@fastgpt/service/common/system/log', () => ({
  addLog: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() }
}));

// ─── 内存测量工具 ──────────────────────────────────────────────────────────────

type StageResult = {
  stageName: string;
  peakHeapMB: number;
  deltaHeapMB: number;
  elapsedMs: number;
};

/**
 * 运行一个异步操作，返回其执行期间的堆内存峰值和耗时。
 * 每 10ms 轮询一次 heapUsed，捕获最高点（GC 可能在中途运行，峰值更能反映实际分配）。
 */
async function measureStage<T>(
  stageName: string,
  operation: () => Promise<T>
): Promise<{ result: T; metric: StageResult }> {
  // 小延迟让上一步 GC 有机会运行
  await new Promise((r) => setTimeout(r, 50));

  const baselineHeap = process.memoryUsage().heapUsed;
  let peakHeap = baselineHeap;

  const timer = setInterval(() => {
    const h = process.memoryUsage().heapUsed;
    if (h > peakHeap) peakHeap = h;
  }, 10);

  const t0 = Date.now();
  let result: T;
  try {
    result = await operation();
  } finally {
    clearInterval(timer);
    // 最后再采一次
    const h = process.memoryUsage().heapUsed;
    if (h > peakHeap) peakHeap = h;
  }
  const elapsed = Date.now() - t0;

  return {
    result,
    metric: {
      stageName,
      peakHeapMB: peakHeap / 1024 / 1024,
      deltaHeapMB: (peakHeap - baselineHeap) / 1024 / 1024,
      elapsedMs: elapsed
    }
  };
}

/** 打印格式化的 benchmark 结果表格 */
function printTable(n: number, metrics: StageResult[]) {
  const w = [28, 14, 14, 12];
  const sep = `├${'─'.repeat(w[0])}┼${'─'.repeat(w[1])}┼${'─'.repeat(w[2])}┼${'─'.repeat(w[3])}┤`;
  const top = `┌${'─'.repeat(w[0])}┬${'─'.repeat(w[1])}┬${'─'.repeat(w[2])}┬${'─'.repeat(w[3])}┐`;
  const bot = `└${'─'.repeat(w[0])}┴${'─'.repeat(w[1])}┴${'─'.repeat(w[2])}┴${'─'.repeat(w[3])}┘`;
  const row = (cells: string[]) =>
    `│ ${cells[0].padEnd(w[0] - 2)} │ ${cells[1].padEnd(w[1] - 2)} │ ${cells[2].padEnd(w[2] - 2)} │ ${cells[3].padEnd(w[3] - 2)} │`;

  console.log(`\n  Pipeline Memory Benchmark  N=${n}`);
  console.log(top);
  console.log(row(['Stage', 'Peak Heap', 'Delta Heap', 'Time']));
  console.log(sep);
  for (const m of metrics) {
    console.log(
      row([
        m.stageName,
        `${m.peakHeapMB.toFixed(1)} MB`,
        `${m.deltaHeapMB >= 0 ? '+' : ''}${m.deltaHeapMB.toFixed(1)} MB`,
        `${m.elapsedMs} ms`
      ])
    );
  }
  console.log(bot);
}

// ─── 测试数据构造 ──────────────────────────────────────────────────────────────

/**
 * 生成能通过质量过滤器的文档内容
 * - q.length >= 50, 中文字符数 >= 10, 质量分 >= 0.65
 * - 有 question 类型的 index
 */
function makeDoc(
  teamId: Types.ObjectId,
  tmbId: Types.ObjectId,
  datasetId: Types.ObjectId,
  collectionId: Types.ObjectId,
  i: number
) {
  return {
    teamId,
    tmbId,
    datasetId,
    collectionId,
    q: `第${i}条测试问题：请详细描述该知识点的核心概念、适用场景以及与相关概念的区别和联系，这是一段足够长的问题文本用于通过质量过滤。`,
    a: `第${i}条答案：该知识点的核心概念是...适用场景包括...与相关概念的主要区别在于结构和用途的不同，具体表现为以下几个方面。`,
    indexes: [
      {
        type: DatasetDataIndexTypeEnum.question,
        dataId: new Types.ObjectId().toString(),
        text: `第${i}条索引文本：核心概念与适用场景`
      }
    ]
  };
}

// ─── Pipeline 核心逻辑（复现 processor + generateTrainsetJsonl）────────────────

const SAVE_BATCH_SIZE = 1000;

/**
 * Stage 3: buildFineTuneDataStream + 批量写入 MongoDB
 * 复现 processor.ts 的核心逻辑
 * @param dryRun true = 只走 buildFineTuneDataStream，不调 insertMany（用于隔离根因）
 */
async function runBuildAndSave(
  trainsetId: string,
  teamId: Types.ObjectId,
  sampledItems: Awaited<ReturnType<typeof sampleDataFromDataset>>,
  dryRun = false
): Promise<number> {
  let saveBatch: any[] = [];
  let totalGenerated = 0;

  for await (const sample of buildFineTuneDataStream({
    sampledItems,
    indexType: DatasetDataIndexTypeEnum.question,
    negativeStrategy: 2,
    minNegativeSamples: 2,
    maxNegativeSamples: 8
  })) {
    saveBatch.push({
      trainsetId,
      teamId,
      query: sample.query,
      positiveDocs: sample.positive,
      negativeDocs: sample.negatives,
      source: RerankTrainDataSourceEnum.dataset,
      metadata: {
        sourceInfo: { datasetInfo: { dataId: sample.sourceId, datasetId: sample.datasetId } }
      },
      createTime: new Date()
    });
    totalGenerated++;

    if (saveBatch.length >= SAVE_BATCH_SIZE) {
      if (!dryRun) {
        await MongoRerankTrainsetData.insertMany(saveBatch);
        await new Promise((r) => setImmediate(r)); // 仅 real-insert 路径：让 GC 有机会回收上批对象
      }
      saveBatch = [];
    }
  }

  if (saveBatch.length > 0) {
    if (!dryRun) await MongoRerankTrainsetData.insertMany(saveBatch);
  }

  return totalGenerated;
}

/**
 * Stage 4: cursor → JSONL 文件
 * 复现 generateTrainsetJsonl 的核心逻辑（流式，不在内存中堆积）
 */
async function runGenerateJsonl(trainsetId: string): Promise<{ filePath: string; count: number }> {
  const tmpDir = os.tmpdir();
  const filePath = path.join(tmpDir, `pipeline_bench_${trainsetId}_${Date.now()}.jsonl`);

  const writeStream = fs.createWriteStream(filePath, { encoding: 'utf-8' });
  const cursor = MongoRerankTrainsetData.find({ trainsetId }).cursor();

  let count = 0;
  for await (const data of cursor) {
    writeStream.write(
      JSON.stringify({
        query: data.query,
        pos: data.positiveDocs,
        neg: data.negativeDocs,
        id: String(count)
      }) + '\n'
    );
    count++;
  }

  await new Promise<void>((resolve, reject) => {
    writeStream.end((err: Error | null | undefined) => (err ? reject(err) : resolve()));
  });

  return { filePath, count };
}

// ─── 测试用例 ──────────────────────────────────────────────────────────────────

async function runPipelineBenchmark(N: number) {
  const teamId = new Types.ObjectId();
  const tmbId = new Types.ObjectId();
  const datasetId = new Types.ObjectId();
  const collectionId = new Types.ObjectId();
  const metrics: StageResult[] = [];

  // ── Stage 1: 插入测试文档 ──────────────────────────────────────────────────
  const { metric: insertMetric } = await measureStage('1. insert test data', async () => {
    const CHUNK = 500;
    for (let start = 0; start < N; start += CHUNK) {
      const batch = Array.from({ length: Math.min(CHUNK, N - start) }, (_, i) =>
        makeDoc(teamId, tmbId, datasetId, collectionId, start + i)
      );
      await MongoDatasetData.insertMany(batch);
    }
    return N;
  });
  metrics.push(insertMetric);

  // ── Stage 2: sampleDataFromDataset ────────────────────────────────────────
  const { result: sampledItems, metric: sampleMetric } = await measureStage(
    '2. sampleDataFromDataset',
    () =>
      sampleDataFromDataset([datasetId.toString()], {
        datasetType: 'train'
      })
  );
  metrics.push(sampleMetric);

  // 创建 trainset 记录（buildAndSave 需要）
  const [trainset] = await MongoRerankTrainset.create([
    {
      teamId,
      tmbId,
      name: `bench-${N}`,
      status: RerankTrainsetStatusEnum.generating
    }
  ]);
  const trainsetId = String(trainset._id);

  // ── Stage 3: buildFineTuneDataStream + insertMany ─────────────────────────
  const { result: totalGenerated, metric: buildMetric } = await measureStage(
    '3. buildStream + save',
    () => runBuildAndSave(trainsetId, teamId, sampledItems)
  );
  metrics.push(buildMetric);

  // ── Stage 4: cursor → JSONL ───────────────────────────────────────────────
  const { result: jsonlResult, metric: jsonlMetric } = await measureStage('4. cursor → JSONL', () =>
    runGenerateJsonl(trainsetId)
  );
  metrics.push(jsonlMetric);

  // 清理临时文件
  try {
    fs.unlinkSync(jsonlResult.filePath);
  } catch (_) {}

  // 输出表格
  printTable(N, metrics);

  return { sampledItems, totalGenerated, jsonlResult, metrics };
}

// ─── describe ─────────────────────────────────────────────────────────────────

describe('Pipeline Memory Benchmark: sampleDataFromDataset → buildStream → save → JSONL', () => {
  test('N=500 完整 pipeline', async () => {
    const { sampledItems, totalGenerated, jsonlResult, metrics } = await runPipelineBenchmark(500);

    // 正确性验证
    expect(sampledItems.length).toBeGreaterThan(0);
    expect(totalGenerated).toBe(sampledItems.length);
    expect(jsonlResult.count).toBe(totalGenerated);

    // 内存断言：Stage 2~4 的 delta 均应小于 100 MB（小数据量，远低于峰值限制）
    for (const m of metrics.slice(1)) {
      expect(m.deltaHeapMB).toBeLessThan(100);
    }

    // Stage 4 (cursor→JSONL) 是纯流式，delta 应小于 10 MB
    const jsonlM = metrics[3];
    expect(jsonlM.deltaHeapMB).toBeLessThan(10);
  }, 60000);

  test('N=2000 完整 pipeline', async () => {
    const { sampledItems, totalGenerated, jsonlResult, metrics } = await runPipelineBenchmark(2000);

    expect(sampledItems.length).toBeGreaterThan(0);
    expect(totalGenerated).toBe(sampledItems.length);
    expect(jsonlResult.count).toBe(totalGenerated);

    // 关键内存断言：delta（各阶段净增量），排除运行时基线干扰

    // Stage 2 (sampleDataFromDataset) delta：ID-only 结果，2000 条应 < 30 MB
    console.log(`  Stage 2 sampleDataFromDataset delta: ${metrics[1].deltaHeapMB.toFixed(1)} MB`);
    expect(metrics[1].deltaHeapMB).toBeLessThan(30);

    // Stage 3 (buildStream + save) delta：Phase1+2 ID占位 + 批量 insertMany 开销，< 100 MB
    console.log(`  Stage 3 buildStream+save delta:      ${metrics[2].deltaHeapMB.toFixed(1)} MB`);
    expect(metrics[2].deltaHeapMB).toBeLessThan(100);

    // Stage 4 (cursor→JSONL) delta：流式读取含 positiveDocs/negativeDocs 富数据，< 40 MB
    console.log(`  Stage 4 cursor→JSONL delta:          ${metrics[3].deltaHeapMB.toFixed(1)} MB`);
    expect(metrics[3].deltaHeapMB).toBeLessThan(40);
  }, 120000);

  test('N=5000 完整 pipeline', async () => {
    const { sampledItems, totalGenerated, jsonlResult, metrics } = await runPipelineBenchmark(5000);

    expect(sampledItems.length).toBeGreaterThan(0);
    expect(totalGenerated).toBe(sampledItems.length);
    expect(jsonlResult.count).toBe(totalGenerated);

    // 关键内存断言：按 delta（各阶段净增量）而非绝对峰值，排除运行时基线干扰

    // Stage 2 (sampleDataFromDataset) delta：返回 ID-only SampledDataItem[]，
    // 5000 条 × ~100 bytes ≈ 0.5MB；加上 mongoose 加载原始 doc（_id/q/datasetId/collectionId），< 30 MB
    console.log(`  Stage 2 sampleDataFromDataset delta: ${metrics[1].deltaHeapMB.toFixed(1)} MB`);
    expect(metrics[1].deltaHeapMB).toBeLessThan(30);

    // Stage 3 (buildStream + save) delta：Phase1+2 ID占位 + 批量插入 MongoDB 开销，< 150 MB
    console.log(`  Stage 3 buildStream+save delta:      ${metrics[2].deltaHeapMB.toFixed(1)} MB`);
    expect(metrics[2].deltaHeapMB).toBeLessThan(150);

    // Stage 4 (cursor→JSONL) delta：cursor 读取含 positiveDocs/negativeDocs 的富数据（非 ID-only），
    // 5000 条 × ~2KB ≈ 10MB，加 mongoose 缓冲 + 上一阶段未 GC 残留，< 80 MB
    console.log(`  Stage 4 cursor→JSONL delta:          ${metrics[3].deltaHeapMB.toFixed(1)} MB`);
    expect(metrics[3].deltaHeapMB).toBeLessThan(80);

    // 验证 sampledItems 是 ID-only
    for (const item of sampledItems.slice(0, 5)) {
      expect(Object.keys(item)).toEqual(['dataId', 'datasetId', 'collectionId']);
    }
  }, 180000);

  // ─── 根因对比测试 ──────────────────────────────────────────────────────────
  // 三路对比，严格隔离每个变量：
  //   3a = insertMany + setImmediate（processor.ts 实际行为）
  //   3b = insertMany，无 setImmediate（去掉 setImmediate，对比 3a 验证 setImmediate 效果）
  //   3c = dry-run，无 insertMany，无 setImmediate（纯 stream 基线）
  test('N=5000 根因隔离: insertMany+setImmediate vs insertMany-only vs dry-run', async () => {
    const teamId = new Types.ObjectId();
    const tmbId = new Types.ObjectId();
    const datasetId = new Types.ObjectId();
    const collectionId = new Types.ObjectId();

    // 插入测试数据
    const CHUNK = 500;
    for (let start = 0; start < 5000; start += CHUNK) {
      const batch = Array.from({ length: Math.min(CHUNK, 5000 - start) }, (_, i) =>
        makeDoc(teamId, tmbId, datasetId, collectionId, start + i)
      );
      await MongoDatasetData.insertMany(batch);
    }

    const sampledItems = await sampleDataFromDataset([datasetId.toString()], {
      datasetType: 'train'
    });
    expect(sampledItems.length).toBeGreaterThan(0);

    const [trainset] = await MongoRerankTrainset.create([
      { teamId, tmbId, name: 'root-cause-test', status: RerankTrainsetStatusEnum.generating }
    ]);
    const trainsetId = String(trainset._id);

    // ── 3a: insertMany + setImmediate（复现 processor.ts） ──
    const { result: countA, metric: metricA } = await measureStage(
      '3a. insertMany + setImmediate',
      () => runBuildAndSave(trainsetId, teamId, sampledItems, false)
    );

    // ── 3b: insertMany，无 setImmediate（单独隔离 setImmediate 的效果） ──
    // 内联实现，不复用 runBuildAndSave，确保无 setImmediate
    const { result: countB, metric: metricB } = await measureStage(
      '3b. insertMany, no setImmediate',
      async () => {
        let batch: any[] = [];
        let total = 0;
        for await (const sample of buildFineTuneDataStream({
          sampledItems,
          indexType: DatasetDataIndexTypeEnum.question,
          negativeStrategy: 2,
          minNegativeSamples: 2,
          maxNegativeSamples: 8
        })) {
          batch.push({
            trainsetId,
            teamId,
            query: sample.query,
            positiveDocs: sample.positive,
            negativeDocs: sample.negatives,
            source: RerankTrainDataSourceEnum.dataset,
            metadata: {
              sourceInfo: { datasetInfo: { dataId: sample.sourceId, datasetId: sample.datasetId } }
            },
            createTime: new Date()
          });
          total++;
          if (batch.length >= SAVE_BATCH_SIZE) {
            await MongoRerankTrainsetData.insertMany(batch);
            batch = []; // 无 setImmediate
          }
        }
        if (batch.length > 0) await MongoRerankTrainsetData.insertMany(batch);
        return total;
      }
    );

    // ── 3c: dry-run，纯 stream 基线（无 insertMany，无 setImmediate） ──
    const { result: countC, metric: metricC } = await measureStage(
      '3c. dry-run (stream only)',
      () => runBuildAndSave(trainsetId, teamId, sampledItems, true)
    );

    console.log('\n  根因隔离三路对比  N=5000');
    console.log(
      `  3a. insertMany + setImmediate : delta ${metricA.deltaHeapMB.toFixed(1)} MB  (${metricA.elapsedMs} ms)`
    );
    console.log(
      `  3b. insertMany, no setImmediate: delta ${metricB.deltaHeapMB.toFixed(1)} MB  (${metricB.elapsedMs} ms)`
    );
    console.log(
      `  3c. dry-run (stream only)     : delta ${metricC.deltaHeapMB.toFixed(1)} MB  (${metricC.elapsedMs} ms)`
    );
    console.log(
      `  setImmediate 效果（3b-3a）    : ~${(metricB.deltaHeapMB - metricA.deltaHeapMB).toFixed(1)} MB`
    );
    console.log(
      `  insertMany 贡献（3a-3c）      : ~${(metricA.deltaHeapMB - metricC.deltaHeapMB).toFixed(1)} MB`
    );
    const setImmediateHelps = metricB.deltaHeapMB - metricA.deltaHeapMB > 5;
    console.log(
      `  → setImmediate ${setImmediateHelps ? '有效降低内存峰值' : '对内存峰值无明显效果'}`
    );

    expect(countA).toBe(countB);
    expect(countA).toBe(countC);

    // insertMany 仍是内存增长主因
    const insertManyContrib = metricA.deltaHeapMB - metricC.deltaHeapMB;
    expect(insertManyContrib).toBeGreaterThan(5);
  }, 240000);
});
