import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockMongoDatasetCollectionFind = vi.hoisted(() => vi.fn());
const mockMongoDatasetCollectionTagsFind = vi.hoisted(() => vi.fn());

vi.mock('@fastgpt/service/core/dataset/collection/schema', () => ({
  MongoDatasetCollection: {
    find: mockMongoDatasetCollectionFind
  }
}));

vi.mock('@fastgpt/service/core/dataset/tag/schemaV2', () => ({
  MongoDatasetCollectionTagsV2: {
    find: mockMongoDatasetCollectionTagsFind
  }
}));

import {
  filterCollectionByKeyValueTags,
  filterCollectionByMetadata
} from '../../../../core/dataset/search/defaultRecall/collectionFilter';

/**
 * 标签过滤性能基准测试
 *
 * 1. 新tag横向对比（1000 collections）：
 *    - 1 个 dataset vs 10 个 dataset
 *    - 1 个 filter vs 10 个 filter
 * 2. 新tag vs 旧tag 纵向对比（1000 collections）：
 *    - 新格式（key-value，JS 端过滤） vs 旧格式（字符串数组，mongo $all 过滤）
 *
 * 运行方式：pnpm test:benchmark（vitest.benchmark.config.ts 的 include 命中 test 目录下
 * 所有 *.benchmark.ts 文件）
 */

const COLLECTION_COUNT = 1000;

type CollectionItem = { _id: string; tags?: unknown };

/* ========== mock 辅助：按查询中的 datasetId 返回对应数据集的集合 ========== */

function collectionsForQuery(
  query: { datasetId?: string | { $in?: string[] } } | undefined,
  collectionsByDataset: Record<string, CollectionItem[]>
): CollectionItem[] {
  const ds = query?.datasetId;
  if (typeof ds === 'string') return collectionsByDataset[ds] ?? [];
  if (ds && Array.isArray(ds.$in)) {
    return ds.$in.flatMap((id) => collectionsByDataset[id] ?? []);
  }
  return [];
}

function setupMock({
  tagDocs,
  collectionsByDataset
}: {
  tagDocs: unknown[];
  collectionsByDataset: Record<string, CollectionItem[]>;
}) {
  mockMongoDatasetCollectionTagsFind.mockReturnValue({
    lean: vi.fn().mockResolvedValue(tagDocs)
  });
  mockMongoDatasetCollectionFind.mockImplementation((query: any) => {
    const data = collectionsForQuery(query, collectionsByDataset);
    return {
      hint: () => ({ lean: vi.fn().mockResolvedValue(data) }),
      lean: vi.fn().mockResolvedValue(data)
    };
  });
}

/* ========== 计时辅助 ========== */

interface MeasureResult {
  avg: number;
  min: number;
  max: number;
  median: number;
  times: number[];
  /** 单次调用的真实 CPU 消耗（user+system，毫秒） */
  cpuPerCallMs: number;
  cpuTotalMs: number;
  /** 单次调用的堆峰值增长（KB） */
  peakHeapKB: number;
  /** 单次调用正堆增长的平均（KB） */
  avgPositiveHeapKB: number;
}

async function measure(
  name: string,
  fn: () => unknown | Promise<unknown>,
  iterations = 200,
  warmups = 20
): Promise<MeasureResult> {
  // 预热避开 JIT / 首次模块加载抖动
  for (let i = 0; i < warmups; i++) await fn();

  const cpuBefore = process.cpuUsage();
  const times: number[] = [];
  const heapDeltas: number[] = [];
  for (let i = 0; i < iterations; i++) {
    const heapBefore = process.memoryUsage().heapUsed;
    const start = performance.now();
    await fn();
    times.push(performance.now() - start);
    heapDeltas.push(process.memoryUsage().heapUsed - heapBefore);
  }
  const cpuDelta = process.cpuUsage(cpuBefore); // { user, system } 微秒

  const avg = times.reduce((a, b) => a + b, 0) / times.length;
  const min = Math.min(...times);
  const max = Math.max(...times);
  const sorted = [...times].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];

  const cpuTotalMs = (cpuDelta.user + cpuDelta.system) / 1000;
  const cpuPerCallMs = cpuTotalMs / iterations;
  const positiveHeaps = heapDeltas.filter((d) => d > 0);
  const peakHeapKB = Math.max(...heapDeltas, 0) / 1024;
  const avgPositiveHeapKB =
    positiveHeaps.length > 0
      ? positiveHeaps.reduce((a, b) => a + b, 0) / positiveHeaps.length / 1024
      : 0;

  console.log(`  [${name}]`);
  console.log(
    `    平均耗时: ${avg.toFixed(3)}ms  最小: ${min.toFixed(3)}ms  最大: ${max.toFixed(3)}ms  中位数: ${median.toFixed(3)}ms`
  );
  console.log(
    `    CPU: 平均 ${cpuPerCallMs.toFixed(3)}ms/次 (user+system，${iterations} 次总计 ${cpuTotalMs.toFixed(
      1
    )}ms)`
  );
  console.log(
    `    内存: 单次堆增长峰值 ${peakHeapKB.toFixed(1)}KB | 正增长平均 ${avgPositiveHeapKB.toFixed(
      1
    )}KB (heapUsed，受 GC 影响)`
  );
  return {
    avg,
    min,
    max,
    median,
    times,
    cpuPerCallMs,
    cpuTotalMs,
    peakHeapKB,
    avgPositiveHeapKB
  };
}

