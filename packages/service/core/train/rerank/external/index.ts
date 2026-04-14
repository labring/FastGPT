/**
 * External services unified entry point for rerank training module
 */

import { synthesizeEvalData } from '../../common/external/diting';

// Re-export with rerank-specific name for backward compatibility
export const synthesizeRerankEvalData = synthesizeEvalData;

export type {
  DiTingSyntheticEvalDataRequest as DiTingSyntheticRerankEvalDataRequest,
  DiTingSyntheticEvalDataResponse as DiTingSyntheticRerankEvalDataResponse
} from '../../common/external/diting';

// SFT Bridge - re-export from common package
export {
  createSFTTask,
  querySFTTaskStatus,
  deleteSFTTask,
  SFTTaskStatus
} from '../../common/external/sftbridge';

export type {
  CreateSFTTaskRequest,
  CreateSFTTaskResponse,
  QuerySFTTaskStatusRequest,
  QuerySFTTaskStatusResponse,
  DeleteSFTTaskRequest,
  DeleteSFTTaskResponse
} from '../../common/external/sftbridge';
