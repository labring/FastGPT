/**
 * External services unified entry point for rerank training module
 *
 * Selects between mock implementation or real service based on environment variables:
 * - USE_DITING_MOCK=true: Use mock DiTing implementation
 * - USE_DITING_MOCK=false or not set: Use real DiTing service (default, requires DITING_BASE_URL configuration)
 * - USE_SFT_BRIDGE_MOCK=true: Use mock SFT Bridge implementation
 * - USE_SFT_BRIDGE_MOCK=false or not set: Use real SFT Bridge service (default)
 */

import {
  mockSynthesizeRerankTrainDatas,
  mockSynthesizeRerankEvalData,
  mockEvaluateRerankModel
} from './diting/mock';
import {
  synthesizeRerankTrainDatas as synthesizeRerankTrainDatasReal,
  synthesizeRerankEvalData as synthesizeRerankEvalDataReal,
  evaluateRerankModel as evaluateRerankModelReal
} from './diting/client';

const useDiTingMock = process.env.USE_DITING_MOCK === 'true';

export const synthesizeRerankTrainDatas = useDiTingMock
  ? mockSynthesizeRerankTrainDatas
  : synthesizeRerankTrainDatasReal;

export const synthesizeRerankEvalData = useDiTingMock
  ? mockSynthesizeRerankEvalData
  : synthesizeRerankEvalDataReal;

export const evaluateRerankModel = useDiTingMock
  ? mockEvaluateRerankModel
  : evaluateRerankModelReal;

export type {
  DiTingSyntheticRerankTrainDatasRequest,
  DiTingSyntheticRerankTrainDatasResponse,
  DiTingSyntheticRerankEvalDataRequest,
  DiTingSyntheticRerankEvalDataResponse,
  DiTingEvaluateRerankRequest,
  DiTingEvaluateRerankResponse
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
