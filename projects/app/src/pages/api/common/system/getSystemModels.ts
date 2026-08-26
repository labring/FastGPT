import { NextAPI } from '@/service/middleware/entry';
import {
  GetSystemModelsResponseSchema,
  type GetSystemModelsResponse
} from '@fastgpt/global/openapi/common/system/api';

/** 价格页公开模型接口，只通过响应 Schema 白名单返回最小字段。 */
async function handler(): Promise<GetSystemModelsResponse> {
  return GetSystemModelsResponseSchema.parse(
    [...global.systemModelMap.entries()]
      .filter(([key, model]) => key.startsWith('id:') && model.isActive)
      .map(([, model]) => model)
  );
}

export default NextAPI(handler);
