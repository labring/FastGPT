import { addLog } from '../../../common/system/log';
import { MongoDatasetData } from '../../dataset/data/schema';
import { Types } from 'mongoose';
import type { GenericEnhancedErrorMessage } from '@fastgpt/global/core/train/common/error';
import { trainEnv } from './env';
import type { DatasetDataIndexTypeEnum } from '@fastgpt/global/core/dataset/data/constants';

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

// ─────────────────────────────────────────────────────────────────────────────
// Chunk quality filter (ported from filter_chunks.py)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Quality filter configuration for sampleDataFromDataset.
 * Corresponds to ChunkFilter constructor parameters in filter_chunks.py.
 */
export type ChunkFilterConfig = {
  minLength?: number; // 默认 50
  maxLength?: number; // 默认 3000
  minWords?: number; // 默认 10
  maxRepetitionRatio?: number; // 默认 0.5
  minQualityScore?: number; // 默认 0.65
  enableTocFilter?: boolean; // 默认 true
  enablePaginationFilter?: boolean; // 默认 true
  enableMetadataFilter?: boolean; // 默认 true
};

const DEFAULT_FILTER_CONFIG: Required<ChunkFilterConfig> = {
  minLength: 50,
  maxLength: 3000,
  minWords: 10,
  maxRepetitionRatio: 0.5,
  minQualityScore: 0.65,
  enableTocFilter: true,
  enablePaginationFilter: true,
  enableMetadataFilter: true
};

