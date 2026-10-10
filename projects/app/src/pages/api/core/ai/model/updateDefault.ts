import { NextAPI } from '@/service/middleware/entry';
import { ModelErrEnum } from '@fastgpt/global/common/error/code/model';
import {
  UpdateDefaultModelsBodySchema,
  type UpdateDefaultModelsBody
} from '@fastgpt/global/openapi/core/ai/model/api';
import type { ApiRequestProps } from '@fastgpt/next/type';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { updateSystemDefaultModels } from '@fastgpt/service/core/ai/model/default/service';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';

async function handler(req: ApiRequestProps<UpdateDefaultModelsBody>): Promise<void> {
  const actor = await authUserPer({ req, authToken: true });
  if (!actor.isRoot) throw ModelErrEnum.rootOnlyPermit;
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
