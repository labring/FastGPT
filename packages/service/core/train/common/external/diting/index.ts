import {
  synthesizeEvalData as synthesizeEvalDataReal,
  callLLMJudge as callLLMJudgeReal
} from './client';
import { mockSynthesizeEvalData, mockCallLLMJudge } from './mock';

import { trainEnv } from '../../env';

export const synthesizeEvalData = trainEnv.DITING_MOCK_ENABLE
  ? mockSynthesizeEvalData
  : synthesizeEvalDataReal;

export const callLLMJudge = trainEnv.DITING_MOCK_ENABLE ? mockCallLLMJudge : callLLMJudgeReal;

export type {
  DiTingSyntheticEvalDataRequest,
  DiTingSyntheticEvalDataResponse,
  DiTingLLMJudgeRequest,
  DiTingLLMJudgeResponse
} from './types';
