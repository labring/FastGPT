/**
 * Generic enhanced error message for training tasks
 *
 * Contains structured error information including stage, error code, message and original error.
 * This format allows frontend to display rich error information with i18n support.
 *
 * @template TStage - Stage enum string literal type (e.g. `${EmbeddingTaskCheckpointStageEnum}`)
 * @template TErr   - Error enum string literal type (e.g. `${EmbeddingTrainErrEnum}`)
 */
export type GenericEnhancedErrorMessage<
  TStage extends string = string,
  TErr extends string = string
> = {
  /** Error stage (which stage the error occurred in) */
  stage: TStage | null;
  /** Error code (unified error identifier with i18n support) */
  type: TErr | string;
  /** Detailed error message (localized from i18n) */
  message: string;
  /** Resolution suggestion (can be added to i18n for localization) */
  suggestion?: string;
  /** Original error message (for debugging) */
  originalError?: string;
};
