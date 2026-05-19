import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { type SystemModelItemType } from '@fastgpt/service/core/ai/type';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import { authModel } from '@fastgpt/service/support/permission/model/auth';

export type detailQuery = {
  id: string;
};

export type detailBody = {};

export type detailResponse = SystemModelItemType;

async function handler(
  req: ApiRequestProps<detailBody, detailQuery>,
  res: ApiResponseType<any>
): Promise<detailResponse> {
  const { id } = req.query;
  const { model: modelItem } = await authModel({
    req,
    authToken: true,
    authApiKey: true,
    modelId: id,
    per: ReadPermissionVal
  });

  return modelItem;
}

export default NextAPI(handler);
