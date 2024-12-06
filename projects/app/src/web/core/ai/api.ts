import { GET, POST, PUT, DELETE } from '@/web/common/api/request';
import type { CreateQuestionGuideParams } from '@/pages/api/core/ai/agent/v2/createQuestionGuide';

export const postQuestionGuide = (data: CreateQuestionGuideParams, cancelToken: AbortController) =>
  POST<string[]>('/core/ai/agent/v2/createQuestionGuide', data, { cancelToken });
