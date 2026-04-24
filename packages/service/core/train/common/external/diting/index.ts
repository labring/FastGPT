import { synthesizeEvalData as synthesizeEvalDataReal } from './client';
import { mockSynthesizeEvalData } from './mock';

import { trainEnv } from '../../env';

export const synthesizeEvalData = trainEnv.DITING_MOCK_ENABLE
  ? mockSynthesizeEvalData
  : synthesizeEvalDataReal;

export type { DiTingSyntheticEvalDataRequest, DiTingSyntheticEvalDataResponse } from './types';
