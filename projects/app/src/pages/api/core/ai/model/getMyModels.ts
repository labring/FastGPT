import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import { getMyModels } from '@fastgpt/service/support/permission/model/controller';
import { getVersionKey } from '@fastgpt/service/common/cache';
import { SystemCacheKeyEnum } from '@fastgpt/service/common/cache/type';

export type GetMyModelsQuery = {
  versionKey: string;
};
export type GetMyModelsBody = {};
export type GetMyModelsResponse =
  | {
      models: string[];
      isRefreshed: true;
      versionKey: string;
    }
  | {
      isRefreshed: false;
    };

async function handler(
  req: ApiRequestProps<GetMyModelsBody, GetMyModelsQuery>,
  res: ApiResponseType<any>
): Promise<GetMyModelsResponse> {
  const { teamId, tmbId, isRoot, tmb } = await authUserPer({
    req,
    authToken: true,
    per: ReadPermissionVal
  });

  const { versionKey } = req.query;

  const versionKeyInRedis = await getVersionKey(SystemCacheKeyEnum.modelPermission, teamId);
  // No change
  if (versionKeyInRedis === versionKey) {
    return {
      isRefreshed: false
    };
  }

  // changed, get the new model list
  const models = await getMyModels({
    teamId,
    tmbId,
    isTeamOwner: tmb.role === 'owner' || isRoot
  });

  return {
    isRefreshed: true,
    models,
    versionKey: versionKeyInRedis
  };
}
export default NextAPI(handler);
