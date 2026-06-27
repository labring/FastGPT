import { GET, POST, PUT, DELETE } from '@/web/common/api/request';
import type { CreateQuestionGuideV2BodyType } from '@fastgpt/global/openapi/core/ai/agent/api';
import type { LLMRequestRecordSchemaType } from '@fastgpt/global/openapi/core/ai/api';

export const postQuestionGuide = (
  data: CreateQuestionGuideV2BodyType,
  cancelToken: AbortController
) => POST<string[]>('/core/ai/agent/v2/createQuestionGuide', data, { cancelToken });

export const getLLMRequestRecordAPI = (requestId: string) =>
  GET<LLMRequestRecordSchemaType>(`/core/ai/record/getRecord?requestId=${requestId}`);
