import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { authSystemAdmin } from '@fastgpt/service/support/permission/user/auth';
import { MongoSystemModel } from '@fastgpt/service/core/ai/config/schema';

export type getConfigJsonQuery = {};

export type getConfigJsonBody = {};

export type getConfigJsonResponse = {};

async function handler(
  req: ApiRequestProps<getConfigJsonBody, getConfigJsonQuery>,
  res: ApiResponseType<any>
): Promise<getConfigJsonResponse> {
  await authSystemAdmin({ req });
  const data = await MongoSystemModel.find({}).lean();

  return JSON.stringify(
    data.map((item) => ({
      model: item.model,
      metadata: item.metadata
    })),
    null,
    2
  );
}

export default NextAPI(handler);
