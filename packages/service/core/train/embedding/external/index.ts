import { synthesizeEvalData } from '../../common/external/diting';

const USE_MOCK = process.env.USE_DITING_MOCK === 'true';

// Re-export with embedding-specific name for backward compatibility
export const synthesizeEmbeddingEvalData = synthesizeEvalData;

export type {
  DiTingSyntheticEvalDataRequest as DiTingSyntheticEmbeddingEvalDataRequest,
  DiTingSyntheticEvalDataResponse as DiTingSyntheticEmbeddingEvalDataResponse
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
