import { UnrecoverableError } from 'bullmq';
import type { GenericEnhancedErrorMessage } from '@fastgpt/global/core/train/common/error';
import { formatTrainTaskError } from './utils';

/**
 * Unrecoverable training task error that prevents BullMQ auto-retry
 *
 * Used for permanent errors that cannot be fixed by retrying:
 * - Data not found (DATA_EMPTY, DATA_INVALID, DATA_FILE_NOT_FOUND)
 * - Invalid configuration (MODEL_NOT_FOUND, MODEL_CONFIG_INVALID)
 * - System errors (INTERNAL_ERROR, DATABASE_ERROR, FILE_SYSTEM_ERROR)
 * - User cancellation (CANCELLED)
 *
 * These errors will cause the task to fail immediately without retrying.
 */
export class TrainTaskUnrecoverableError extends UnrecoverableError {
  /** Structured error information */
  enhancedError: GenericEnhancedErrorMessage<string, string>;

  constructor(enhancedError: GenericEnhancedErrorMessage<string, string>) {
    // Call parent constructor with formatted string message (for logging)
    super(formatTrainTaskError(enhancedError));
    this.name = 'TrainTaskUnrecoverableError';
    this.enhancedError = enhancedError;
  }
}

/**
 * Retryable training task error that allows BullMQ auto-retry
 *
 * Used for temporary errors that might succeed on retry:
 * - Network errors (SERVICE_UNAVAILABLE, SERVICE_TIMEOUT, SERVICE_API_ERROR)
 * - Timeout errors (TIMEOUT)
 * - Temporary failures (MODEL_TRAINING_FAILED, MODEL_DEPLOYMENT_FAILED, EVAL_FAILED)
 *
 * These errors will be automatically retried by BullMQ (up to 3 times by default).
 */
export class TrainTaskRetriableError extends Error {
  /** Structured error information */
  enhancedError: GenericEnhancedErrorMessage<string, string>;

  constructor(enhancedError: GenericEnhancedErrorMessage<string, string>) {
    // Call parent constructor with formatted string message (for logging)
    super(formatTrainTaskError(enhancedError));
    this.name = 'TrainTaskRetriableError';
    this.enhancedError = enhancedError;
  }
}

/**
 * Trainset generation unrecoverable error
 *
 * Used for permanent errors that require user action:
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
  enhancedError: GenericEnhancedErrorMessage<string, string>;

  constructor(enhancedError: GenericEnhancedErrorMessage<string, string>) {
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
  enhancedError: GenericEnhancedErrorMessage<string, string>;

  constructor(enhancedError: GenericEnhancedErrorMessage<string, string>) {
    // Call parent constructor with formatted string message (for logging)
    super(formatTrainTaskError(enhancedError));
    this.name = 'TrainsetGenerationRetriableError';
    this.enhancedError = enhancedError;
  }
}
