/** Embedding training module constants */

import * as path from 'path';
import { trainEnv } from '../common/env';

// ===== Training Data File Storage =====
/**
 * Get embedding training data file directory
 * Priority: TRAIN_DATA_DIR env > {cwd}/data/train/embedding (default)
 *
 * @returns Full path to embedding training data directory
 */
export function getEmbeddingTrainDataDir(): string {
  const baseDir = trainEnv.TRAIN_DATA_DIR || path.join(process.cwd(), 'data', 'train');
  return path.join(baseDir, 'embedding');
}