/** 对应 Python pipeline 的 clean_text() */
export function cleanText(text: string): string {
  if (!text) return '';
  // HTML entity decode (&amp; &nbsp; etc.)
  let t = text.replace(/&[a-zA-Z]+;/g, ' ').replace(/&#\d+;/g, ' ');
  // Remove HTML tags
  t = t.replace(/<[^>]+>/g, ' ');
  // Normalize whitespace: multi spaces/tabs → single space, 3+ newlines → 2 newlines
  t = t.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n');
  // Trim each line
  t = t
    .split('\n')
    .map((l) => l.trim())
    .join('\n');
  return t.trim();
}

function isChineseDominant(text: string): boolean {
  const chinese = (text.match(/[\u4e00-\u9fff]/g) || []).length;
  return chinese > text.length * 0.3;
}

function calcRepetitionRatio(text: string): number {
  if (text.length === 0) return 0;
  const freq = new Map<string, number>();
  for (const ch of text) {
    if (ch !== ' ' && ch !== '\t' && ch !== '\n' && ch !== '\r') {
      freq.set(ch, (freq.get(ch) ?? 0) + 1);
    }
  }
  if (freq.size === 0) return 0;
  const maxCount = Math.max(...freq.values());
  return maxCount / text.length;
}

function calcSpecialCharRatio(text: string): number {
  if (text.length === 0) return 0;
  const special = (
    text.match(/[^\w\s\u4e00-\u9fff，。！？、；：""''（）《》\[\].,!?;:()\'"<>-]/g) || []
  ).length;
  return special / text.length;
}

const TOC_PATTERNS = [
  /^\s*目\s*录\s*$/m,
  /^\s*Table\s+of\s+Contents\s*$/im,
  /^\s*CONTENTS\s*$/m,
  /(?:第[一二三四五六七八九十\d]+章|Chapter\s+\d+).*?\.{3,}\s*\d+/,
  /^\s*\d+\.\d+.*?\.{3,}\s*\d+/m,
  /^\s*[一二三四五六七八九十]\s*[、.]\s*.{1,30}\s*\.{3,}\s*\d+/m
];

function isToc(text: string): boolean {
  for (const re of TOC_PATTERNS) {
    if (re.test(text)) return true;
  }
  return (text.match(/\.{3,}/g) || []).length >= 3;
}

const PAGINATION_PATTERNS = [
  /^\s*[-–—]\s*\d+\s*[-–—]\s*$/m,
  /^\s*第\s*\d+\s*页\s*$/m,
  /^\s*Page\s+\d+\s*$/im,
  /^\s*\d+\s*\/\s*\d+\s*$/m
];

function isPagination(text: string): boolean {
  return PAGINATION_PATTERNS.some((re) => re.test(text));
}

const METADATA_PATTERNS = [
  /^(?:公司|企业|机构|部门)?内部资料\s*[，,]?\s*(?:注意保密|严禁外传)?\s*$/m,
  /^保密(?:等级|级别)[:：]\s*(?:一般|秘密|机密|绝密)\s*$/m,
  /^(?:打印|编制|审核|批准)(?:时间|日期|人)[:：]/m,
  /^\s*(?:版本|Version)[:：]\s*[\d.]+\s*$/m
];

function isMetadata(text: string): boolean {
  return METADATA_PATTERNS.some((re) => re.test(text));
}

function calcQualityScore(text: string): number {
  const total = text.length;
  if (total === 0) return 0;

  // Char entropy
  const freq = new Map<string, number>();
  for (const ch of text) freq.set(ch, (freq.get(ch) ?? 0) + 1);
  let charEntropy = 0;
  for (const cnt of freq.values()) {
    const p = cnt / total;
    charEntropy -= p * Math.log2(p);
  }

  // Root TTR (word diversity)
  const words = isChineseDominant(text) ? text.split('') : text.match(/\b\w+\b/gi) || [];
  const totalWords = words.length;
  const uniqueWords = new Set(words.map((w) => w.toLowerCase())).size;
  const rootTtr = totalWords > 0 ? uniqueWords / Math.sqrt(totalWords) : 0;

  // Anti-noise metrics
  const zhPunct = '，。！？；：、""\'\'（）《》【】「」…—·';
  const allPunct = new Set('!"#$%&\'()*+,-./:;<=>?@[\\]^_`{|}~' + zhPunct);
  let punctCount = 0;
  let digitCount = 0;
  for (const ch of text) {
    if (allPunct.has(ch)) punctCount++;
    if (ch >= '0' && ch <= '9') digitCount++;
  }
  const punctRatio = punctCount / total;
  const digitRatio = digitCount / total;
  const hasDotPattern = /\.{3,}/.test(text) ? 1 : 0;
  const hasNumberPrefix = /^\s*\d+[\.)]\s+/.test(text) ? 1 : 0;

  // Normalized scores
  const normEntropy = Math.min(Math.max((charEntropy - 2.0) / 3.0, 0), 1);
  const normDiversity = Math.min(rootTtr / 10.0, 1);
  const noisePenalty =
    punctRatio * 1.5 + digitRatio * 2.0 + hasDotPattern * 0.8 + hasNumberPrefix * 0.7;
  const normAntiNoise = Math.max(0, 1 - noisePenalty);
  const normLength = Math.min(total / 200, 1);

  return 0.25 * normEntropy + 0.25 * normDiversity + 0.35 * normAntiNoise + 0.15 * normLength;
}

/** Check if a doc passes all quality filters (Step 0a). Returns false if should be discarded. */
function isValidChunk(q: string, config: Required<ChunkFilterConfig>): boolean {
  if (!q.trim()) return false;
  if (q.length < config.minLength) return false;
  if (q.length > config.maxLength) return false;

  const wordCount = isChineseDominant(q) ? q.length : (q.match(/\S+/g) || []).length;
  if (wordCount < config.minWords) return false;

  if (calcRepetitionRatio(q) > config.maxRepetitionRatio) return false;
  if (config.enableTocFilter && isToc(q)) return false;
  if (config.enablePaginationFilter && isPagination(q)) return false;
  if (config.enableMetadataFilter && isMetadata(q)) return false;
  if (calcSpecialCharRatio(q) > 0.5) return false;
  if (calcQualityScore(q) < config.minQualityScore) return false;

  return true;
}

// ─────────────────────────────────────────────────────────────────────────────
// Dataset item types
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Lightweight sampling result from sampleDataFromDataset.
 * Contains only ID fields — content is fetched on-demand by downstream consumers.
 */
export type SampledDataItem = {
  dataId: string;
  datasetId: string;
  collectionId: string;
};

// ─────────────────────────────────────────────────────────────────────────────
// Internal helpers
// ─────────────────────────────────────────────────────────────────────────────

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
 * Two-pass quota allocation.
 * Returns how many items to take from each KB (in the same order as datasetIds).
 *
 * When sampleSize is undefined: take all available (kbCounts[i]) from each KB.
 * When sampleSize=M: proportional allocation with remainder redistribution.
 */
function computeQuotas(
  kbCounts: number[],
  sampleSize: number | undefined,
  weights: Record<string, number> | undefined,
  datasetIds: string[]
): number[] {
  if (sampleSize === undefined) {
    return [...kbCounts];
  }

  const n = kbCounts.length;
  const M = sampleSize;

  const rawWeights = datasetIds.map((id) => weights?.[id] ?? 1);
  const sumW = rawWeights.reduce((s, w) => s + w, 0);
  const wNorm = rawWeights.map((w) => (sumW > 0 ? w / sumW : 1 / n));

  // Round 1: proportional allocation
  const samples = kbCounts.map((kc, i) => Math.min(kc, Math.floor(M * wNorm[i])));
  let remaining = M - samples.reduce((s, v) => s + v, 0);

  // Round 2: redistribute remainder to unsatisfied KBs by remaining capacity
  if (remaining > 0) {
    const unsatisfied = kbCounts
      .map((kc, i) => ({ i, avail: kc - samples[i] }))
      .filter(({ avail }) => avail > 0);
    const totalCap = unsatisfied.reduce((s, { avail }) => s + avail, 0);

    if (totalCap > 0) {
      for (const { i, avail } of unsatisfied) {
        const extra = Math.round((remaining * avail) / totalCap);
        samples[i] += Math.min(extra, avail);
      }
    }

    // Boundary correction: if rounding caused overshoot, reduce from largest
    let total = samples.reduce((s, v) => s + v, 0);
    for (let iter = 0; total > M && iter < n * 2; iter++) {
      const maxIdx = samples.reduce((mi, v, i) => (v > samples[mi] ? i : mi), 0);
      if (samples[maxIdx] > 0) {
        samples[maxIdx]--;
        total--;
      }
    }
  }

  return samples;
}

/**
 * Apply quality filter to raw MongoDB docs, returning lightweight SampledDataItem[].
 * Only q is used for quality checks; content (a, indexes) is NOT loaded.
 */
function filterToSampledItems(
  rawDocs: any[],
  config: Required<ChunkFilterConfig>
): SampledDataItem[] {
  const result: SampledDataItem[] = [];

  for (const doc of rawDocs) {
    const rawQ: string = doc.q ?? '';

    if (!rawQ.trim()) continue;

    const cleanedQ = cleanText(rawQ.trim());

    if (cleanedQ.length < 10) continue;

    if (!isValidChunk(cleanedQ, config)) continue;

    result.push({
      dataId: doc._id.toString(),
      datasetId: doc.datasetId.toString(),
      collectionId: doc.collectionId?.toString() ?? ''
    });
  }

  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// Main sampling function
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Sample dataset chunks for training or evaluation.
 *
 * Step 0: Quality filter + cleanText (full migration from filter_chunks.py).
 * Step 1: Compute kb_count[i] from valid data count.
 * Step 2: Two-pass quota allocation (when sampleSize specified).
 * Step 3: Take data by mode (train=front 80%, eval=back 20%, random=shuffled).
 *
 * @param datasetIds - Dataset ID list
 * @param options.datasetType - Sampling mode, default 'train':
 *   - 'train': deterministic shuffle, take first 80% of valid docs
 *   - 'eval':  deterministic shuffle, take last 20% of valid docs
 *   - 'random': random shuffle, take ALL valid docs (no train/eval split)
 * @param options.sampleSize - Total sample budget M for quota allocation.
 *   Optional for all modes; when omitted, takes all available docs per KB.
 *   Required when weights are specified.
 * @param options.weights - Per-KB sampling weights (requires sampleSize)
 * @param options.filterConfig - Quality filter configuration
 */
export async function sampleDataFromDataset(
  datasetIds: string[],
  options: {
    datasetType?: 'train' | 'eval' | 'random';
    sampleSize?: number;
    weights?: Record<string, number>;
    filterConfig?: ChunkFilterConfig;
  } = {}
): Promise<SampledDataItem[]> {
  const { sampleSize, datasetType = 'train', weights, filterConfig } = options;
  const config = { ...DEFAULT_FILTER_CONFIG, ...filterConfig };

  if (weights && !sampleSize) {
    throw new Error('sampleSize is required when weights are specified');
  }

  // Only fetch _id, q, datasetId, collectionId — drop a and indexes.
  // check 11 (indexes not empty) is pushed to the DB query via 'indexes.0': { $exists: true }.
  const selectFields = '_id q datasetId collectionId';

  // Step 0 + 1: Quality filter + compute kb_count per KB
  const kbValidDocs: SampledDataItem[][] = [];
  const kbCounts: number[] = [];

  for (const datasetId of datasetIds) {
    const match = {
      datasetId: new Types.ObjectId(datasetId),
      'indexes.0': { $exists: true }
    };

    addLog.info('Sampling data from dataset', { datasetId, datasetType, sampleSize });

    const rawDocs = await MongoDatasetData.find(match).select(selectFields).lean();

    const validDocs = filterToSampledItems(rawDocs, config);
    const totalValid = validDocs.length;

    addLog.info('Quality filter result', {
      datasetId,
      rawCount: rawDocs.length,
      validCount: totalValid
    });

    if (totalValid === 0) {
      addLog.warn('No valid data found in dataset after quality filter', { datasetId });
      kbValidDocs.push([]);
      kbCounts.push(0);
      continue;
    }

    // Deterministic shuffle for train/eval (same permutation ensures disjoint sets)
    if (datasetType !== 'random') {
      const rng = seededRandom(hashString(datasetId));
      for (let i = totalValid - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [validDocs[i], validDocs[j]] = [validDocs[j], validDocs[i]];
      }
    } else {
      // random mode: shuffle with Math.random()
      for (let i = totalValid - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [validDocs[i], validDocs[j]] = [validDocs[j], validDocs[i]];
      }
    }

    // Step 1: kb_count[i]
    const trainCount = Math.floor(totalValid * trainEnv.TRAIN_DATA_SPLIT_RATIO);
    let kbCount: number;
    if (datasetType === 'eval') {
      kbCount = totalValid - trainCount;
    } else if (datasetType === 'random') {
      kbCount = totalValid;
    } else {
      kbCount = trainCount;
    }

    kbValidDocs.push(validDocs);
    kbCounts.push(kbCount);
  }

  // Step 2: Quota allocation
  const samplesPerKb = computeQuotas(kbCounts, sampleSize, weights, datasetIds);

  // Step 3: Take data according to quota
  const allSamples: SampledDataItem[] = [];

  for (let i = 0; i < datasetIds.length; i++) {
    const validDocs = kbValidDocs[i];
    const quota = samplesPerKb[i];
    if (quota === 0 || validDocs.length === 0) continue;

    const totalValid = validDocs.length;
    const trainCount = Math.floor(totalValid * trainEnv.TRAIN_DATA_SPLIT_RATIO);

    let selected: SampledDataItem[];
    if (datasetType === 'eval') {
      selected = validDocs.slice(trainCount, trainCount + quota);
    } else {
      selected = validDocs.slice(0, quota);
    }

    addLog.info('Dataset quota allocated', {
      datasetId: datasetIds[i],
      datasetType,
      totalValid,
      quota,
      selected: selected.length
    });

    allSamples.push(...selected);
  }

  addLog.info('Final sampling result', {
    totalDatasets: datasetIds.length,
    datasetType,
    totalSamples: allSamples.length
  });

  return allSamples;
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared utility functions (unchanged)
// ─────────────────────────────────────────────────────────────────────────────

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

/** sampled data item enriched with q/a content */
export type SampledDataWithContent = SampledDataItem & { q: string; a: string };

/**
 * Fetch q/a content for sampled items from MongoDB.
 *
 * Items whose document cannot be found in the DB (e.g. deleted after sampling)
 * are silently dropped. The caller is responsible for handling a shorter-than-
 * expected result list (typically by checking against MIN_EVAL_QA_COUNT).
 *
 * @param items - Sampled data items to enrich
 * @returns Items with q/a content, missing documents omitted
 */
export async function fetchSampledContent(
  items: SampledDataItem[]
): Promise<SampledDataWithContent[]> {
  if (items.length === 0) return [];
  const ids = items.map((i) => new Types.ObjectId(i.dataId));
  const docs = await MongoDatasetData.find({ _id: { $in: ids } })
    .select('_id q a')
    .lean();
  const docMap = new Map(docs.map((d: any) => [d._id.toString(), d]));
  const result = items
    .filter((item) => docMap.has(item.dataId))
    .map((item) => ({
      ...item,
      q: (docMap.get(item.dataId) as any).q ?? '',
      a: (docMap.get(item.dataId) as any).a ?? ''
    }));
  if (result.length < items.length) {
    const missingIds = items.filter((item) => !docMap.has(item.dataId)).map((item) => item.dataId);
    addLog.warn('Some sampled documents not found in DB, skipping', {
      requested: items.length,
      found: result.length,
      missingIds
    });
  }
  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// Dataset validation helpers (shared between embedding and rerank)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Check if a dataset has at least one document with the target index type.
 * Returns the index type if missing, null if found.
 */
export async function findMissingIndexType(
  datasetId: string,
  indexType: `${DatasetDataIndexTypeEnum}`
): Promise<`${DatasetDataIndexTypeEnum}` | null> {
  const count = await MongoDatasetData.countDocuments({
    datasetId,
    'indexes.type': indexType
  });
  return count === 0 ? indexType : null;
}

/**
 * Count total valid chunks across datasets.
 * "Valid" means the document has at least one index (indexes.0 exists).
 */
export async function countValidChunksForDatasets(datasetIds: string[]): Promise<number> {
  let total = 0;
  for (const datasetId of datasetIds) {
    const count = await MongoDatasetData.countDocuments({
      datasetId,
      'indexes.0': { $exists: true }
    });
    total += count;
  }
  return total;
}

/**
 * Configuration for validateDatasetReadiness error enums.
 */
export type DatasetReadinessErrorConfig = {
  noDatasetConfigured: string;
  datasetNoSynthesisIndex: string;
  insufficientChunks: string;
};

/**
 * Validate dataset readiness for training.
 *
 * Performs two checks:
 * 1. Each dataset must have at least one document with the target index type.
 * 2. Total valid chunks across all datasets must meet the minimum threshold.
 *
 * @param datasetIds - Dataset IDs to validate
 * @param indexType - Target index type to look for
 * @param errorEnums - Module-specific error enum values
 * @param options.minChunkThreshold - Minimum chunk count (default: trainEnv.TRAIN_MIN_TASK_CHUNK_THRESHOLD)
 * @throws Rejects with appropriate error enum value on validation failure
 */
export async function validateDatasetReadiness(
  datasetIds: string[],
  indexType: `${DatasetDataIndexTypeEnum}`,
  errorEnums: DatasetReadinessErrorConfig,
  options?: { minChunkThreshold?: number }
): Promise<void> {
  if (datasetIds.length === 0) {
    return Promise.reject(errorEnums.noDatasetConfigured);
  }

  const minChunkThreshold = options?.minChunkThreshold ?? trainEnv.TRAIN_MIN_TASK_CHUNK_THRESHOLD;

  addLog.info('Validating dataset readiness', {
    datasetCount: datasetIds.length,
    datasetIds,
    indexType,
    minChunkThreshold
  });

  // Check 1: index type availability
  const validationResults = await Promise.all(
    datasetIds.map(async (datasetId) => ({
      datasetId,
      missing: await findMissingIndexType(datasetId, indexType)
    }))
  );

  const invalidDatasets = validationResults.filter((r) => r.missing !== null);
  if (invalidDatasets.length > 0) {
    addLog.error('Dataset target index validation failed', {
      totalDatasets: datasetIds.length,
      invalidDatasets: invalidDatasets.length,
      invalidDatasetDetails: invalidDatasets.map((d) => ({
        datasetId: d.datasetId,
        missingType: d.missing
      })),
      indexType
    });
    return Promise.reject(errorEnums.datasetNoSynthesisIndex);
  }

  // Check 2: total chunk count threshold
  const totalChunks = await countValidChunksForDatasets(datasetIds);
  if (totalChunks < minChunkThreshold) {
    addLog.warn('Dataset readiness check failed: insufficient chunks', {
      datasetIds,
      totalChunks,
      threshold: minChunkThreshold
    });
    return Promise.reject(errorEnums.insufficientChunks);
  }

  addLog.info('Dataset readiness validation successful', {
    validatedDatasets: datasetIds.length,
    indexType,
    totalChunks
  });
}
