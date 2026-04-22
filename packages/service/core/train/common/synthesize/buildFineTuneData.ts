import { MongoDatasetData } from '../../../dataset/data/schema';
import { Types } from 'mongoose';
import type { SampledDataItem } from '../utils';
import { cleanText } from '../utils';

const NEGATIVE_SAMPLE_RATIO = 0.5;

export type FineTuneSample = {
  query: string;
  positive: string[]; // 始终 1 元素
  negatives: string[];
  sourceId: string;
  datasetId: string;
};

/** 对应 Python pipeline 的 buildQAText */
export function buildQAText(q: string, a: string): string {
  if (!a || a.trim() === '') return q;
  return `${q}\n${a}`;
}

// ─── Internal types ────────────────────────────────────────────────────────────

type ProcessedItem = {
  dataId: string;
  datasetId: string;
  collectionId: string;
};

type FineTuneSampleIndex = {
  sourceId: string;
  datasetId: string;
  negativeDataIds: string[];
};

// ─── Main export ───────────────────────────────────────────────────────────────

/**
 * Stream fine-tune training samples from sampled data IDs.
 *
 * Phase 1 (pure memory): Build groups from sampledItems.
 * Phase 2 (pure memory): ID-placeholder negative sampling → FineTuneSampleIndex[].
 * Phase 3 (streaming DB): Batch-resolve IDs → yield FineTuneSample.
 *
 * Memory peak: ~38 MB for 200k items (vs. ~820 MB with the old full-doc approach).
 */
export async function* buildFineTuneDataStream(params: {
  sampledItems: SampledDataItem[];
  indexType: string;
  negativeStrategy?: 1 | 2 | 3 | 4;
  minNegativeSamples?: number;
  maxNegativeSamples?: number;
}): AsyncGenerator<FineTuneSample> {
  const {
    sampledItems,
    indexType,
    negativeStrategy = 2,
    minNegativeSamples = 1,
    maxNegativeSamples = 5
  } = params;

  if (sampledItems.length === 0) return;

  // ── Phase 1: Build groups (pure memory, no DB) ────────────────────────────
  const allProcessed: ProcessedItem[] = [];
  const groups = new Map<string, Map<string, ProcessedItem[]>>();

  for (const item of sampledItems) {
    const processed: ProcessedItem = {
      dataId: item.dataId,
      datasetId: item.datasetId,
      collectionId: item.collectionId
    };
    allProcessed.push(processed);

    if (!groups.has(item.datasetId)) groups.set(item.datasetId, new Map());
    const collMap = groups.get(item.datasetId)!;
    if (!collMap.has(item.collectionId)) collMap.set(item.collectionId, []);
    collMap.get(item.collectionId)!.push(processed);
  }

  // ── Phase 2: ID-placeholder negative sampling (pure memory, no DB) ────────
  const sampleIndices: FineTuneSampleIndex[] = [];

  for (const processed of allProcessed) {
    const negativeDataIds = sampleNegativeIds(
      allProcessed,
      groups,
      processed.dataId,
      processed.datasetId,
      processed.collectionId,
      negativeStrategy,
      minNegativeSamples,
      maxNegativeSamples
    );
    sampleIndices.push({
      sourceId: processed.dataId,
      datasetId: processed.datasetId,
      negativeDataIds
    });
  }

  // Release allProcessed to allow GC
  allProcessed.length = 0;

  // ── Phase 3: Streaming DB resolution in batches ───────────────────────────
  const BATCH_SIZE = 500;

  for (let start = 0; start < sampleIndices.length; start += BATCH_SIZE) {
    const batch = sampleIndices.slice(start, start + BATCH_SIZE);

    // Collect unique IDs needed for this batch
    const idSet = new Set<string>();
    for (const idx of batch) {
      idSet.add(idx.sourceId);
      for (const id of idx.negativeDataIds) idSet.add(id);
    }
    const uniqueIds = Array.from(idSet).map((id) => new Types.ObjectId(id));

    // Batch fetch — only q, a, and target indexType index text
    const docs = await MongoDatasetData.aggregate([
      { $match: { _id: { $in: uniqueIds } } },
      {
        $project: {
          _id: 1,
          q: 1,
          a: 1,
          datasetId: 1,
          indexes: {
            $filter: {
              input: '$indexes',
              as: 'idx',
              cond: { $eq: ['$$idx.type', indexType] }
            }
          }
        }
      }
    ]);
    const docMap = new Map(docs.map((d: any) => [d._id.toString(), d]));

    for (const idx of batch) {
      const srcDoc = docMap.get(idx.sourceId);
      if (!srcDoc?.indexes?.length) continue; // no target indexType — skip

      const cleanQ = cleanText(srcDoc.q ?? '');
      const cleanA = cleanText(srcDoc.a ?? '');
      const queryText = cleanText(srcDoc.indexes[0].text);
      const positiveText = buildQAText(cleanQ, cleanA);

      const negatives = idx.negativeDataIds
        .map((id: string) => docMap.get(id))
        .filter((d: any): d is NonNullable<typeof d> => d != null)
        .map((d: any) => buildQAText(cleanText(d.q ?? ''), cleanText(d.a ?? '')));

      yield {
        query: queryText,
        positive: [positiveText],
        negatives,
        sourceId: idx.sourceId,
        datasetId: idx.datasetId
      };
    }
    // docMap + docs go out of scope → GC
  }
}

