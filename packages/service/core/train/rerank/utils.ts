import { DEFAULT_SEARCH_SIMILARITY, DEFAULT_SEARCH_LIMIT } from './constants';
import type { RerankTaskCheckpointStageEnum } from '@fastgpt/global/core/train/rerank/constants';
import type {
  RerankTrainErrEnum,
  RerankTrainSuggestionEnum
} from '@fastgpt/global/common/error/code/train';
import {
  getRerankTrainErrorMessageKey,
  getRerankTrainErrorSuggestionKey
} from '@fastgpt/global/common/error/code/train';
import {
  pLimit,
  sampleDataFromDataset,
  fetchSampledContent,
  buildModelEndpoint,
  getTrainStageKey,
  formatTrainTaskError,
  makeCreateEnhancedError
} from '../common/utils';

// Re-export common utilities for backward compatibility
export {
  pLimit,
  sampleDataFromDataset,
  fetchSampledContent,
  buildModelEndpoint,
  getTrainStageKey,
  formatTrainTaskError
};

// Re-export constants used by rerank-specific callers
export { DEFAULT_SEARCH_SIMILARITY, DEFAULT_SEARCH_LIMIT };

/**
 * Create enhanced error message for rerank training tasks
 *
 * All i18n keys are automatically generated through conversion functions:
 * - stage: getTrainStageKey(stage) -> 'train:stage_xxx'
 * - message: getRerankTrainErrorMessageKey(type) -> 'rerank_train:xxx'
 * - suggestion: getRerankTrainErrorSuggestionKey(suggestion) -> 'rerank_train:xxx_suggestion'
 *
 * @param stage - Current training stage (can be null for general errors)
 * @param type - Error type enum
 * @param suggestion - Optional suggestion enum
 * @param originalError - Optional original error message for debugging
 * @returns Enhanced error message object
 *
 * @example
 * // Simple error without suggestion
 * const error = createRerankEnhancedError(
 *   RerankTaskCheckpointStageEnum.generate_trainset,
 *   RerankTrainErrEnum.rerankPrepareDataEmpty,
 *   RerankTrainSuggestionEnum.rerankPrepareDataEmpty
 * );
 *
 * @example
 * // Error with dynamic debugging info
 * const error = createRerankEnhancedError(
 *   RerankTaskCheckpointStageEnum.eval_tunedmodel,
 *   RerankTrainErrEnum.rerankEvalDatabaseSaveFailed,
 *   RerankTrainSuggestionEnum.rerankEvalDatabaseSaveFailed,
 *   errorMsg  // originalError for debugging
 * );
 */
export const createRerankEnhancedError = makeCreateEnhancedError<
  RerankTaskCheckpointStageEnum,
  RerankTrainErrEnum,
  RerankTrainSuggestionEnum
>({
  getMessageKey: getRerankTrainErrorMessageKey,
  getSuggestionKey: getRerankTrainErrorSuggestionKey
});
