import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { authSystemAdmin } from '@fastgpt/service/support/permission/user/auth';
import { MongoSystemModel } from '@fastgpt/service/core/ai/config/schema';
import type { SystemModelConfigJsonItem } from './updateWithJson';

export type getConfigJsonQuery = {};

export type getConfigJsonBody = {};

export type getConfigJsonResponse = string;

async function handler(
  req: ApiRequestProps<getConfigJsonBody, getConfigJsonQuery>,
  res: ApiResponseType<any>
): Promise<getConfigJsonResponse> {
  await authSystemAdmin({ req });
  const data = await MongoSystemModel.find({}).lean();

  return JSON.stringify(
    data.map<SystemModelConfigJsonItem>((item) => ({
      ...(item._id ? { id: String(item._id) } : {}),
      model: item.model,
      metadata: item.metadata,
      isShared: item.isShared ?? false,
      ...(item.tmbId ? { tmbId: String(item.tmbId) } : {}),
      ...(item.teamId ? { teamId: String(item.teamId) } : {})
    })),
    null,
    2
  );
}

export default NextAPI(handler);
