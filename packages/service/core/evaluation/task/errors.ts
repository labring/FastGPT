import { UnrecoverableError } from 'bullmq';
import { addLog } from '../../../common/system/log';
import { TeamErrEnum } from '@fastgpt/global/common/error/code/team';
import { EvaluationErrEnum } from '@fastgpt/global/common/error/code/evaluation';
import { getErrText } from '@fastgpt/global/common/error/utils';

/**
 * Unrecoverable evaluation error that prevents BullMQ auto-retry
 */
export class EvaluationUnrecoverableError extends UnrecoverableError {
  constructor(
    message: string,
    public readonly stage: string
  ) {
    super(message);
    this.name = 'EvaluationUnrecoverableError';
  }
}

/**
 * Retryable evaluation error that allows BullMQ auto-retry
 */
export class EvaluationRetryableError extends Error {
  constructor(
    message: string,
    public readonly stage: string
  ) {
    super(message);
    this.name = 'EvaluationRetryableError';
  }
}

/**
 * Error analysis result interface
 */
export interface ErrorAnalysisResult {
  isRetriable: boolean;
  category?: string;
  pattern?: string;
}

/**
 * Simplified error analysis function for retry logic
 */
export const analyzeError = (error: any): ErrorAnalysisResult => {
  const errorStr = error?.message || error?.code || String(error);
  const lowerErrorStr = errorStr.toLowerCase();

  // Check network-related errors
  const networkErrors = [
    'NETWORK_ERROR',
    'ECONNRESET',
    'ENOTFOUND',
    'ECONNREFUSED',
    'socket hang up',
    'timeout'
  ];
  if (networkErrors.some((pattern) => lowerErrorStr.includes(pattern.toLowerCase()))) {
    return { isRetriable: true, category: 'network' };
  }

  // Check HTTP status codes
  const httpStatusMatch = errorStr.match(/\b(4\d{2}|5\d{2})\b/);
  if (httpStatusMatch) {
    const statusCode = httpStatusMatch[1];
    // 429 (Too Many Requests) and 5xx errors are retryable
    if (statusCode === '429' || statusCode.startsWith('5')) {
      return {
        isRetriable: true,
        category: statusCode.startsWith('5') ? 'serverError' : 'rateLimit'
      };
    }
  }

  return { isRetriable: false };
};

/**
 * Evaluation error context interface
 */
export interface EvaluationErrorContext {
  evalId?: string;
  evalItemId?: string;
  resourceName?: string;
}

/**
 * Create appropriate BullMQ error type for auto-retry handling
 */
export const createEvaluationError = (
  error: any,
  stage: string,
  context?: EvaluationErrorContext
): Error => {
  const errorStr = error?.message || error?.code || String(error);
  const errorMessage = getErrText(error);

  // Build detailed error context
  const logContext = {
    stage,
    error: errorStr,
    originalError: error,
    ...context
  };

  // Unrecoverable error types
  if (
    error === TeamErrEnum.aiPointsNotEnough ||
    error === EvaluationErrEnum.evalItemNotFound ||
    error === EvaluationErrEnum.evalTaskNotFound ||
    error == EvaluationErrEnum.evalDatasetLoadFailed ||
    error == EvaluationErrEnum.evalEvaluatorsConfigInvalid ||
    error == EvaluationErrEnum.evalTargetConfigInvalid
  ) {
    addLog.error(`[Evaluation] Unrecoverable error in stage ${stage}`, logContext);
    return new EvaluationUnrecoverableError(errorMessage, stage);
  }

  // Use existing error analysis logic to determine retry capability
  const { isRetriable, category } = analyzeError(error);

  if (isRetriable) {
    addLog.warn(
      `[Evaluation] Retryable error in stage ${stage} (category: ${category})`,
      logContext
    );
    return new EvaluationRetryableError(errorMessage, stage);
  } else {
    addLog.error(`[Evaluation] Non-retryable error in stage ${stage}`, logContext);
    return new EvaluationUnrecoverableError(errorMessage, stage);
  }
};
