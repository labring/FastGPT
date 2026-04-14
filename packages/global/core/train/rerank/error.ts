/**
 * Module-specific type alias with rerank-specific type parameters.
 */
import type { GenericEnhancedErrorMessage } from '../common/error';
import type { RerankTaskCheckpointStageEnum } from './constants';
import type { RerankTrainErrEnum } from '../../../common/error/code/train';

/** Enhanced error message for rerank training tasks */
export type EnhancedErrorMessage = GenericEnhancedErrorMessage<
  `${RerankTaskCheckpointStageEnum}` | string,
  `${RerankTrainErrEnum}` | string
>;
