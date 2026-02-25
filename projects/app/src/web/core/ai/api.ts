import { GET, POST, PUT, DELETE } from '@/web/common/api/request';
import type { CreateQuestionGuideParams } from '@/pages/api/core/ai/agent/v2/createQuestionGuide';
import type { LLMRequestRecordSchemaType } from '@fastgpt/global/openapi/core/ai/api';

export const postQuestionGuide = (data: CreateQuestionGuideParams, cancelToken: AbortController) =>
  POST<string[]>('/core/ai/agent/v2/createQuestionGuide', data, { cancelToken });

export const getLLMRequestRecordAPI = (requestId: string) =>
  GET<LLMRequestRecordSchemaType>(`/core/ai/record/getRecord?requestId=${requestId}`);
