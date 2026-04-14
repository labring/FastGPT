import { synthesizeEvalData as synthesizeEvalDataReal } from './client';
import { mockSynthesizeEvalData } from './mock';

const USE_MOCK = process.env.USE_DITING_MOCK === 'true';

export const synthesizeEvalData = USE_MOCK ? mockSynthesizeEvalData : synthesizeEvalDataReal;

export type { DiTingSyntheticEvalDataRequest, DiTingSyntheticEvalDataResponse } from './types';