/* ========== 数据生成 ========== */

// 每个 dataset 定义一个 number 类型的 key-value 标签
const tagDocsForDataset = (count: number) =>
  Array.from({ length: count }, (_, i) => ({
    _id: `tag-${i + 1}`,
    datasetId: `ds-${i + 1}`,
    tag: 'version',
    tagType: 'number'
  }));

// 共 COLLECTION_COUNT 个 collection，均分到 count 个 dataset，value 覆盖 0..999
const collectionsByDatasetFor = (count: number): Record<string, CollectionItem[]> => {
  const result: Record<string, CollectionItem[]> = {};
  const perDataset = COLLECTION_COUNT / count;
  for (let d = 1; d <= count; d++) {
    result[`ds-${d}`] = Array.from({ length: perDataset }, (_, i) => ({
      _id: `col-${d}-${i}`,
      tags: [{ tagId: `tag-${d}`, value: (d - 1) * perDataset + i }]
    }));
  }
  return result;
};

/* ========== 新tag横向对比 ========== */

describe('新tag横向对比（1000 collections）', () => {
  it('1 个 dataset vs 10 个 dataset', async () => {
    const condition = [{ version: { $gte: 500 } }];
    const datasetIds10 = Array.from({ length: 10 }, (_, i) => `ds-${i + 1}`);

    setupMock({ tagDocs: tagDocsForDataset(1), collectionsByDataset: collectionsByDatasetFor(1) });
    const result1 = await filterCollectionByKeyValueTags({
      $and: condition,
      $or: [],
      teamId: 'team-1',
      datasetIds: ['ds-1']
    });
    expect(result1?.length).toBe(500);

    const r1 = await measure('1 dataset', () =>
      filterCollectionByKeyValueTags({
        $and: condition,
        $or: [],
        teamId: 'team-1',
        datasetIds: ['ds-1']
      })
    );
    expect(r1.avg).toBeLessThan(50);

    setupMock({
      tagDocs: tagDocsForDataset(10),
      collectionsByDataset: collectionsByDatasetFor(10)
    });
    const result10 = await filterCollectionByKeyValueTags({
      $and: condition,
      $or: [],
      teamId: 'team-1',
      datasetIds: datasetIds10
    });
    expect(result10?.length).toBe(500);

    const r10 = await measure('10 datasets', () =>
      filterCollectionByKeyValueTags({
        $and: condition,
        $or: [],
        teamId: 'team-1',
        datasetIds: datasetIds10
      })
    );
    expect(r10.avg).toBeLessThan(100);

    console.log(
      `  [横向对比] 1 dataset 平均: ${r1.avg.toFixed(3)}ms (CPU ${r1.cpuPerCallMs.toFixed(
        3
      )}ms) | 10 datasets 平均: ${r10.avg.toFixed(3)}ms (CPU ${r10.cpuPerCallMs.toFixed(
        3
      )}ms) | 倍率: ${(r10.avg / r1.avg).toFixed(2)}x`
    );
  });

  it('1 个 filter vs 10 个 filter', async () => {
    // 10 个条件全部命中（value 0..999），避免短路提前退出，测满全部条件判断
    const tenConditions = [
      { version: { $gte: 0 } },
      { version: { $lte: 999 } },
      { version: { $gt: -1 } },
      { version: { $lt: 1000 } },
      { version: { $ne: -1 } },
      { version: { $gte: 0 } },
      { version: { $lte: 999 } },
      { version: { $gt: -1 } },
      { version: { $lt: 1000 } },
      { version: { $ne: -1 } }
    ];

    setupMock({ tagDocs: tagDocsForDataset(1), collectionsByDataset: collectionsByDatasetFor(1) });

    const result1 = await filterCollectionByKeyValueTags({
      $and: [{ version: { $gte: 500 } }],
      $or: [],
      teamId: 'team-1',
      datasetIds: ['ds-1']
    });
    expect(result1?.length).toBe(500);

    const r1 = await measure('1 filter', () =>
      filterCollectionByKeyValueTags({
        $and: [{ version: { $gte: 500 } }],
        $or: [],
        teamId: 'team-1',
        datasetIds: ['ds-1']
      })
    );
    expect(r1.avg).toBeLessThan(50);

    const result10 = await filterCollectionByKeyValueTags({
      $and: tenConditions,
      $or: [],
      teamId: 'team-1',
      datasetIds: ['ds-1']
    });
    expect(result10?.length).toBe(1000);

    const r10 = await measure('10 filters', () =>
      filterCollectionByKeyValueTags({
        $and: tenConditions,
        $or: [],
        teamId: 'team-1',
        datasetIds: ['ds-1']
      })
    );
    expect(r10.avg).toBeLessThan(100);

    console.log(
      `  [横向对比] 1 filter 平均: ${r1.avg.toFixed(3)}ms (CPU ${r1.cpuPerCallMs.toFixed(
        3
      )}ms) | 10 filters 平均: ${r10.avg.toFixed(3)}ms (CPU ${r10.cpuPerCallMs.toFixed(
        3
      )}ms) | 倍率: ${(r10.avg / r1.avg).toFixed(2)}x`
    );
  });
});

