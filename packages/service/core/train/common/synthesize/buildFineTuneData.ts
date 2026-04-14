// ===== Constants matching DiTing defaults =====
/** Proportion of candidate pool to use for negatives */
const NEGATIVE_SAMPLE_RATIO = 0.5;
/** Base fraction of negatives to sample from the same dataset */
const SAME_DATASET_BASE_RATIO = 0.3;
/** Additional weight on same-dataset negatives scaled by dataset percentage */
const SAME_DATASET_WEIGHT = 0.5;

/** Input data item */
export type FineTuneDataItem = {
  dataId: string;
  datasetId: string;
  q: string; // original long chunk
  a: string;
  indexes: string[][]; // [[q1, q2], ...] short query pairs
};

/** Generated training sample */
export type FineTuneSample = {
  query: string;
  positive: string[]; // always contains exactly 1 element
  negatives: string[];
  sourceId: string;
  datasetId: string;
  originalQ?: string; // only present when includeOriginalQ=true
  originalA?: string;
  metadata?: {
    pairIndex: number;
    isShortQueryPair: boolean; // true=even pair (short→short), false=odd pair (short→long)
    negativeCount: number;
  };
};

export type BuildFineTuneDataParams = {
  items: FineTuneDataItem[];
  minNegativeSamples?: number;
  maxNegativeSamples?: number;
  includeOriginalQ?: boolean;
};

export type BuildFineTuneDataResult = {
  samples: FineTuneSample[];
};

type DatasetStat = {
  count: number;
  percentage: number; // fraction of total items (0.0–1.0)
};

type PrecomputedPools = {
  shortQueries: string[];
  longChunks: string[];
  // Short queries owned by each item (for negative exclusion)
  itemShortQueries: Map<string, Set<string>>;
  // Long chunks owned by each item (for negative exclusion)
  itemLongChunks: Map<string, Set<string>>;
  // Indices into shortQueries[] per dataset (for stratified sampling)
  datasetShortQueryIndices: Map<string, number[]>;
  // Indices into longChunks[] per dataset (for stratified sampling)
  datasetLongChunkIndices: Map<string, number[]>;
};

function computeDatasetStats(items: FineTuneDataItem[]): Map<string, DatasetStat> {
  const counts = new Map<string, number>();
  for (const item of items) {
    counts.set(item.datasetId, (counts.get(item.datasetId) ?? 0) + 1);
  }
  const total = items.length;
  const stats = new Map<string, DatasetStat>();
  for (const [datasetId, count] of counts) {
    stats.set(datasetId, { count, percentage: total > 0 ? count / total : 0 });
  }
  return stats;
}

function buildPrecomputedPools(items: FineTuneDataItem[]): PrecomputedPools {
  const shortQuerySet = new Set<string>();
  const longChunkSet = new Set<string>();
  const shortQueries: string[] = [];
  const longChunks: string[] = [];
  const itemShortQueries = new Map<string, Set<string>>();
  const itemLongChunks = new Map<string, Set<string>>();
  const datasetShortQueryIndices = new Map<string, number[]>();
  const datasetLongChunkIndices = new Map<string, number[]>();

  for (const item of items) {
    if (!itemShortQueries.has(item.dataId)) {
      itemShortQueries.set(item.dataId, new Set());
    }
    if (!itemLongChunks.has(item.dataId)) {
      itemLongChunks.set(item.dataId, new Set());
    }

    // Collect long chunks (original q)
    if (item.q && !longChunkSet.has(item.q)) {
      longChunkSet.add(item.q);
      const idx = longChunks.length;
      longChunks.push(item.q);
      if (!datasetLongChunkIndices.has(item.datasetId)) {
        datasetLongChunkIndices.set(item.datasetId, []);
      }
      datasetLongChunkIndices.get(item.datasetId)!.push(idx);
    }
    if (item.q) {
      itemLongChunks.get(item.dataId)!.add(item.q);
    }

    // Collect short queries (q1, q2 from indexes)
    for (const pair of item.indexes) {
      if (pair.length < 2) continue;
      const [q1, q2] = pair;
      for (const q of [q1, q2]) {
        if (!shortQuerySet.has(q)) {
          shortQuerySet.add(q);
          const idx = shortQueries.length;
          shortQueries.push(q);
          if (!datasetShortQueryIndices.has(item.datasetId)) {
            datasetShortQueryIndices.set(item.datasetId, []);
          }
          datasetShortQueryIndices.get(item.datasetId)!.push(idx);
        }
        itemShortQueries.get(item.dataId)!.add(q);
      }
    }
  }

  return {
    shortQueries,
    longChunks,
    itemShortQueries,
    itemLongChunks,
    datasetShortQueryIndices,
    datasetLongChunkIndices
  };
}

/**
 * Sample up to `target` items from a subset of pool indices using partial Fisher-Yates shuffle.
 * Results are appended to `out`; `alreadySampled` tracks globally selected items.
 */
function sampleFromIndexSubset(
  pool: string[],
  indices: number[],
  excludeSet: Set<string>,
  alreadySampled: Set<string>,
  target: number,
  out: string[]
): void {
  if (indices.length === 0 || target <= 0) return;

  const arr = [...indices];
  const initialLen = out.length;
  // Scan up to target×3 positions to account for rejected samples
  const maxScan = Math.min(arr.length, target * 3);

  for (let i = 0; i < maxScan && out.length - initialLen < target; i++) {
    const j = i + Math.floor(Math.random() * (arr.length - i));
    [arr[i], arr[j]] = [arr[j], arr[i]];
    const q = pool[arr[i]];
    if (!excludeSet.has(q) && !alreadySampled.has(q)) {
      out.push(q);
      alreadySampled.add(q);
    }
  }
}

