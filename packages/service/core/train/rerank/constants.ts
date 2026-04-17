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

// Re-export common constants for backward compatibility
export {
  TRAIN_DATA_SPLIT_RATIO,
  DEFAULT_MAX_SAMPLE_PAIRS,
  MIN_EVAL_QA_COUNT,
  DEFAULT_DITING_TIMEOUT,
  DEFAULT_DITING_CONCURRENCY,
  MAX_DITING_CONCURRENCY,
  DEFAULT_SFT_BRIDGE_TIMEOUT,
  DEFAULT_SFT_BRIDGE_POLL_INTERVAL,
  DEFAULT_SFT_BRIDGE_MAX_POLLS,
  DEFAULT_SFT_BRIDGE_LEARNING_RATE,
  DEFAULT_SEARCH_SIMILARITY,
  DEFAULT_EVAL_CONCURRENCY,
  DEFAULT_SEARCH_LIMIT,
  MAX_SEARCH_RUN_TIMES,
  DEFAULT_WORKER_STALLED_INTERVAL,
  DEFAULT_JOB_BACKOFF_DELAY,
  DEFAULT_TRAIN_TASK_CONCURRENCY,
  DEFAULT_TRAIN_DATA_GENERATE_CONCURRENCY,
  DEFAULT_WORKER_MAX_STALLED_COUNT,
  CHANNEL_CREATE_TIMEOUT,
  CHANNEL_AVAILABILITY_POLL_INTERVAL,
  CHANNEL_AVAILABILITY_MAX_DURATION
} from '../common/constants';
