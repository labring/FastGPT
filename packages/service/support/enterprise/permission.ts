import { TeamManagePermissionVal } from '@fastgpt/global/support/permission/user/constant';
import { authUserPer } from '../permission/user/auth';
import type { AuthResponseType } from '../permission/type';
import type { TeamPermission } from '@fastgpt/global/support/permission/user/controller';
import type { TeamTmbItemType } from '@fastgpt/global/support/user/team/type';
import type { ApiRequestProps } from '../../type/next';
import { EnterpriseRoleEnum } from '@fastgpt/global/support/enterprise/rbac/constants';
import { hasAnyEnterpriseRole } from './rbac/controller';
import { ERROR_ENUM } from '@fastgpt/global/common/error/errorCode';

export type EnterpriseAdminAuthResult = AuthResponseType<TeamPermission> & {
  tmb: TeamTmbItemType;
};

/**
 * Enterprise admin guard for internal-operation APIs.
 *
 * The first enterprise hardening layer maps enterprise administration to the
 * existing team manage permission. This keeps rollout compatible with the
 * current permission model while leaving room for OIDC group/role mapping.
 */
export const authEnterpriseAdmin = ({
  req
}: {
  req: ApiRequestProps;
}): Promise<EnterpriseAdminAuthResult> => {
  return authEnterpriseRole({
    req,
    roles: [EnterpriseRoleEnum.Owner],
    allowTeamManageFallback: true
  });
};

export const authEnterpriseRole = async ({
  req,
  roles,
  allowTeamManageFallback = false
}: {
  req: ApiRequestProps;
  roles: EnterpriseRoleEnum[];
  allowTeamManageFallback?: boolean;
}): Promise<EnterpriseAdminAuthResult> => {
  const result = await authUserPer({
    req,
    authToken: true
  });

  if (result.isRoot) return result;

  if (
    await hasAnyEnterpriseRole({
      teamId: result.teamId,
      userId: result.userId,
      roles
    })
  ) {
    return result;
  }

  if (!allowTeamManageFallback) {
    return Promise.reject(ERROR_ENUM.unAuthorization);
  }

  return authUserPer({
    req,
    authToken: true,
    per: TeamManagePermissionVal
  });
};
