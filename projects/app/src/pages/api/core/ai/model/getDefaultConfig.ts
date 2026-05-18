import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { authSystemAdmin } from '@fastgpt/service/support/permission/user/auth';
import { getSystemModelConfig } from '@fastgpt/service/core/ai/config/utils';
import { type SystemModelItemType } from '@fastgpt/service/core/ai/type';

export type getDefaultQuery = { modelId: string };

export type getDefaultBody = {};

async function handler(
  req: ApiRequestProps<getDefaultBody, getDefaultQuery>,
  res: ApiResponseType<any>
): Promise<SystemModelItemType> {
  await authSystemAdmin({ req });

  const modelId = req.query.modelId;

  return getSystemModelConfig(modelId);
}

export default NextAPI(handler);
