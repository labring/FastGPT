import { TeamPermission } from '@fastgpt/global/support/permission/user/controller';
import { AuthModeType, AuthResponseType } from '../type';
import { parseHeaderCert } from '../controller';
import { getTmbInfoByTmbId } from '../../user/team/controller';
import { TeamErrEnum } from '@fastgpt/global/common/error/code/team';

export const authOrgMember = async ({
  orgIds,
  req,
  authToken = false,
  authRoot = false,
  authApiKey = false
}: {
  orgIds: string | string[];
} & AuthModeType): Promise<AuthResponseType> => {
  const result = await parseHeaderCert({ req, authToken, authApiKey, authRoot });
  const { teamId, tmbId, isRoot } = result;
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

  if (!Array.isArray(orgIds)) {
    orgIds = [orgIds];
  }

  // const promises = orgIds.map((orgId) => getOrgMemberRole({ orgId, tmbId }));

  const tmb = await getTmbInfoByTmbId({ tmbId });
  if (tmb.permission.hasManagePer) {
    return {
      ...result,
      permission: tmb.permission
    };
  }

  return Promise.reject(TeamErrEnum.unAuthTeam);

  // const targetRole = OrgMemberRole[role];
  // for (const orgRole of orgRoles) {
  //   if (!orgRole || checkOrgRole(orgRole, targetRole)) {
  //     return Promise.reject(TeamErrEnum.unAuthTeam);
  //   }
  // }

  // return {
  //   ...result,
  //   permission: tmb.permission
  // };
};
