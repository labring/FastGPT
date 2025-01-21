import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { ModelProviderIdType } from '@fastgpt/global/core/ai/provider';
import { registerSystemModels } from '@fastgpt/service/core/ai/config/utils';
import { ModelTypeEnum } from '@fastgpt/global/core/ai/model';
import { findAIModel } from '@fastgpt/service/core/ai/model';

export type listQuery = {};

export type listBody = {};

export type listResponse = {
  type: `${ModelTypeEnum}`;
  name: string;
  avatar: string | undefined;
  provider: ModelProviderIdType;
  model: string;
  charsPointsPrice?: number;
  inputPrice?: number;
  outputPrice?: number;
  active: boolean;
}[];

async function handler(
  req: ApiRequestProps<listBody, listQuery>,
  res: ApiResponseType<any>
): Promise<listResponse> {
  await registerSystemModels();

  // Read db
  return global.systemModelList.map((model) => ({
    type: model.type,
    provider: model.provider,
    model: model.model,
    name: model.name,
    avatar: model.avatar,
    charsPointsPrice: model.charsPointsPrice,
    inputPrice: model.inputPrice,
    outputPrice: model.outputPrice,
    active: !!findAIModel(model.model)
  }));
}

export default NextAPI(handler);
