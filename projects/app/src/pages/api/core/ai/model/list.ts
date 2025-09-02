import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import type { ModelTypeEnum } from '@fastgpt/global/core/ai/model';
import { authSystemAdmin } from '@fastgpt/service/support/permission/user/auth';

export type listQuery = {};

export type listBody = {};

export type listResponse = {
  type: `${ModelTypeEnum}`;
  name: string;
  avatar: string | undefined;
  provider: string;
  model: string;
  charsPointsPrice?: number;
  inputPrice?: number;
  outputPrice?: number;

  isActive: boolean;
  isCustom: boolean;

  // Tag
  contextToken?: number;
  vision?: boolean;
  toolChoice?: boolean;
}[];

async function handler(
  req: ApiRequestProps<listBody, listQuery>,
  res: ApiResponseType<any>
): Promise<listResponse> {
  await authSystemAdmin({ req });

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
    isActive: model.isActive ?? false,
    isCustom: model.isCustom ?? false,

    // Tag
    contextToken:
      'maxContext' in model ? model.maxContext : 'maxToken' in model ? model.maxToken : undefined,
    vision: 'vision' in model ? model.vision : undefined,
    toolChoice: 'toolChoice' in model ? model.toolChoice : undefined
  }));
}

export default NextAPI(handler);
