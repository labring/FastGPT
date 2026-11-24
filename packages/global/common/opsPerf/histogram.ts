import { OPS_PERF_HISTOGRAM_BOUNDS_MS, OPS_PERF_HISTOGRAM_OVERFLOW_BUCKET } from './constants';

export type OpsPerfHistogram = Record<string, number>;

/**
 * 根据耗时（ms）定位固定对数直方图的桶索引。
 * 负数或非有限数值统一归入第 0 桶，超出最大上界归入溢出桶。
 */
export const getHistogramBucketIndex = (durationMs: number): number => {
  if (!Number.isFinite(durationMs) || durationMs <= 0) {
    return 0;
  }

  for (let i = 0; i < OPS_PERF_HISTOGRAM_BOUNDS_MS.length; i++) {
    if (durationMs <= OPS_PERF_HISTOGRAM_BOUNDS_MS[i]) {
      return i;
    }
  }

  return OPS_PERF_HISTOGRAM_OVERFLOW_BUCKET;
};

/** 向目标稀疏直方图累加一次耗时样本（原位修改，适合内存缓冲聚合）。 */
export const addHistogramValue = ({
  hist,
  durationMs,
  count = 1
}: {
  hist: OpsPerfHistogram;
  durationMs: number;
  count?: number;
}) => {
  if (!Number.isFinite(count) || count <= 0) return;
  const bucketKey = String(getHistogramBucketIndex(durationMs));
  hist[bucketKey] = (hist[bucketKey] ?? 0) + count;
};

/** 将来源直方图合并累加到目标直方图（支持跨小时、跨维度、跨副本无损聚合）。 */
export const mergeHistograms = (target: OpsPerfHistogram, source?: OpsPerfHistogram | null) => {
  if (!source) return target;

  for (const [key, value] of Object.entries(source)) {
    if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
      target[key] = (target[key] ?? 0) + value;
    }
  }

  return target;
};

/**
 * 基于固定对数直方图做桶内线性插值，估算指定分位数（如 0.5 / 0.9 / 0.95 / 0.99）。
 *
 * - 空直方图返回 0
 * - 命中常规桶 [lower, upper] 时按桶内累计位置线性插值
 * - 命中溢出桶 (>60000ms) 时，若提供 maxMs 则在 [60000, maxMs] 内插值，否则返回 60000
 */
export const estimatePercentile = ({
  hist,
  quantile,
  maxMs
}: {
  hist?: OpsPerfHistogram | null;
  quantile: number;
  maxMs?: number;
}): number => {
  if (!hist) return 0;

  const clampedQ = Math.min(1, Math.max(0, quantile));
  let totalCount = 0;
  const counts = new Array<number>(OPS_PERF_HISTOGRAM_OVERFLOW_BUCKET + 1).fill(0);

  for (const [key, rawCount] of Object.entries(hist)) {
    const idx = Number(key);
    if (
      Number.isInteger(idx) &&
      idx >= 0 &&
      idx <= OPS_PERF_HISTOGRAM_OVERFLOW_BUCKET &&
      typeof rawCount === 'number' &&
      Number.isFinite(rawCount) &&
      rawCount > 0
    ) {
      counts[idx] += rawCount;
      totalCount += rawCount;
    }
  }

  if (totalCount === 0) return 0;

  const targetRank = clampedQ * totalCount;
  let cumulative = 0;

  for (let i = 0; i < counts.length; i++) {
    const bucketCount = counts[i];
    if (bucketCount === 0) continue;

    const prevCumulative = cumulative;
    cumulative += bucketCount;

    if (cumulative >= targetRank) {
      const lower = i === 0 ? 0 : OPS_PERF_HISTOGRAM_BOUNDS_MS[i - 1];
      const upper =
        i < OPS_PERF_HISTOGRAM_BOUNDS_MS.length
          ? OPS_PERF_HISTOGRAM_BOUNDS_MS[i]
          : Math.max(
              OPS_PERF_HISTOGRAM_BOUNDS_MS[OPS_PERF_HISTOGRAM_BOUNDS_MS.length - 1],
              maxMs ?? OPS_PERF_HISTOGRAM_BOUNDS_MS[OPS_PERF_HISTOGRAM_BOUNDS_MS.length - 1]
            );

      const fraction =
        bucketCount > 0 ? Math.min(1, Math.max(0, (targetRank - prevCumulative) / bucketCount)) : 1;
      const estimated = lower + (upper - lower) * fraction;
      return Math.round(estimated);
    }
  }

  return Math.round(maxMs ?? OPS_PERF_HISTOGRAM_BOUNDS_MS[OPS_PERF_HISTOGRAM_BOUNDS_MS.length - 1]);
};

/**
 * 将一组非负时间区间 [start, end] 规范化并合并重叠/相邻区间，返回按起点升序排列的互不相交区间。
 * 供采集层压缩高频并发 span 以及聚合层计算并行阶段并集耗时复用。
 */
export const mergeIntervals = (
  intervals: ReadonlyArray<{ start: number; end: number }>
): Array<{ start: number; end: number }> => {
  const normalized = intervals
    .filter(
      (item) =>
        Number.isFinite(item.start) &&
        Number.isFinite(item.end) &&
        item.end >= item.start &&
        item.end >= 0
    )
    .map((item) => {
      const start = Math.max(0, item.start);
      return { start, end: Math.max(start, item.end) };
    })
    .sort((a, b) => a.start - b.start || a.end - b.end);

  if (normalized.length === 0) return [];

  const merged: Array<{ start: number; end: number }> = [normalized[0]!];
  for (let i = 1; i < normalized.length; i++) {
    const next = normalized[i]!;
    const prev = merged[merged.length - 1]!;
    if (next.start <= prev.end) {
      if (next.end > prev.end) prev.end = next.end;
    } else {
      merged.push(next);
    }
  }

  return merged;
};

/**
 * 计算一组时间区间 [start, end] 的并集总时长（ms）。
 * 用于并行阶段（如混合检索中向量与全文并发）的去重汇总，同时排除非成员阶段之间的间隔。
 */
export const computeIntervalUnionMs = (
  intervals: ReadonlyArray<{ start: number; end: number }>
): number => {
  const merged = mergeIntervals(intervals);
  let total = 0;
  for (const item of merged) {
    total += item.end - item.start;
  }
  return Math.round(total * 100) / 100;
};
