import { TeamPermission } from '@fastgpt/global/support/permission/user/controller';
import { AuthModeType, AuthResponseType } from '../type';
import { TeamErrEnum } from '@fastgpt/global/common/error/code/team';
import { authUserPer } from '../user/auth';
import { ManagePermissionVal } from '@fastgpt/global/support/permission/constant';

/* 
  Team manager can control org
*/
export const authOrgMember = async ({
  orgIds,
  ...props
}: {
  orgIds: string | string[];
} & AuthModeType): Promise<AuthResponseType> => {
  const result = await authUserPer({
    ...props,
    per: ManagePermissionVal
  });
  const { teamId, tmbId, isRoot, tmb } = result;

  if (isRoot) {
    return {
      teamId,
      tmbId,
      userId: result.userId,
      appId: result.appId,
      apikey: result.apikey,
      isRoot,
      authType: result.authType,
      permission: new TeamPermission({ isOwner: true })
    };
  }

  if (tmb.permission.hasManagePer) {
    return {
      ...result,
      permission: tmb.permission
    };
  }

  return Promise.reject(TeamErrEnum.unAuthTeam);
};
