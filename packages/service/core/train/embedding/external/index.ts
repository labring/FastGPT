import {
  synthesizeEmbeddingTrainDatas as synthesizeEmbeddingTrainDatasReal,
  synthesizeEmbeddingEvalData as synthesizeEmbeddingEvalDataReal,
  evaluateEmbeddingModel as evaluateEmbeddingModelReal
} from './diting/client';
import {
  mockSynthesizeEmbeddingTrainDatas,
  mockSynthesizeEmbeddingEvalData,
  mockEvaluateEmbeddingModel
} from './diting/mock';

// Use mock or real implementation based on environment (unified USE_DITING_MOCK variable)
const USE_MOCK = process.env.USE_DITING_MOCK === 'true';

export const synthesizeEmbeddingTrainDatas = USE_MOCK
  ? mockSynthesizeEmbeddingTrainDatas
  : synthesizeEmbeddingTrainDatasReal;

export const synthesizeEmbeddingEvalData = USE_MOCK
  ? mockSynthesizeEmbeddingEvalData
  : synthesizeEmbeddingEvalDataReal;

export const evaluateEmbeddingModel = USE_MOCK
  ? mockEvaluateEmbeddingModel
  : evaluateEmbeddingModelReal;

export type {
  DiTingSyntheticEmbeddingTrainDatasRequest,
  DiTingSyntheticEmbeddingTrainDatasResponse,
  DiTingSyntheticEmbeddingEvalDataRequest,
  DiTingSyntheticEmbeddingEvalDataResponse,
  DiTingEvaluateEmbeddingRequest,
  DiTingEvaluateEmbeddingResponse
} from './diting/types';

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
