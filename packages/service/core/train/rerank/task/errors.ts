import { UnrecoverableError } from 'bullmq';
import type { EnhancedErrorMessage } from '@fastgpt/global/core/train/rerank/error';
import { formatTrainTaskError } from '../utils';

/**
 * Unrecoverable training task error that prevents BullMQ auto-retry
 *
 * Used for permanent errors that cannot be fixed by retrying:
 * - Data not found (DATA_EMPTY, DATA_INVALID, DATA_FILE_NOT_FOUND)
 * - Invalid configuration (MODEL_NOT_FOUND, MODEL_CONFIG_INVALID)
 * - Application update failures (APP_UPDATE_FAILED, EVAL_DATASET_EMPTY)
 * - System errors (INTERNAL_ERROR, DATABASE_ERROR, FILE_SYSTEM_ERROR)
 * - User cancellation (CANCELLED)
 *
 * These errors will cause the task to fail immediately without retrying.
 */
export class TrainTaskUnrecoverableError extends UnrecoverableError {
  /** Structured error information */
  enhancedError: EnhancedErrorMessage;

  constructor(enhancedError: EnhancedErrorMessage) {
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
  enhancedError: EnhancedErrorMessage;

  constructor(enhancedError: EnhancedErrorMessage) {
    // Call parent constructor with formatted string message (for logging)
    super(formatTrainTaskError(enhancedError));
    this.name = 'TrainTaskRetriableError';
    this.enhancedError = enhancedError;
  }
}
