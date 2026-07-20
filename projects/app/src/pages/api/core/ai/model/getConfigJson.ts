import type { ApiRequestProps, ApiResponseType } from '@fastgpt/next/type';
import { NextAPI } from '@/service/middleware/entry';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import { ManagePermissionVal } from '@fastgpt/global/support/permission/constant';
import { ModelErrEnum } from '@fastgpt/global/common/error/code/model';
import { MongoSystemModel } from '@fastgpt/service/core/ai/model/schema';
import {
  GetConfigJsonResponseSchema,
  type GetConfigJsonResponse
} from '@fastgpt/global/openapi/core/ai/model/api';

async function handler(
  req: ApiRequestProps<Record<string, never>, Record<string, never>>,
  _res: ApiResponseType<any>
): Promise<GetConfigJsonResponse> {
  const { isRoot } = await authUserPer({
    req,
    authToken: true,
    per: ManagePermissionVal
  });

  if (!isRoot) {
    return Promise.reject(ModelErrEnum.rootOnlyPermit);
  }

  const data = await MongoSystemModel.find({ isSystem: true }).lean();

  // Export flat model objects with `id` mapped from `_id` so the JSON can be
  // re-imported via updateWithJson (which uses `id` to update existing models).
  return GetConfigJsonResponseSchema.parse(
    JSON.stringify(
      data.map((item: Record<string, any>) => {
        const { _id, __v, ...rest } = item;
        return { id: String(_id), ...rest };
      }),
      null,
      2
    )
  );
}

export default NextAPI(handler);
