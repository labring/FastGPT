import { type PermissionValueType } from '@fastgpt/global/support/permission/type';
import { type AuthModeType, type AuthResponseType } from '../type';
import { type McpKeyType } from '@fastgpt/global/support/mcp/type';
import { authUserPer } from '../user/auth';
import { MongoMcpKey } from '../../mcp/schema';
import { CommonErrEnum } from '@fastgpt/global/common/error/code/common';
import { TeamErrEnum } from '@fastgpt/global/common/error/code/team';

export const authMcp = async ({
  mcpId,
  per,
  ...props
}: AuthModeType & {
  mcpId: string;
  per: PermissionValueType;
}): Promise<
  AuthResponseType & {
    mcp: McpKeyType;
  }
> => {
  const { userId, teamId, tmbId, permission, isRoot } = await authUserPer(props);

  const mcp = await MongoMcpKey.findOne({ _id: mcpId }).lean();

  if (!mcp) {
    return Promise.reject(CommonErrEnum.invalidResource);
  }

  if (teamId !== String(mcp.teamId)) {
    return Promise.reject(TeamErrEnum.unPermission);
  }

  if (!permission.hasManagePer && !isRoot && tmbId !== String(mcp.tmbId)) {
    return Promise.reject(TeamErrEnum.unPermission);
  }

  return {
    mcp,
    userId,
    teamId,
    tmbId,
    isRoot,
    permission
  };
};
