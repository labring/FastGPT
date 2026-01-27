import type { AppSchema } from '@fastgpt/global/core/app/type';
import type { StoreNodeItemType } from '@fastgpt/global/core/workflow/type/node';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import type { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { addLog } from '../../../common/system/log';
import { MongoDatasetData } from '../../dataset/data/schema';
import { Types } from 'mongoose';
import { DatasetDataIndexTypeEnum } from '@fastgpt/global/core/dataset/data/constants';
import type { DatasetDataIndexItemType } from '@fastgpt/global/core/dataset/type';
import {
  DEFAULT_SEARCH_SIMILARITY,
  DEFAULT_SEARCH_LIMIT,
  TRAIN_DATA_SPLIT_RATIO,
  DEFAULT_MAX_SAMPLE_PAIRS
} from './constants';
import { RerankTaskCheckpointStageEnum } from '@fastgpt/global/core/train/rerank/constants';
import type {
  EnhancedErrorMessage
} from '@fastgpt/global/core/train/rerank/error';
import type {
  RerankTrainErrEnum,
  RerankTrainSuggestionEnum} from '@fastgpt/global/common/error/code/train';
import {
  getTrainErrorMessageKey,
  getTrainErrorSuggestionKey
} from '@fastgpt/global/common/error/code/train';

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
 * Extract model configuration from app workflow
 *
 * Generic function supporting different model types (AI models, Rerank models, etc.).
 * Follows FastGPT workflow execution logic:
 * 1. Prioritize explicitly configured model in node
 * 2. Fall back to system default model if not configured
 *
 * @param app - App configuration
 * @param nodeType - Node type (e.g. FlowNodeTypeEnum.chatNode)
 * @param inputKey - Input key name (e.g. NodeInputKeyEnum.aiModel)
 * @param getDefaultModel - Function to get default model
 * @returns Model configuration ID
 */
export function extractModelFromApp(
  app: AppSchema,
  nodeType: `${FlowNodeTypeEnum}`,
  inputKey: `${NodeInputKeyEnum}`,
  getDefaultModel: () => { model: string } | undefined
): string {
  const targetNodes = app.modules?.filter((m) => m.flowNodeType === nodeType);

  for (const node of targetNodes || []) {
    const modelInput = node.inputs?.find((input) => input.key === inputKey);

    if (modelInput && modelInput.value) {
      const modelConfigId = String(modelInput.value);
      addLog.info(`Extracted model from app workflow (explicitly configured)`, {
        appId: String(app._id),
        nodeType,
        inputKey,
        modelConfigId
      });
      return modelConfigId;
    }
  }

  const defaultModel = getDefaultModel();

  if (!defaultModel) {
    throw new Error(
      `No default model available in system (appId: ${app._id}, nodeType: ${nodeType}, inputKey: ${inputKey})`
    );
  }

  addLog.info(`Using system default model (no explicit model configured in app workflow)`, {
    appId: String(app._id),
    nodeType,
    inputKey,
    modelConfigId: defaultModel.model
  });

  return defaultModel.model;
}

export interface DatasetSelectItem {
  datasetId: string;
  name: string;
  avatar: string;
  vectorModel?: {
    model: string;
    name: string;
  };
  datasetType?: string;
}

/** Extract dataset IDs from app configuration */
export function extractDatasetIdsFromApp(app: AppSchema): string[] {
  return app.modules
    .filter((m: StoreNodeItemType) => m.flowNodeType === FlowNodeTypeEnum.datasetSearchNode)
    .flatMap((m: StoreNodeItemType) => {
      const datasetInput = m.inputs?.find((input) => input.key === 'datasets');
      const datasets = datasetInput?.value as DatasetSelectItem[];

      if (Array.isArray(datasets)) {
        return datasets
          .filter((dataset) => dataset && typeof dataset.datasetId === 'string')
          .map((dataset) => dataset.datasetId);
      }
      return [];
    })
    .filter(Boolean);
}

/** Extract dataset search parameters from app configuration (excluding rerank) */
export function extractDatasetSearchParamsFromApp(app: AppSchema): {
  similarity: number;
  limit: number;
  searchMode: string;
  embeddingWeight?: number;
  collectionFilterMatch?: string;
  datasetSearchUsingExtensionQuery?: boolean;
  datasetSearchExtensionModel?: string;
  datasetSearchExtensionBg?: string;
} {
  const datasetSearchNode = app.modules?.find(
    (m: StoreNodeItemType) => m.flowNodeType === FlowNodeTypeEnum.datasetSearchNode
  );

  if (!datasetSearchNode) {
    return {
      similarity: DEFAULT_SEARCH_SIMILARITY,
      limit: DEFAULT_SEARCH_LIMIT,
      searchMode: 'embedding'
    };
  }

  const getInputValue = <T = unknown>(key: string, defaultValue: T): T => {
    const input = datasetSearchNode.inputs?.find((input) => input.key === key);
    return input?.value !== undefined ? (input.value as T) : defaultValue;
  };

  return {
    similarity: getInputValue('similarity', DEFAULT_SEARCH_SIMILARITY),
    limit: getInputValue('limit', DEFAULT_SEARCH_LIMIT),
    searchMode: getInputValue('searchMode', 'embedding'),
    embeddingWeight: getInputValue('embeddingWeight', undefined),
    collectionFilterMatch: getInputValue('collectionFilterMatch', undefined),
    datasetSearchUsingExtensionQuery: getInputValue('datasetSearchUsingExtensionQuery', undefined),
    datasetSearchExtensionModel: getInputValue('datasetSearchExtensionModel', undefined),
    datasetSearchExtensionBg: getInputValue('datasetSearchExtensionBg', undefined)
  };
}

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
): Promise<
  Array<{
    datasetId: string;
    dataId: string;
    q: string;
    a: string;
    indexes: DatasetDataIndexItemType[];
  }>
