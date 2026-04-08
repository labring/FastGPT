import {
  synthesizeEmbeddingTrainDatas as synthesizeEmbeddingTrainDatasReal,
  synthesizeEmbeddingEvalData as synthesizeEmbeddingEvalDataReal,
  evaluateEmbeddingModel as evaluateEmbeddingModelReal
} from './diting/client';
import {
  synthesizeEmbeddingTrainDatas as synthesizeEmbeddingTrainDatasMock,
  synthesizeEmbeddingEvalData as synthesizeEmbeddingEvalDataMock,
  evaluateEmbeddingModel as evaluateEmbeddingModelMock
} from './diting/mock';

// Use mock or real implementation based on environment
const USE_MOCK = process.env.EMBEDDING_DITING_MOCK === 'true';

export const synthesizeEmbeddingTrainDatas = USE_MOCK
  ? synthesizeEmbeddingTrainDatasMock
  : synthesizeEmbeddingTrainDatasReal;

export const synthesizeEmbeddingEvalData = USE_MOCK
  ? synthesizeEmbeddingEvalDataMock
  : synthesizeEmbeddingEvalDataReal;

export const evaluateEmbeddingModel = USE_MOCK
  ? evaluateEmbeddingModelMock
  : evaluateEmbeddingModelReal;

export type {
  DiTingSyntheticEmbeddingTrainDatasRequest,
  DiTingSyntheticEmbeddingTrainDatasResponse,
  DiTingSyntheticEmbeddingTrainDataItem,
  DiTingSyntheticEmbeddingEvalDataRequest,
  DiTingSyntheticEmbeddingEvalDataResponse,
  DiTingEvaluateEmbeddingRequest,
  DiTingEvaluateEmbeddingResponse
} from './diting/types';
