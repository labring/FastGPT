export {
  pLimit,
  extractModelFromApp,
  extractDatasetIdsFromApp,
  extractDatasetSearchParamsFromApp,
  sampleDataFromDataset,
  buildModelEndpoint,
  getTrainStageKey,
  formatTrainTaskError
} from '../rerank/utils';

import {
  getTrainErrorMessageKey,
  getTrainErrorSuggestionKey
} from '@fastgpt/global/common/error/code/train';
import type { EnhancedErrorMessage } from '@fastgpt/global/core/train/rerank/error';
import type {
  EmbeddingTrainErrEnum,
  EmbeddingTrainSuggestionEnum
} from '@fastgpt/global/common/error/code/train';
import type { EmbeddingTaskCheckpointStageEnum } from '@fastgpt/global/core/train/embedding/constants';

/**
 * Create enhanced error message for embedding training tasks
 *
 * All i18n keys are automatically generated through conversion functions:
 * - stage: getTrainStageKey(stage) -> 'train:stage_xxx'
 * - message: getTrainErrorMessageKey(type) -> 'train:xxx'
 * - suggestion: getTrainErrorSuggestionKey(suggestion) -> 'train:xxx_suggestion'
 *
 * @param stage - Current training stage (can be null for general errors)
 * @param type - Error type enum
 * @param suggestion - Optional suggestion enum
 * @param originalError - Optional original error message for debugging
 * @returns Enhanced error message object
 */
export function createEmbeddingEnhancedError(
  stage: EmbeddingTaskCheckpointStageEnum | null,
  type: EmbeddingTrainErrEnum,
  suggestion?: EmbeddingTrainSuggestionEnum,
  originalError?: string
): EnhancedErrorMessage {
  return {
    stage: stage ? (`train:stage_${stage}` as any) : null,
    type,
    message: getTrainErrorMessageKey(type as any),
    suggestion: suggestion ? (getTrainErrorSuggestionKey(suggestion as any) as any) : undefined,
    originalError
  };
}
