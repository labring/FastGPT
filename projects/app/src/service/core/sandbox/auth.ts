import { authChatCrud } from '@/service/support/permission/auth/chat';
import { authSkill } from '@fastgpt/service/support/permission/skill/auth';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import type { ApiRequestProps } from '@fastgpt/service/type/next';
import type { OutLinkChatAuthProps } from '@fastgpt/global/support/permission/chat';
import { checkTeamSandboxPermission } from '@fastgpt/service/support/permission/teamLimit';

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
  outLinkAuthData?: OutLinkChatAuthProps;
  per?: number;
}): Promise<{ uid: string; teamId: string }> {
  const result = await (async () => {
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
      shareId: outLinkAuthData?.shareId,
      outLinkUid: outLinkAuthData?.outLinkUid,
      teamId: outLinkAuthData?.teamId,
      teamToken: outLinkAuthData?.teamToken
    });
    return {
      uid: authResult.uid,
      teamId: authResult.teamId
    };
  })();

  try {
    await checkTeamSandboxPermission(result.teamId);
  } catch (err) {
    throw new Error('当前应用未配置虚拟机，暂时无法使用相关功能，请联系管理员配置。');
  }

  return result;
}
