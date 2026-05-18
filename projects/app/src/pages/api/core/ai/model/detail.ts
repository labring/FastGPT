import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { type SystemModelItemType } from '@fastgpt/service/core/ai/type';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import { getModelById } from '@fastgpt/service/core/ai/model';
import { getMyModels } from '@fastgpt/service/support/permission/model/controller';

export type detailQuery = {
  id: string;
};

export type detailBody = {};

export type detailResponse = SystemModelItemType;

async function handler(
  req: ApiRequestProps<detailBody, detailQuery>,
  res: ApiResponseType<any>
): Promise<detailResponse> {
  const { tmbId, teamId, isRoot, permission: teamPer } = await authUserPer({
    req,
    authToken: true,
    per: ReadPermissionVal
  });

  const { id } = req.query;
  const modelItem = getModelById(id);
  if (!modelItem) {
    return Promise.reject('Model not found');
  }

  if (!isRoot) {
    const allowedIds = await getMyModels({ teamId, tmbId, teamPer, isRoot: false });
    if (!allowedIds.includes(id)) {
      return Promise.reject('No permission to access this model');
    }
  }

  return modelItem;
}

export default NextAPI(handler);
