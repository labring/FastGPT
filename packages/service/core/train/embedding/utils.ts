import type { EmbeddingTaskCheckpointStageEnum } from '@fastgpt/global/core/train/embedding/constants';
import type {
  EmbeddingTrainErrEnum,
  EmbeddingTrainSuggestionEnum
} from '@fastgpt/global/common/error/code/train';
import {
  getEmbeddingTrainErrorMessageKey,
  getEmbeddingTrainErrorSuggestionKey
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

/**
 * Create enhanced error message for embedding training tasks
 *
 * All i18n keys are automatically generated through conversion functions:
 * - stage: getTrainStageKey(stage) -> 'train:stage_xxx'
 * - message: getEmbeddingTrainErrorMessageKey(type) -> 'embedding_train:xxx'
 * - suggestion: getEmbeddingTrainErrorSuggestionKey(suggestion) -> 'embedding_train:xxx_suggestion'
 *
 * @param stage - Current training stage (can be null for general errors)
 * @param type - Error type enum
 * @param suggestion - Optional suggestion enum
 * @param originalError - Optional original error message for debugging
 * @returns Enhanced error message object
 */
export const createEmbeddingEnhancedError = makeCreateEnhancedError<
  EmbeddingTaskCheckpointStageEnum,
  EmbeddingTrainErrEnum,
  EmbeddingTrainSuggestionEnum
>({
  getMessageKey: getEmbeddingTrainErrorMessageKey,
  getSuggestionKey: getEmbeddingTrainErrorSuggestionKey
});
