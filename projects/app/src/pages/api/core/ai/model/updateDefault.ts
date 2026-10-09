import type { ApiRequestProps } from '@fastgpt/next/type';
import { NextAPI } from '@/service/middleware/entry';
import { authModelScopeOperation } from '@fastgpt/service/support/permission/model/auth';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { updateSystemDefaultModels } from '@fastgpt/service/core/ai/model/default/service';
import {
  UpdateDefaultModelsBodySchema,
  type UpdateDefaultModelsBody
} from '@fastgpt/global/openapi/core/ai/model/api';

async function handler(req: ApiRequestProps<UpdateDefaultModelsBody>): Promise<void> {
  await authModelScopeOperation({ req, channelType: 'system' });
  const defaults = parseApiInput({ req, bodySchema: UpdateDefaultModelsBodySchema }).body;
  return updateSystemDefaultModels({
    llm: defaults.llm,
    embedding: defaults.embedding,
    tts: defaults.tts,
    stt: defaults.stt,
    rerank: defaults.rerank,
    datasetTextLLM: defaults.datasetTextLLMModelId,
    datasetImageLLM: defaults.datasetImageLLMModelId,
    chatTitleLLM: defaults.chatTitleLLMModelId
  });
}

export default NextAPI(handler);
