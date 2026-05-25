import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { authSystemAdmin } from '@fastgpt/service/support/permission/user/auth';
import { MongoSystemModel } from '@fastgpt/service/core/ai/config/schema';
import {
  GetConfigJsonResponseSchema,
  type SystemModelConfigJsonItem
} from '@fastgpt/global/openapi/core/ai/model/api';

async function handler(req: ApiRequestProps<any, any>, res: ApiResponseType<any>): Promise<string> {
  await authSystemAdmin({ req });
  const data = await MongoSystemModel.find({}).lean();

  return GetConfigJsonResponseSchema.parse(
    JSON.stringify(
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
    )
  );
}

export default NextAPI(handler);
