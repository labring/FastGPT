/**
 * External services unified entry point for training module
 *
 * Selects between mock implementation or real service based on environment variables:
 * - USE_DITING_MOCK=true: Use mock implementation
 * - USE_DITING_MOCK=false or not set: Use real DiTing service (default, requires DITING_BASE_URL configuration)
 * - USE_SFT_BRIDGE_MOCK=true: Use mock implementation
 * - USE_SFT_BRIDGE_MOCK=false or not set: Use real SFT Bridge service (default)
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

const useDiTingMock = process.env.USE_DITING_MOCK === 'true';

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

import { mockCreateSFTTask, mockQuerySFTTaskStatus } from './sftbridge/mock';
import {
  createSFTTask as realCreateSFTTask,
  querySFTTaskStatus as realQuerySFTTaskStatus
} from './sftbridge/client';

const useSFTBridgeMock = process.env.USE_SFT_BRIDGE_MOCK === 'true';

export const createSFTTask = useSFTBridgeMock ? mockCreateSFTTask : realCreateSFTTask;

export const querySFTTaskStatus = useSFTBridgeMock
  ? mockQuerySFTTaskStatus
  : realQuerySFTTaskStatus;

export type {
  CreateSFTTaskRequest,
  CreateSFTTaskResponse,
  QuerySFTTaskStatusRequest,
  QuerySFTTaskStatusResponse
} from './sftbridge/types';

export { SFTTaskStatus } from './sftbridge/types';