/**
 * Stratified negative sampling matching DiTing's algorithm:
 *
 * 1. Compute `numNegatives = clamp(floor(estimated_candidates × 0.5), min, max)`
 * 2. Split into same-dataset and cross-dataset targets:
 *    `sameRatio = 0.3 + 0.5 × datasetPercentage`
 * 3. Phase 1: sample from same-dataset indices
 * 4. Phase 2: sample from other-dataset indices
 * 5. Phase 3: global fallback if still insufficient
 */
function sampleNegativesStratified(
  pool: string[],
  datasetIndices: Map<string, number[]>,
  excludeSet: Set<string>,
  datasetId: string,
  datasetPercentage: number,
  minCount: number,
  maxCount: number
): string[] {
  if (pool.length === 0) return [];

  // Approximate available candidates (same rough estimate as DiTing)
  const estimated = Math.max(0, pool.length - excludeSet.size);
  if (estimated <= 0) return [];

  // DiTing's count formula: clamp(candidates × ratio, min, max)
  const numNegatives = Math.max(
    minCount,
    Math.min(maxCount, Math.floor(estimated * NEGATIVE_SAMPLE_RATIO))
  );

  // Same-dataset ratio formula from DiTing
  const sameRatio = SAME_DATASET_BASE_RATIO + SAME_DATASET_WEIGHT * datasetPercentage;
  const targetSame = Math.max(1, Math.floor(numNegatives * sameRatio));
  const targetOther = numNegatives - targetSame;

  const alreadySampled = new Set<string>();
  const result: string[] = [];

  // Phase 1: same-dataset
  const sameIndices = datasetIndices.get(datasetId) ?? [];
  sampleFromIndexSubset(pool, sameIndices, excludeSet, alreadySampled, targetSame, result);

  // Phase 2: cross-dataset
  if (targetOther > 0) {
    const otherIndices: number[] = [];
    for (const [did, idxs] of datasetIndices) {
      if (did !== datasetId) otherIndices.push(...idxs);
    }
    sampleFromIndexSubset(pool, otherIndices, excludeSet, alreadySampled, targetOther, result);
  }

  // Phase 3: global fallback when previous phases didn't yield enough
  if (result.length < numNegatives) {
    const allIndices = Array.from({ length: pool.length }, (_, i) => i);
    sampleFromIndexSubset(
      pool,
      allIndices,
      excludeSet,
      alreadySampled,
      numNegatives - result.length,
      result
    );
  }

  return result.slice(0, numNegatives);
}

/**
 * Build fine-tune training dataset (corresponds to diting's build-fine-tune-data API)
 *
 * Positive sample construction rules:
 * - Even pair_index: query=q1, positive=[q2]  (short query → short query)
 * - Odd pair_index:  query=q1, positive=[original_q] (short query → long chunk)
 *
 * Negative sample sampling rules (aligned with DiTing):
 * - Count: max(min, min(max, floor(candidates × 0.5)))
 * - Even pair: stratified sample from short_query pool (same-dataset + cross-dataset)
 * - Odd pair:  stratified sample from long_chunk pool (same-dataset + cross-dataset)
 */
export function buildFineTuneData(params: BuildFineTuneDataParams): BuildFineTuneDataResult {
  const {
    items,
    minNegativeSamples = 1,
    maxNegativeSamples = 10,
    includeOriginalQ = true
  } = params;

  if (items.length === 0) return { samples: [] };

  const datasetStats = computeDatasetStats(items);
  const pools = buildPrecomputedPools(items);
  const samples: FineTuneSample[] = [];

  for (const item of items) {
    const itemShortQuerySet = pools.itemShortQueries.get(item.dataId) ?? new Set();
    const itemLongChunkSet = pools.itemLongChunks.get(item.dataId) ?? new Set();
    const datasetPercentage = datasetStats.get(item.datasetId)?.percentage ?? 0;

    for (let pairIndex = 0; pairIndex < item.indexes.length; pairIndex++) {
      const pair = item.indexes[pairIndex];
      if (pair.length < 2) continue;

      const [q1, q2] = pair;
      const isEven = pairIndex % 2 === 0;

      let positive: string;
      let pool: string[];
      let datasetIndices: Map<string, number[]>;
      let excludeSet: Set<string>;

      if (isEven) {
        // Even pair: short → short
        positive = q2;
        pool = pools.shortQueries;
        datasetIndices = pools.datasetShortQueryIndices;
        excludeSet = new Set([...itemShortQuerySet]);
      } else {
        // Odd pair: short → long chunk (fall back to q2 when original_q is absent)
        positive = item.q || q2;
        pool = pools.longChunks;
        datasetIndices = pools.datasetLongChunkIndices;
        excludeSet = new Set([...itemLongChunkSet]);
      }

      // Exclude the query and positive themselves
      excludeSet.add(q1);
      excludeSet.add(positive);

      const negatives = sampleNegativesStratified(
        pool,
        datasetIndices,
        excludeSet,
        item.datasetId,
        datasetPercentage,
        minNegativeSamples,
        maxNegativeSamples
      );

      const sample: FineTuneSample = {
        query: q1,
        positive: [positive],
        negatives,
        sourceId: item.dataId,
        datasetId: item.datasetId,
        metadata: {
          pairIndex,
          isShortQueryPair: isEven,
          negativeCount: negatives.length
        }
      };

      if (includeOriginalQ) {
        sample.originalQ = item.q || undefined;
        sample.originalA = item.a || undefined;
      }

      samples.push(sample);
    }
  }

  return { samples };
}
