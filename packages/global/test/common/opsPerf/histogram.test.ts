import { describe, expect, it } from 'vitest';
import {
  OPS_PERF_HISTOGRAM_BOUNDS_MS,
  OPS_PERF_HISTOGRAM_OVERFLOW_BUCKET,
  resolveDatasetIndexScale
} from '@fastgpt/global/common/opsPerf/constants';
import {
  addHistogramValue,
  computeIntervalUnionMs,
  estimatePercentile,
  getHistogramBucketIndex,
  mergeHistograms,
  mergeIntervals,
  type OpsPerfHistogram
} from '@fastgpt/global/common/opsPerf/histogram';
import { OpsPerfBucketSchema, OpsPerfEventSchema } from '@fastgpt/global/common/opsPerf/type';

describe('opsPerf histogram and scale utilities', () => {
  it('maps duration values to expected logarithmic bucket indexes', () => {
    expect(getHistogramBucketIndex(-5)).toBe(0);
    expect(getHistogramBucketIndex(0)).toBe(0);
    expect(getHistogramBucketIndex(10)).toBe(0);
    expect(getHistogramBucketIndex(11)).toBe(1);
    expect(getHistogramBucketIndex(25)).toBe(1);
    expect(getHistogramBucketIndex(60000)).toBe(OPS_PERF_HISTOGRAM_BOUNDS_MS.length - 1);
    expect(getHistogramBucketIndex(60001)).toBe(OPS_PERF_HISTOGRAM_OVERFLOW_BUCKET);
    expect(getHistogramBucketIndex(Number.NaN)).toBe(0);
  });

  it('merges histograms and estimates P50 / P95 / P99 monotonically', () => {
    const histA: OpsPerfHistogram = {};
    const histB: OpsPerfHistogram = {};

    // 80 samples around 150-200ms, 15 samples around 650-1000ms, 5 samples around 2000-3000ms
    addHistogramValue({ hist: histA, durationMs: 180, count: 50 });
    addHistogramValue({ hist: histB, durationMs: 180, count: 30 });
    addHistogramValue({ hist: histA, durationMs: 850, count: 15 });
    addHistogramValue({ hist: histB, durationMs: 2500, count: 5 });

    const merged = mergeHistograms({}, histA);
    mergeHistograms(merged, histB);

    const p50 = estimatePercentile({ hist: merged, quantile: 0.5, maxMs: 2800 });
    const p95 = estimatePercentile({ hist: merged, quantile: 0.95, maxMs: 2800 });
    const p99 = estimatePercentile({ hist: merged, quantile: 0.99, maxMs: 2800 });

    expect(p50).toBeGreaterThanOrEqual(150);
    expect(p50).toBeLessThanOrEqual(200);
    expect(p95).toBeGreaterThanOrEqual(650);
    expect(p95).toBeLessThanOrEqual(1000);
    expect(p99).toBeGreaterThanOrEqual(2000);
    expect(p99).toBeLessThanOrEqual(3000);
    expect(p50).toBeLessThan(p95);
    expect(p95).toBeLessThan(p99);
  });

  it('handles empty histogram and overflow bucket safely', () => {
    expect(estimatePercentile({ hist: {}, quantile: 0.95 })).toBe(0);

    const overflowHist: OpsPerfHistogram = {};
    addHistogramValue({ hist: overflowHist, durationMs: 85000, count: 10 });
    const p50 = estimatePercentile({ hist: overflowHist, quantile: 0.5, maxMs: 90000 });
    expect(p50).toBe(75000);
  });

  it('resolves dataset index scale buckets across boundaries and invalid inputs', () => {
    expect(resolveDatasetIndexScale(undefined)).toBe('unknown');
    expect(resolveDatasetIndexScale(null)).toBe('unknown');
    expect(resolveDatasetIndexScale(-1)).toBe('unknown');
    expect(resolveDatasetIndexScale(0)).toBe('s_10k');
    expect(resolveDatasetIndexScale(9_999)).toBe('s_10k');
    expect(resolveDatasetIndexScale(10_000)).toBe('m_100k');
    expect(resolveDatasetIndexScale(99_999)).toBe('m_100k');
    expect(resolveDatasetIndexScale(100_000)).toBe('l_500k');
    expect(resolveDatasetIndexScale(499_999)).toBe('l_500k');
    expect(resolveDatasetIndexScale(500_000)).toBe('xl_2m');
    expect(resolveDatasetIndexScale(1_999_999)).toBe('xl_2m');
    expect(resolveDatasetIndexScale(2_000_000)).toBe('xxl_2m_plus');
  });

  it('validates discriminatedUnion bucket/event schemas and falls back unknown stored enums', () => {
    const now = new Date();
    const bucket = OpsPerfBucketSchema.parse({
      domain: 'dataset.search',
      granularity: '1h',
      bucketTime: now,
      expireAt: now,
      dimKey: 'searchMode=legacy',
      dims: {
        searchMode: 'legacyMode',
        indexScale: 'legacyScale',
        usingReRank: true,
        usingExtension: false,
        vectorEngine: 'legacyEngine'
      },
      total: {
        count: 1,
        errorCount: 0,
        sumMs: 120,
        maxMs: 120,
        hist: { '4': 1 }
      },
      stages: {},
      metrics: {}
    });

    expect(bucket.domain).toBe('dataset.search');
    if (bucket.domain === 'dataset.search') {
      expect(bucket.dims.searchMode).toBe('unknown');
      expect(bucket.dims.indexScale).toBe('unknown');
      expect(bucket.dims.vectorEngine).toBe('unknown');
    }

    const evt = OpsPerfEventSchema.parse({
      domain: 'dataset.rerank',
      createTime: now,
      expireAt: now,
      reason: 'degraded',
      status: 'degraded',
      errorCode: 'RERANK_FALLBACK',
      resourceIds: [],
      totalMs: 420,
      dims: { model: 'bge-reranker-v2', hasSynonym: true },
      stages: {},
      detail: { candidateCount: 80, fallback: true }
    });
    expect(evt.domain).toBe('dataset.rerank');
    expect(evt.errorCode).toBe('RERANK_FALLBACK');
    expect('errorMessage' in evt).toBe(false);
    expect(() =>
      OpsPerfEventSchema.parse({
        ...evt,
        errorCode: 'RAW_UNTRUSTED_CODE'
      })
    ).toThrow();
  });

  it('computes interval union duration across parallel overlaps and non-member gaps', () => {
    // filter [0, 20], gap for embeddingApi [20, 120], parallel vector [120, 220] & fulltext [120, 220]
    expect(
      computeIntervalUnionMs([
        { start: 0, end: 20 },
        { start: 120, end: 220 },
        { start: 120, end: 220 }
      ])
    ).toBe(120);
    // partial overlap [10, 60] + [40, 110] => 100
    expect(
      computeIntervalUnionMs([
        { start: 40, end: 110 },
        { start: 10, end: 60 }
      ])
    ).toBe(100);
    expect(computeIntervalUnionMs([])).toBe(0);
    expect(
      mergeIntervals([
        { start: 40, end: 110 },
        { start: 10, end: 60 },
        { start: 200, end: 220 }
      ])
    ).toEqual([
      { start: 10, end: 110 },
      { start: 200, end: 220 }
    ]);
  });
});
