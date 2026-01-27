import type { EnhancedErrorMessage } from '@fastgpt/global/core/train/rerank/error';
import { formatTrainTaskError } from '../utils';

/**
 * Trainset generation unrecoverable error
 *
 * Used for permanent errors that require user action:
 * - Application deleted (trainsetGenAppDeleted)
 * - No dataset configured (trainsetGenNoDataset)
 * - Dataset empty (trainsetGenDatasetEmpty)
 * - Already generating (trainsetGenAlreadyGenerating)
 * - Trainset not found (trainsetGenNotFound)
 * - User cancelled (trainsetGenCancelled)
 *
 * Note: This extends Error (NOT BullMQ.UnrecoverableError) because trainset
 * generation errors are handled by the data generation worker, which has
 * different retry logic than training tasks.
 */
export class TrainsetGenerationUnrecoverableError extends Error {
  /** Structured error information */
  enhancedError: EnhancedErrorMessage;

  constructor(enhancedError: EnhancedErrorMessage) {
    // Call parent constructor with formatted string message (for logging)
    super(formatTrainTaskError(enhancedError));
    this.name = 'TrainsetGenerationUnrecoverableError';
    this.enhancedError = enhancedError;
  }
}

/**
 * Trainset generation retriable error
 *
 * Used for temporary errors that might succeed on retry:
 * - DiTing service failures (trainsetGenDitingFailed)
 * - DiTing returned no data (trainsetGenDitingNoData)
 * - Database errors (trainsetGenDatabaseError)
 *
 * These errors will be automatically retried by BullMQ worker.
 */
export class TrainsetGenerationRetriableError extends Error {
  /** Structured error information */
  enhancedError: EnhancedErrorMessage;

  constructor(enhancedError: EnhancedErrorMessage) {
    // Call parent constructor with formatted string message (for logging)
    super(formatTrainTaskError(enhancedError));
    this.name = 'TrainsetGenerationRetriableError';
    this.enhancedError = enhancedError;
  }
}
