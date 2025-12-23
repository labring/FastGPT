/**
 * External services unified entry point for training module
 *
 * Selects between mock implementation or real service based on environment variables:
 * - USE_DITING_MOCK=true: Use mock implementation (default)
 * - USE_DITING_MOCK=false: Use real DiTing service (requires DITING_BASE_URL configuration)
 * - USE_AICP_MOCK=true: Use mock implementation (default)
 * - USE_AICP_MOCK=false: Use real AICP service
 */

import {
  mockSynthesizeRerankTrainDatas,
  mockSynthesizeRerankEvalData,
  mockEvaluateRerankModel
} from './diting/mock';
import {
  synthesizeRerankTrainDatas,
  synthesizeRerankEvalData,
  evaluateRerankModel
} from './diting/client';

const useDiTingMock = process.env.USE_DITING_MOCK !== 'false';

export const syntheticRerankTrainDatas = useDiTingMock
  ? mockSynthesizeRerankTrainDatas
  : synthesizeRerankTrainDatas;

export const syntheticRerankEvalData = useDiTingMock
  ? mockSynthesizeRerankEvalData
  : synthesizeRerankEvalData;

export const evaluateRerank = useDiTingMock ? mockEvaluateRerankModel : evaluateRerankModel;

export type {
  DiTingSyntheticRerankTrainDatasRequest,
  DiTingSyntheticRerankTrainDatasResponse,
  DiTingSyntheticRerankEvalDataRequest,
  DiTingSyntheticRerankEvalDataResponse,
  DiTingEvaluateRerankRequest,
  DiTingEvaluateRerankResponse
} from './diting/types';

import { mockCreateAicpOptimizationTask, mockQueryAicpTaskStatus } from './aicp/mock';
import {
  createAicpOptimizationTask as realCreateAicpOptimizationTask,
  queryAicpTaskStatus as realQueryAicpTaskStatus
} from './aicp/client';

const useAicpMock = process.env.USE_AICP_MOCK !== 'false';

export const createAicpOptimizationTask = useAicpMock
  ? mockCreateAicpOptimizationTask
  : realCreateAicpOptimizationTask;

export const queryAicpTaskStatus = useAicpMock ? mockQueryAicpTaskStatus : realQueryAicpTaskStatus;

export type {
  CreateAicpOptimizationTaskRequest,
  CreateAicpOptimizationTaskResponse,
  QueryAicpTaskStatusRequest,
  QueryAicpTaskStatusResponse
} from './aicp/types';

export { AicpTaskStatus } from './aicp/types';
