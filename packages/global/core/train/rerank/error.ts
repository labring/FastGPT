import type { RerankTaskCheckpointStageEnum } from './constants';
import type { RerankTrainErrEnum } from '../../../common/error/code/train';

/**
 * Enhanced error message for training tasks
 *
 * Contains structured error information including stage, error code, message and original error.
 * This format allows frontend to display rich error information with i18n support.
 */
export interface EnhancedErrorMessage {
  /** Error stage (which stage the error occurred in) */
  stage: `${RerankTaskCheckpointStageEnum}` | null;
  /** Error code (unified error identifier with i18n support) */
  type: `${RerankTrainErrEnum}` | string;
  /** Detailed error message (localized from i18n) */
  message: string;
  /** Resolution suggestion (can be added to i18n for localization) */
  suggestion?: string;
  /** Original error message (for debugging) */
  originalError?: string;
}
