import { addLog } from '../../../common/system/log';
import { MongoDatasetData } from '../../dataset/data/schema';
import { Types } from 'mongoose';
import { DatasetDataIndexTypeEnum } from '@fastgpt/global/core/dataset/data/constants';
import type { DatasetDataIndexItemType } from '@fastgpt/global/core/dataset/type';
import type { GenericEnhancedErrorMessage } from '@fastgpt/global/core/train/common/error';
import { TRAIN_DATA_SPLIT_RATIO, DEFAULT_MAX_SAMPLE_PAIRS } from './constants';

/**
 * Concurrency control utility using promise limiting
 *
 * Limits the number of simultaneously executing promises to avoid resource exhaustion.
 *
 * @param concurrency - Maximum number of concurrent promises
 * @returns Limit function to wrap async functions
 *
 * @example
 * const limit = pLimit(5);
 * const results = await Promise.all(
 *   items.map(item => limit(() => processItem(item)))
 * );
 */
export function pLimit(concurrency: number): <T>(fn: () => Promise<T>) => Promise<T> {
  const queue: Array<() => void> = [];
  let activeCount = 0;

  const next = () => {
    activeCount--;
    if (queue.length > 0) {
      const resolve = queue.shift()!;
      resolve();
    }
  };

  const run = async <T>(fn: () => Promise<T>): Promise<T> => {
    return new Promise<T>((resolve, reject) => {
      const execute = async () => {
        activeCount++;
        try {
          const result = await fn();
          resolve(result);
        } catch (error) {
          reject(error);
        } finally {
          next();
        }
      };

      if (activeCount < concurrency) {
        execute();
      } else {
        queue.push(execute);
      }
    });
  };

  return run;
}

/**
 * Dataset item returned from sampleDataFromDataset
 */
export type DatasetSelectItem = {
  datasetId: string;
  dataId: string;
  q: string;
  a: string;
  indexes: DatasetDataIndexItemType[];
};

/**
 * Distribute samples evenly to limit total pairs (pair-aware allocation)
 *
 * Uses two-phase allocation strategy for O(n) complexity.
 * All allocations are in units of PAIR_SIZE (2) to preserve synthesis index pair integrity.
 *
 * - Phase 1: Allocate base pairs to each data item based on average
 * - Phase 2: Distribute remaining pairs in round-robin fashion
 *
 * @param allData - All sampled data items (indexes should be pre-filtered and sorted by synId)
 * @param maxPairs - Maximum total pairs allowed (not indexes)
 * @returns Data items with evenly distributed indexes (always sliced at pair boundaries)
 */
function distributeSamplesEvenly<
  T extends {
    indexes: any[];
  }
