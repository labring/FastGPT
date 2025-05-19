import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { SystemModelItemType } from '@fastgpt/service/core/ai/type';
import { authSystemAdmin } from '@fastgpt/service/support/permission/user/auth';
import { findModelFromAlldata } from '@fastgpt/service/core/ai/model';

export type detailQuery = {
  model: string;
};

export type detailBody = {};

export type detailResponse = SystemModelItemType;

async function handler(
  req: ApiRequestProps<detailBody, detailQuery>,
  res: ApiResponseType<any>
): Promise<detailResponse> {
  await authSystemAdmin({ req });

  const { model } = req.query;
  const modelItem = findModelFromAlldata(model);
  if (!modelItem) {
    return Promise.reject('Model not found');
  }
  return modelItem;
}

export default NextAPI(handler);
