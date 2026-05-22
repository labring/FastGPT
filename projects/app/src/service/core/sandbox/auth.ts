import { authChatCrud } from '@/service/support/permission/auth/chat';
import { authSkill } from '@fastgpt/service/support/permission/skill/auth';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import type { ApiRequestProps } from '@fastgpt/service/type/next';

/**
 * 统一沙盒 API 会话访问控制鉴权。
 * 支持普通聊天会话（authChatCrud）及编辑调试态（authSkill）的自动感知和鉴权路由。
 */
export async function authSandboxSession({
  req,
  appId,
  chatId,
  outLinkAuthData,
  per = ReadPermissionVal
}: {
  req: ApiRequestProps;
  appId: string;
  chatId: string;
  outLinkAuthData?: any;
  per?: number;
}): Promise<{ uid: string; teamId: string }> {
  if (chatId === 'edit-debug') {
    const authResult = await authSkill({
      req,
      authToken: true,
      authApiKey: true,
      skillId: appId,
      per
    });
    return {
      uid: authResult.tmbId,
      teamId: authResult.teamId
    };
  }

  const authResult = await authChatCrud({
    req,
    authToken: true,
    authApiKey: true,
    appId,
    chatId,
    ...outLinkAuthData
  });
  return {
    uid: authResult.uid,
    teamId: authResult.teamId
  };
}