>(allData: T[], maxPairs: number): T[] {
  if (allData.length === 0) {
    return [];
  }

  const PAIR_SIZE = 2;

  // Convert to pair-based calculations
  const pairCapacities = allData.map((data) => Math.floor(data.indexes.length / PAIR_SIZE));
  const totalAvailablePairs = pairCapacities.reduce((sum, c) => sum + c, 0);

  // If total available pairs within limit, return all (trimmed to complete pairs)
  if (totalAvailablePairs <= maxPairs) {
    addLog.info('Total available pairs within limit, returning all data', {
      totalAvailablePairs,
      totalAvailableIndexes: totalAvailablePairs * PAIR_SIZE,
      maxPairs
    });
    return allData
      .map((data, i) => ({
        ...data,
        indexes: data.indexes.slice(0, pairCapacities[i] * PAIR_SIZE)
      }))
      .filter((data) => data.indexes.length > 0);
  }

  const dataCount = allData.length;
  const assignments = new Array(dataCount).fill(0); // pair counts
  let remaining = maxPairs;

  // Calculate ideal pair allocation per data item
  const idealPairsPerData = maxPairs / dataCount;

  // Phase 1: Allocate base pairs (floor of ideal, capped by actual pair capacity)
  for (let i = 0; i < dataCount; i++) {
    const canAssign = Math.min(Math.floor(idealPairsPerData), pairCapacities[i]);
    assignments[i] = canAssign;
    remaining -= canAssign;
  }

  addLog.info('Phase 1 allocation completed', {
    idealPairsPerData,
    allocatedPairs: maxPairs - remaining,
    remaining
  });

  // Calculate total available capacity for optimization
  let totalCapacity = 0;
  for (let i = 0; i < dataCount; i++) {
    totalCapacity += Math.max(0, pairCapacities[i] - assignments[i]);
  }

  // Optimization: If remaining quota exceeds total capacity, fill all at once
  if (remaining >= totalCapacity) {
    addLog.info('Fast path: Filling all available capacity', {
      remaining,
      totalCapacity
    });

    for (let i = 0; i < dataCount; i++) {
      const canAdd = Math.max(0, pairCapacities[i] - assignments[i]);
      assignments[i] += canAdd;
      remaining -= canAdd;
    }
  } else {
    // Phase 2: Distribute remaining pairs in round-robin fashion
    let lastRoundAdded = true;

    while (remaining > 0 && lastRoundAdded) {
      lastRoundAdded = false;

      for (let i = 0; i < dataCount && remaining > 0; i++) {
        if (i < allData.length && assignments[i] < pairCapacities[i]) {
          assignments[i]++;
          remaining--;
          lastRoundAdded = true;
        }
      }
    }
  }

  const nonZeroAssignments = assignments.filter((c: number) => c > 0);
  const dataItemsIncluded = nonZeroAssignments.length;
  const totalAllocatedPairs = maxPairs - remaining;

  addLog.info('Phase 2 allocation completed', {
    totalAllocatedPairs,
    totalAllocatedIndexes: totalAllocatedPairs * PAIR_SIZE,
    maxPairs,
    dataItemsIncluded,
    avgPairsPerData: dataItemsIncluded > 0 ? totalAllocatedPairs / dataItemsIncluded : 0
  });

  // Generate final result - convert pair assignments to index slicing
  const result: T[] = allData
    .map((data, i) => {
      if (assignments[i] > 0) {
        return {
          ...data,
          indexes: data.indexes.slice(0, assignments[i] * PAIR_SIZE)
        };
      }
      return null;
    })
    .filter((data): data is T => data !== null);

  return result;
}

/**
 * Hash a string to a 32-bit unsigned integer (djb2 variant)
 */
function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
  }
  return hash >>> 0;
}

/**
 * Seeded pseudo-random number generator (mulberry32 algorithm)
 * Returns a function that generates uniform [0, 1) values deterministically.
 */
