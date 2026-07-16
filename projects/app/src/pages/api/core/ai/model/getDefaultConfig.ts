import type { ApiRequestProps, ApiResponseType } from '@fastgpt/next/type';
import { NextAPI } from '@/service/middleware/entry';
import { authSystemAdmin } from '@fastgpt/service/support/permission/user/auth';
import { getSystemModelConfig } from '@fastgpt/service/core/ai/config/utils';
import { type SystemModelItemType } from '@fastgpt/service/core/ai/type';

export type getDefaultQuery = { model: string };

export type getDefaultBody = Record<string, never>;

async function handler(
  req: ApiRequestProps<getDefaultBody, getDefaultQuery>,
  _res: ApiResponseType<any>
): Promise<SystemModelItemType> {
  await authSystemAdmin({ req });

  const model = req.query.model;

  return getSystemModelConfig(model);
}

export default NextAPI(handler);
