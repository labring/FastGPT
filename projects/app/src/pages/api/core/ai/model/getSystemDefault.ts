import { NextAPI } from '@/service/middleware/entry';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import {
  GetSystemDefaultModelResponseSchema,
  type GetSystemDefaultModelResponse
} from '@fastgpt/global/openapi/core/ai/model/api';
import type { ApiRequestProps } from '@fastgpt/next/type';
import type { SystemDefaultModelType } from '@fastgpt/service/core/ai/model/type';
import { ModelTypeEnum } from '@fastgpt/global/core/ai/constants';

async function handler(
  _req: ApiRequestProps<Record<string, never>, Record<string, never>>
): Promise<GetSystemDefaultModelResponse> {
  await authUserPer({ req: _req, authToken: true, per: ReadPermissionVal });

  const defaults = global.systemDefaultModel;

  const mapField = (key: keyof SystemDefaultModelType) => {
    const m = defaults[key];
    return m ? { id: m.id, model: m.model, name: m.name } : null;
  };

  return GetSystemDefaultModelResponseSchema.parse({
    llm: mapField(ModelTypeEnum.llm as keyof SystemDefaultModelType),
    embedding: mapField(ModelTypeEnum.embedding as keyof SystemDefaultModelType),
    tts: mapField(ModelTypeEnum.tts as keyof SystemDefaultModelType),
    stt: mapField(ModelTypeEnum.stt as keyof SystemDefaultModelType),
    rerank: mapField(ModelTypeEnum.rerank as keyof SystemDefaultModelType),
    datasetTextLLM: mapField('datasetTextLLM'),
    datasetImageLLM: mapField('datasetImageLLM'),
    chatTitleLLM: mapField('chatTitleLLM'),
    helperBotLLM: mapField('helperBotLLM')
  });
}

export default NextAPI(handler);