function seededRandom(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Sample dataset chunks for training or evaluation
 *
 * Supports three sampling modes:
 * 1. Train mode (datasetType: 'train'): Use first 80% of data
 * 2. Eval mode (datasetType: 'eval'): Use last 20% of data
 * 3. Random mode (datasetType: 'random'): Random sampling (requires sampleSize parameter)
 *
 * For train/eval modes, implements even distribution sampling to limit total pairs:
 * - Each pair contains 2 synthesis indexes with the same synId
 * - Pairs are distributed evenly across data items
 * - Continue until maxSamplePairs limit is reached
 *
 * @param datasetIds - Dataset ID list
 * @param options - Sampling options
 * @param options.datasetType - Sampling mode: 'train' | 'eval' | 'random', default 'train'
 * @param options.sampleSize - Random sample size (only for datasetType='random')
 * @param options.maxSamplePairs - Max total pairs for train/eval mode (default: DEFAULT_MAX_SAMPLE_PAIRS)
 */
export async function sampleDataFromDataset(
  datasetIds: string[],
  options: {
    datasetType?: 'train' | 'eval' | 'random';
    sampleSize?: number;
    maxSamplePairs?: number;
  } = {}
): Promise<DatasetSelectItem[]> {
  // Maximum total pairs to sample in train/eval mode (configurable via MAX_SAMPLE_PAIRS env)
  const MAX_SAMPLE_PAIRS = parseInt(
    process.env.MAX_SAMPLE_PAIRS || String(DEFAULT_MAX_SAMPLE_PAIRS),
    10
  );
  const { sampleSize, datasetType = 'train', maxSamplePairs = MAX_SAMPLE_PAIRS } = options;

  if (datasetType === 'random' && !sampleSize) {
    throw new Error('sampleSize is required when datasetType is "random"');
  }
  if (datasetType !== 'random' && sampleSize) {
    addLog.warn('sampleSize is ignored when datasetType is not "random"', {
      datasetType,
      sampleSize
    });
  }

  const allSamples: DatasetSelectItem[] = [];

  for (const datasetId of datasetIds) {
    addLog.info('Sampling data from dataset', {
      datasetId,
      datasetType,
      sampleSize
    });

    const match = {
      datasetId: new Types.ObjectId(datasetId)
    };

    let sampleData;

    const totalCount = await MongoDatasetData.countDocuments(match);

    if (totalCount === 0) {
      addLog.warn('No data found in dataset', { datasetId });
      continue;
    }

    if (datasetType === 'random') {
      addLog.info('Using random sampling mode', {
        datasetId,
        sampleSize
      });

      sampleData = await MongoDatasetData.aggregate([
        {
          $match: match
        },
        {
          $sample: { size: sampleSize! }
        },
        {
          $project: {
            _id: 1,
            q: 1,
            a: 1,
            indexes: 1,
            datasetId: 1,
            collectionId: 1
          }
        }
      ]);
    } else {
      // Fetch all IDs and apply a deterministic Fisher-Yates shuffle seeded by datasetId,
      // so train (first 80%) and eval (last 20%) always use the same permutation.
      const allDocs = await MongoDatasetData.find(match).select('_id').lean();
      const shuffledIds = allDocs.map((doc: any) => doc._id);

      const rng = seededRandom(hashString(datasetId));
      for (let i = shuffledIds.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [shuffledIds[i], shuffledIds[j]] = [shuffledIds[j], shuffledIds[i]];
      }

      const trainCount = Math.floor(shuffledIds.length * TRAIN_DATA_SPLIT_RATIO);

      // Use find() instead of aggregate() for _id-based queries.
      // aggregate() has inconsistent _id type casting when documents use externally-assigned _ids,
      // causing $match to fail. find() handles type casting correctly via Mongoose.
      const selectFields = '_id q a indexes datasetId collectionId';

      if (datasetType === 'eval') {
        const evalIds = shuffledIds.slice(trainCount);

        addLog.info('Using eval dataset mode (last 20% of shuffled data)', {
          datasetId,
          totalCount: shuffledIds.length,
          trainCount,
          evalCount: evalIds.length
        });

        sampleData = await MongoDatasetData.find({ _id: { $in: evalIds } })
          .select(selectFields)
          .lean();
      } else {
        const trainIds = shuffledIds.slice(0, trainCount);

        addLog.info('Using train dataset mode (first 80% of shuffled data)', {
          datasetId,
          totalCount: shuffledIds.length,
          trainCount
        });

        sampleData = await MongoDatasetData.find({ _id: { $in: trainIds } })
          .select(selectFields)
          .lean();
      }
    }

    addLog.info('Dataset sampling result', {
      datasetId,
      datasetType,
      sampleCount: sampleData.length
    });

    const formattedData = sampleData.map((doc) => {
      // Filter to only keep synthesis indexes with synId
      const allSynthesisIndexes = (doc.indexes as DatasetDataIndexItemType[]).filter(
        (idx) => idx.type === DatasetDataIndexTypeEnum.synthesis && idx.synId !== undefined
      );

      // Count indexes per synId to identify complete pairs
      const synIdCounts = new Map<number, number>();
      for (const idx of allSynthesisIndexes) {
        const synId = idx.synId!;
        synIdCounts.set(synId, (synIdCounts.get(synId) || 0) + 1);
      }

      // Keep only indexes from complete pairs (synId with exactly 2 indexes)
      const validSynIds = new Set<number>();
      let discardedCount = 0;
      for (const [synId, count] of synIdCounts) {
        if (count === 2) {
          validSynIds.add(synId);
        } else {
          discardedCount += count;
          addLog.warn('Incomplete synthesis pair, discarding', {
            dataId: doc._id.toString(),
            synId,
            count
          });
        }
      }

      // Filter to only keep complete pairs and sort by synId
      const synthesisIndexes = allSynthesisIndexes
        .filter((idx) => validSynIds.has(idx.synId!))
        .sort((a, b) => (a.synId ?? 0) - (b.synId ?? 0));

      return {
        datasetId: doc.datasetId.toString(),
        dataId: doc._id.toString(),
        q: doc.q,
        a: doc.a,
        indexes: synthesisIndexes,
        discardedCount
      };
    });

    const totalDiscarded = formattedData.reduce((sum, d) => sum + d.discardedCount, 0);
    const filtered = formattedData.filter((item) => item.indexes.length >= 2);

    addLog.info('Filtered synthesis indexes', {
      datasetId,
      beforeFilter: sampleData.length,
      afterFilter: filtered.length,
      totalSynthesisIndexes: filtered.reduce((sum, d) => sum + d.indexes.length, 0),
      totalDiscardedIndexes: totalDiscarded
    });

    // Remove discardedCount from final data
    allSamples.push(...filtered.map(({ discardedCount, ...rest }) => rest));
  }

  // Apply even distribution for train/eval modes to limit total indexes
  let finalSamples = allSamples;
  if (datasetType !== 'random') {
    const totalPairsBefore = Math.floor(
      allSamples.reduce((sum, data) => sum + data.indexes.length, 0) / 2
    );

    addLog.info('Applying even distribution to limit total pairs', {
      datasetType,
      totalSamplesBefore: allSamples.length,
      totalPairsBefore,
      maxSamplePairs
    });

    finalSamples = distributeSamplesEvenly(allSamples, maxSamplePairs);

    const totalPairsAfter = Math.floor(
      finalSamples.reduce((sum, data) => sum + data.indexes.length, 0) / 2
    );

    addLog.info('Even distribution applied', {
      totalSamplesAfter: finalSamples.length,
      totalPairsAfter,
      pairsReduced: totalPairsBefore - totalPairsAfter
    });
  }

  addLog.info('Final sampling result', {
    totalDatasets: datasetIds.length,
    datasetType,
    totalSamples: finalSamples.length,
    totalPairs: Math.floor(finalSamples.reduce((sum, data) => sum + data.indexes.length, 0) / 2)
  });

  return finalSamples;
}

/**
 * Build model endpoint configuration
 *
 * Converts model config object to OpenAI-compliant endpoint format.
 *
 * @param modelConfig - Model configuration with requestUrl, requestAuth, model fields
 * @returns OpenAI-compliant endpoint object
 */
export function buildModelEndpoint(modelConfig: {
  requestUrl?: string;
  requestAuth?: string;
  model: string;
}): {
  base_url?: string;
  api_key?: string;
  model: string;
} {
  const endpoint: {
    base_url?: string;
    api_key?: string;
    model: string;
  } = {
    model: modelConfig.model
  };

  if (modelConfig.requestUrl) {
    endpoint.base_url = modelConfig.requestUrl;
  }

  if (modelConfig.requestAuth) {
    endpoint.api_key = modelConfig.requestAuth;
  }

  return endpoint;
}

/**
 * Convert training stage enum value to i18n stage key
 * Example: generate_trainset -> train:stage_generate_trainset
 *
 * @param stage - Stage value (string)
 * @returns i18n key with 'train:stage_' prefix
 */
export function getTrainStageKey(stage: string): string {
  return `train:stage_${stage}`;
}

/**
 * Format training task error message
 *
 * Formats error message into a unified, instructive string format
 *
 * @param error - Enhanced error message object
 * @returns Formatted error message string
 */
export function formatTrainTaskError(error: GenericEnhancedErrorMessage<string, string>): string {
  const parts: string[] = [];

  // Add stage information
  if (error.stage) {
    parts.push(`[Stage: ${error.stage}]`);
  }

  // Add error type
  parts.push(`[Type: ${error.type}]`);

  // Add detailed error message
  parts.push(error.message);

  // Add resolution suggestion
  if (error.suggestion) {
    parts.push(`Suggestion: ${error.suggestion}`);
  }

  return parts.join(' ');
}

/**
 * Factory for creating module-specific enhanced error creators
 *
 * Callers inject their own i18n key generation functions to produce
 * module-specific enhanced error objects.
 *
 * @param config - Module-specific i18n key generation functions
 * @returns A createEnhancedError function bound to the module's key generators
 *
 * @example
 * // In rerank/utils.ts:
 * import { makeCreateEnhancedError } from '../../common/utils';
 * import {
 *   getRerankTrainErrorMessageKey,
 *   getRerankTrainErrorSuggestionKey
 * } from '@fastgpt/global/common/error/code/train';
 *
 * export const createEnhancedError = makeCreateEnhancedError<
 *   RerankTaskCheckpointStageEnum,
 *   RerankTrainErrEnum,
 *   RerankTrainSuggestionEnum
 * >({
 *   getMessageKey: getRerankTrainErrorMessageKey,
 *   getSuggestionKey: getRerankTrainErrorSuggestionKey
 * });
 */
export function makeCreateEnhancedError<
  TStage extends string,
  TErr extends string,
  TSuggestion extends string = string
>(config: {
  getMessageKey: (type: TErr) => string;
  getSuggestionKey: (suggestion: TSuggestion) => string;
}) {
  return function createEnhancedError(
    stage: TStage | null,
    type: TErr,
    suggestion?: TSuggestion,
    originalError?: string
  ): GenericEnhancedErrorMessage<string, TErr> {
    return {
      stage: stage ? getTrainStageKey(stage) : null,
      type,
      message: config.getMessageKey(type),
      suggestion: suggestion ? config.getSuggestionKey(suggestion) : undefined,
      originalError
    };
  };
}

/**
 * Format synthesis indexes to pairs for DiTing API
 *
 * Extracts synthesis-type indexes and pairs them by synId into 2-element arrays.
 * Each data chunk contains 10 synthesis indexes paired into 5 groups.
 *
 * @param indexes - Raw index array (all types)
 * @returns 2D array where each pair contains two texts from the same synId
 */
export function formatSynthesisIndexesToPairs(indexes: DatasetDataIndexItemType[]): string[][] {
  if (!indexes || !Array.isArray(indexes) || indexes.length === 0) {
    return [];
  }

  const synthesisIndexes = indexes.filter(
    (idx) => idx.type === DatasetDataIndexTypeEnum.synthesis && idx.synId !== undefined
  );

  const groupedBySynId = new Map<number, string[]>();
  for (const idx of synthesisIndexes) {
    const synId = idx.synId!;
    if (!groupedBySynId.has(synId)) {
      groupedBySynId.set(synId, []);
    }
    groupedBySynId.get(synId)!.push(idx.text);
  }

  const pairs: string[][] = [];
  const sortedSynIds = Array.from(groupedBySynId.keys()).sort((a, b) => a - b);
  for (const synId of sortedSynIds) {
    const texts = groupedBySynId.get(synId)!;
    if (texts.length === 2) {
      pairs.push([texts[0], texts[1]]);
    } else {
      addLog.warn('Unexpected synthesis index count for synId', {
        synId,
        count: texts.length
      });
      if (texts.length > 0) {
        pairs.push(texts.slice(0, 2));
      }
    }
  }

  return pairs;
}
