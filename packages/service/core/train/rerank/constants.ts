/** Rerank training module constants */

import * as path from 'path';
import { trainEnv } from '../common/env';

// ===== Training Data File Storage =====
/**
 * Get rerank training data file directory
 * Priority: TRAIN_DATA_DIR env > {cwd}/data/train/rerank (default)
 *
 * @returns Full path to rerank training data directory
 */
export function getRerankTrainDataDir(): string {
  const baseDir = trainEnv.TRAIN_DATA_DIR || path.join(process.cwd(), 'data', 'train');
  return path.join(baseDir, 'rerank');
}
