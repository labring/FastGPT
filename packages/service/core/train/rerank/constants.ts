/** Rerank training module constants */

import * as path from 'path';

// ===== Training Data File Storage =====
/**
 * Get rerank training data file directory
 * Priority: TRAIN_DATA_DIR env > {cwd}/data/train/rerank (default)
 *
 * @returns Full path to rerank training data directory
 */
export function getRerankTrainDataDir(): string {
  const baseDir = process.env.TRAIN_DATA_DIR || path.join(process.cwd(), 'data', 'train');
  return path.join(baseDir, 'rerank');
}

// ===== Data Sampling =====
/** Default train/evaluation data split ratio (80% for training, 20% for evaluation) */
export const TRAIN_DATA_SPLIT_RATIO = 0.8;

// ===== DiTing Service Configuration =====
/** DiTing API default timeout (milliseconds) */
export const DEFAULT_DITING_TIMEOUT = 1800000; // 30 minutes
/** DiTing API default concurrency */
export const DEFAULT_DITING_CONCURRENCY = 10;
/** DiTing API maximum concurrency */
export const MAX_DITING_CONCURRENCY = 50;

// ===== SFT Bridge Service Configuration =====
/** SFT Bridge API default timeout (milliseconds) */
export const DEFAULT_SFT_BRIDGE_TIMEOUT = 300000; // 5 minutes
/** SFT Bridge task polling default interval (milliseconds) */
export const DEFAULT_SFT_BRIDGE_POLL_INTERVAL = 60000; // 1 minute
/** SFT Bridge task polling maximum attempts */
export const DEFAULT_SFT_BRIDGE_MAX_POLLS = 600; // ~10 hours total
/** SFT Bridge task default learning rate */
export const DEFAULT_SFT_BRIDGE_LEARNING_RATE = 0.0001;

// ===== Dataset Search Configuration =====
/** Dataset search default similarity threshold */
export const DEFAULT_SEARCH_SIMILARITY = 0.4;
/** Dataset search default limit */
export const DEFAULT_SEARCH_LIMIT = 5000;
/** Dataset search maximum run times */
export const MAX_SEARCH_RUN_TIMES = 50;

// ===== BullMQ Worker Configuration =====
/** Worker default stalled interval (milliseconds) */
export const DEFAULT_WORKER_STALLED_INTERVAL = 30000; // 30 seconds
/** Job failure retry backoff delay (milliseconds) */
export const DEFAULT_JOB_BACKOFF_DELAY = 5000; // 5 seconds
/** Training task worker default concurrency */
export const DEFAULT_TRAIN_TASK_CONCURRENCY = 1; // Limit to 1 to avoid resource contention
/** Training data generation worker default concurrency */
export const DEFAULT_TRAIN_DATA_GENERATE_CONCURRENCY = 2;
/** Worker default max stalled count */
export const DEFAULT_WORKER_MAX_STALLED_COUNT = 3;

// ===== Channel Creation Configuration =====
/** Channel creation request timeout (milliseconds) */
export const CHANNEL_CREATE_TIMEOUT = 30000; // 30 seconds
