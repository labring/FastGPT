/**
 * Module-specific type alias with embedding-specific type parameters.
 */
import type { GenericEnhancedErrorMessage } from '../common/error';
import type { EmbeddingTaskCheckpointStageEnum } from './constants';
import type { EmbeddingTrainErrEnum } from '../../../common/error/code/train';

/** Enhanced error message for embedding training tasks */
export type EnhancedErrorMessage = GenericEnhancedErrorMessage<
  `${EmbeddingTaskCheckpointStageEnum}` | string,
  `${EmbeddingTrainErrEnum}` | string
>;