// ─── Negative sampling helpers ────────────────────────────────────────────────

function sampleNegativeIds(
  allProcessed: ProcessedItem[],
  groups: Map<string, Map<string, ProcessedItem[]>>,
  selfDataId: string,
  selfDatasetId: string,
  selfCollectionId: string,
  strategy: 1 | 2 | 3 | 4,
  minCount: number,
  maxCount: number
): string[] {
  const totalCandidates = allProcessed.length - 1;
  if (totalCandidates <= 0) return [];

  const numNeg = Math.max(
    minCount,
    Math.min(maxCount, Math.floor(totalCandidates * NEGATIVE_SAMPLE_RATIO))
  );
  if (numNeg <= 0) return [];

  const exclude = new Set([selfDataId]);
  const sampled = new Set<string>();
  const result: string[] = [];

  switch (strategy) {
    case 1: {
      const c = groups.get(selfDatasetId)?.get(selfCollectionId) ?? [];
      sampleFromItems(c, exclude, sampled, numNeg, result);
      break;
    }
    case 2: {
      const c = collectSameDatasetOtherCollections(groups, selfDatasetId, selfCollectionId);
      sampleFromItems(c, exclude, sampled, numNeg, result);
      break;
    }
    case 3: {
      const c = collectOtherDatasets(groups, selfDatasetId);
      sampleFromItems(c, exclude, sampled, numNeg, result);
      break;
    }
    case 4: {
      const perSource = Math.max(1, Math.floor(numNeg / 3));
      const remainder = numNeg - perSource * 3;
      // Phase 1: same dataset same collection
      sampleFromItems(
        groups.get(selfDatasetId)?.get(selfCollectionId) ?? [],
        exclude,
        sampled,
        perSource,
        result
      );
      // Phase 2: same dataset other collections
      sampleFromItems(
        collectSameDatasetOtherCollections(groups, selfDatasetId, selfCollectionId),
        exclude,
        sampled,
        perSource,
        result
      );
      // Phase 3: other datasets
      sampleFromItems(
        collectOtherDatasets(groups, selfDatasetId),
        exclude,
        sampled,
        perSource + remainder,
        result
      );
      break;
    }
  }

  // Global fallback: if candidates were insufficient, supplement from all items
  if (result.length < numNeg) {
    sampleFromItems(allProcessed, exclude, sampled, numNeg - result.length, result);
  }

  return result.slice(0, numNeg);
}

/** Partial Fisher-Yates random sampling; appends dataIds to out. */
function sampleFromItems(
  candidates: ProcessedItem[],
  excludeIds: Set<string>,
  sampledIds: Set<string>,
  target: number,
  out: string[]
): void {
  if (candidates.length === 0 || target <= 0) return;
  const arr = [...candidates];
  const maxScan = Math.min(arr.length, target * 3);
  const start = out.length;
  for (let i = 0; i < maxScan && out.length - start < target; i++) {
    const j = i + Math.floor(Math.random() * (arr.length - i));
    [arr[i], arr[j]] = [arr[j], arr[i]];
    const id = arr[i].dataId;
    if (!excludeIds.has(id) && !sampledIds.has(id)) {
      out.push(id);
      sampledIds.add(id);
    }
  }
}

function collectSameDatasetOtherCollections(
  groups: Map<string, Map<string, ProcessedItem[]>>,
  selfDatasetId: string,
  selfCollectionId: string
): ProcessedItem[] {
  const collMap = groups.get(selfDatasetId);
  if (!collMap) return [];
  const r: ProcessedItem[] = [];
  for (const [cid, items] of collMap) {
    if (cid !== selfCollectionId) r.push(...items);
  }
  return r;
}

function collectOtherDatasets(
  groups: Map<string, Map<string, ProcessedItem[]>>,
  selfDatasetId: string
): ProcessedItem[] {
  const r: ProcessedItem[] = [];
  for (const [did, collMap] of groups) {
    if (did !== selfDatasetId) {
      for (const items of collMap.values()) r.push(...items);
    }
  }
  return r;
}
