import type { ApiRequestProps } from '@fastgpt/next/type';
import type { OutLinkChatAuthProps } from '@fastgpt/global/support/permission/chat';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
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
    const { outLinkConfig } = await authOutLink({ ...outLinkAuthData, req });
    const teamId = String(outLinkConfig.teamId);
    const tmbId = String(outLinkConfig.tmbId);
    return { teamId, tmbId, hasManagePer: false };
  }
  const { teamId, tmbId, isRoot, permission } = await authUserPer({
    req,
    authToken: true,
    authApiKey: true,
    per: ReadPermissionVal
  });
  return {
    teamId,
    tmbId,
    hasManagePer: Boolean(isRoot || permission?.hasManagePer)
  };
};