> {
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

  const allSamples: Array<{
    datasetId: string;
    dataId: string;
    q: string;
    a: string;
    indexes: DatasetDataIndexItemType[];
  }> = [];

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
    } else if (datasetType === 'eval') {
      const trainCount = Math.floor(totalCount * TRAIN_DATA_SPLIT_RATIO);
      const evalCount = totalCount - trainCount;

      addLog.info('Using eval dataset mode (last 20%)', {
        datasetId,
        totalCount,
        trainCount,
        evalCount
      });

      sampleData = await MongoDatasetData.aggregate([
        {
          $match: match
        },
        {
          $skip: trainCount
        },
        {
          $limit: evalCount
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
      const trainCount = Math.floor(totalCount * TRAIN_DATA_SPLIT_RATIO);

      addLog.info('Using train dataset mode (first 80%)', {
        datasetId,
        totalCount,
        trainCount
      });

      sampleData = await MongoDatasetData.aggregate([
        {
          $match: match
        },
        {
          $limit: trainCount
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
    }

    addLog.info('Dataset sampling result', {
      datasetId,
      datasetType,
      sampleCount: sampleData.length
    });

    const formattedData = sampleData
      .map((doc) => {
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
    allSamples.push(
      ...filtered.map(({ discardedCount, ...rest }) => rest)
    );
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
 * Stage name mapping (English)
 */
const STAGE_NAME_MAP: Record<RerankTaskCheckpointStageEnum, string> = {
  [RerankTaskCheckpointStageEnum.preparing]: 'Data Preparation',
  [RerankTaskCheckpointStageEnum.finetuning]: 'Model Finetuning',
  [RerankTaskCheckpointStageEnum.registering]: 'Model Registration',
  [RerankTaskCheckpointStageEnum.evaluating]: 'Model Evaluation',
  [RerankTaskCheckpointStageEnum.applying]: 'App Update'
};

/**
 * Format training task error message
 *
 * Formats error message into a unified, instructive string format
 *
 * @param error - Enhanced error message object
 * @returns Formatted error message string
 *
 * @example
 * const errorMsg = formatTrainTaskError({
 *   stage: RerankTaskCheckpointStageEnum.preparing,
 *   type: RerankTrainErrEnum.prepareDataEmpty,
 *   message: 'Training data is empty, cannot start training',
 *   suggestion: 'Please generate training data or manually add training samples first'
 * });
 * // Returns: "[Stage: Data Preparation] [Type: prepareDataEmpty] Training data is empty, cannot start training. Suggestion: Please generate training data or manually add training samples first"
 */
export function formatTrainTaskError(error: EnhancedErrorMessage): string {
  const parts: string[] = [];

  // Add stage information
  if (error.stage) {
    const stageName = STAGE_NAME_MAP[error.stage] || error.stage;
    parts.push(`[Stage: ${stageName}]`);
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
 * Convert RerankTaskCheckpointStageEnum to i18n stage key
 * Example: preparing -> train:stage_preparing
 *
 * @param stage - Stage enum value
 * @returns i18n key with 'train:stage_' prefix
 */
export function getTrainStageKey(stage: RerankTaskCheckpointStageEnum): string {
  return `train:stage_${stage}`;
}

/**
 * Create enhanced error message for rerank training tasks
 *
 * All i18n keys are automatically generated through conversion functions:
 * - stage: getTrainStageKey(stage) -> 'train:stage_xxx'
 * - message: getTrainErrorMessageKey(type) -> 'train:xxx'
 * - suggestion: getTrainErrorSuggestionKey(suggestion) -> 'train:xxx_suggestion'
 *
 * @param stage - Current training stage (can be null for general errors)
 * @param type - Error type enum
 * @param suggestion - Optional suggestion enum
 * @param originalError - Optional original error message for debugging
 * @returns Enhanced error message object
 *
 * @example
 * // Simple error without suggestion
 * const error = createEnhancedError(
 *   RerankTaskCheckpointStageEnum.preparing,
 *   RerankTrainErrEnum.prepareDataEmpty,
 *   RerankTrainSuggestionEnum.prepareDataEmpty
 * );
 *
 * @example
 * // Error with dynamic debugging info
 * const error = createEnhancedError(
 *   RerankTaskCheckpointStageEnum.evaluating,
 *   RerankTrainErrEnum.evalDatabaseSaveFailed,
 *   RerankTrainSuggestionEnum.evalDatabaseSaveFailed,
 *   errorMsg  // originalError for debugging
 * );
 */
export function createEnhancedError(
  stage: RerankTaskCheckpointStageEnum | null,
  type: RerankTrainErrEnum,
  suggestion?: RerankTrainSuggestionEnum,
  originalError?: string
): EnhancedErrorMessage {
  return {
    stage: stage ? (getTrainStageKey(stage) as any) : null,
    type,
    message: getTrainErrorMessageKey(type),
    suggestion: suggestion ? (getTrainErrorSuggestionKey(suggestion) as any) : undefined,
    originalError
  };
}
