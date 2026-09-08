import type { ApiRequestProps } from '@fastgpt/next/type';
import type { OutLinkChatAuthProps } from '@fastgpt/global/support/permission/chat';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import { TeamMemberRoleEnum } from '@fastgpt/global/support/user/team/constant';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import { MongoTeamMember } from '@fastgpt/service/support/user/team/teamMemberSchema';
import { authOutLink } from '@/service/support/permission/auth/outLink';

/** 模型目录和展示详情共用鉴权；外链身份必须来自服务端保存的发布配置。 */
export const authModelViewer = async ({
  req,
  outLinkAuthData
}: {
  req: ApiRequestProps;
  outLinkAuthData?: OutLinkChatAuthProps;
}) => {
  if (outLinkAuthData) {
    const { outLinkConfig } = await authOutLink(outLinkAuthData);
    const teamId = String(outLinkConfig.teamId);
    const tmbId = String(outLinkConfig.tmbId);
    const tmb = await MongoTeamMember.findOne({ _id: tmbId, teamId }, 'role').lean();
    return { teamId, tmbId, isTeamOwner: tmb?.role === TeamMemberRoleEnum.owner };
  }
  const { teamId, tmbId, isRoot, tmb } = await authUserPer({
    req,
    authToken: true,
    per: ReadPermissionVal
  });
  return { teamId, tmbId, isTeamOwner: tmb.role === TeamMemberRoleEnum.owner || isRoot };
};