/* ========== 新tag vs 旧tag 纵向对比 ========== */

describe('新tag vs 旧tag 纵向对比（100 / 1000 collections）', () => {
  beforeEach(() => {
    (global as any).feConfigs = { isPlus: true };
  });
  afterEach(() => {
    (global as any).feConfigs = {};
  });

  it('过滤时间对比', async () => {
    // 与设计文档对齐：100 / 1000 collections，每个 collection 含 1~3 个 tags
    for (const count of [100, COLLECTION_COUNT]) {
      const threshold = Math.floor(count / 2);

      // 新格式：key-value 标签，JS 端值过滤（第 1 个 tag 为命中的 version，其余为干扰项）
      const newCollections: Record<string, CollectionItem[]> = {
        'ds-1': Array.from({ length: count }, (_, i) => ({
          _id: `col-${i}`,
          tags: [
            { tagId: 'tag-version', value: i },
            ...Array.from({ length: i % 3 }, (_, k) => ({ tagId: `extra-${k}`, value: 'x' }))
          ]
        }))
      };
      setupMock({
        tagDocs: [{ _id: 'tag-version', datasetId: 'ds-1', tag: 'version', tagType: 'number' }],
        collectionsByDataset: newCollections
      });
      const newResult = await filterCollectionByMetadata({
        teamId: 'team-1',
        datasetIds: ['ds-1'],
        collectionFilterMatch: JSON.stringify({
          tags: { $and: [{ version: { $gte: threshold } }] }
        })
      });
      expect(newResult?.length).toBeGreaterThan(0);

      const rNew = await measure(`新标签 key-value (${count} collections)`, () =>
        filterCollectionByMetadata({
          teamId: 'team-1',
          datasetIds: ['ds-1'],
          collectionFilterMatch: JSON.stringify({
            tags: { $and: [{ version: { $gte: threshold } }] }
          })
        })
      );

      // 旧格式：字符串数组标签，mongo $all 过滤
      const oldCollections: Record<string, CollectionItem[]> = {
        'ds-1': Array.from({ length: count }, (_, i) => ({
          _id: `col-${i}`,
          tags: ['tag-1']
        }))
      };
      setupMock({
        tagDocs: [{ _id: 'tag-1', datasetId: 'ds-1', tag: 'Tag1' }],
        collectionsByDataset: oldCollections
      });
      const oldResult = await filterCollectionByMetadata({
        teamId: 'team-1',
        datasetIds: ['ds-1'],
        collectionFilterMatch: JSON.stringify({ tags: { $and: ['Tag1'] } })
      });
      expect(oldResult?.length).toBeGreaterThan(0);

      const rOld = await measure(`旧标签 string array (${count} collections)`, () =>
        filterCollectionByMetadata({
          teamId: 'team-1',
          datasetIds: ['ds-1'],
          collectionFilterMatch: JSON.stringify({ tags: { $and: ['Tag1'] } })
        })
      );

      console.log(
        `  [纵向对比 ${count} collections] 新标签平均: ${rNew.avg.toFixed(
          3
        )}ms (CPU ${rNew.cpuPerCallMs.toFixed(3)}ms) | 旧标签平均: ${rOld.avg.toFixed(
          3
        )}ms (CPU ${rOld.cpuPerCallMs.toFixed(3)}ms) | 新/旧倍率: ${(rNew.avg / rOld.avg).toFixed(
          2
        )}x | 新增 JS 过滤成本: ${(rNew.avg - rOld.avg).toFixed(3)}ms`
      );
    }
  });
});
