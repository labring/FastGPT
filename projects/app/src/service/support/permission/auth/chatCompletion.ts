import type { NextApiRequest } from 'next';
import type {
  AuthResponseType,
  ChatCompletionAuthProxy
} from '@fastgpt/global/openapi/core/chat/completion/api';
import { ChatErrEnum } from '@fastgpt/global/common/error/code/chat';
import { AuthUserTypeEnum, ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import { notLeaveStatus } from '@fastgpt/global/support/user/team/constant';
import { MongoChat } from '@fastgpt/service/core/chat/chatSchema';
import { buildChatSourceQuery } from '@fastgpt/service/core/chat/source';
import { authApp, authAppByTmbId } from '@fastgpt/service/support/permission/app/auth';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import { MongoUser } from '@fastgpt/service/support/user/schema';
import { MongoTeamMember } from '@fastgpt/service/support/user/team/teamMemberSchema';
import { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import { UserError } from '@fastgpt/global/common/error/utils';

/**
 * 解析 Chat Completions 请求最终应归属的团队成员。
 *
 * 普通调用直接使用鉴权凭证中的 tmbId。只有开启 authProxy 的团队级 API Key 调用，
 * 才允许通过 authProxy 指定“代表团队内某个成员执行”。代理成员必须仍在当前团队内；
 * username 与 tmbId 同时传入时只使用 tmbId；ID 无效或成员不可用时不回退到用户名。
 */
export const resolveChatCompletionEffectiveTmbId = async ({
  authType,
  authProxy,
  teamId,
  tmbId,
  legacyAppId,
  apiKeyAuthProxy
}: {
  authType: AuthUserTypeEnum;
  authProxy?: ChatCompletionAuthProxy;
  teamId: string;
  tmbId: string;
  legacyAppId?: string;
  apiKeyAuthProxy?: boolean;
}) => {
  if (!authProxy) {
    return {
      tmbId,
      isProxy: false
    };
  }

  if (authType !== AuthUserTypeEnum.apikey || legacyAppId || !apiKeyAuthProxy) {
    return Promise.reject(ChatErrEnum.unAuthChat);
  }

  const member = await (async () => {
    // 固定选择一种代理身份，避免低优先级的用户名影响已指定的 ID。
    if (authProxy.tmbId) {
      return MongoTeamMember.findOne({
        _id: authProxy.tmbId,
        teamId,
        status: notLeaveStatus
      })
        .select('_id userId teamId')
        .lean();
    }

    const username = 'username' in authProxy ? authProxy.username.trim() : undefined;
    if (!username) return null;

    const user = await MongoUser.findOne({ username }).select('_id').lean();
    if (!user) return null;

    return MongoTeamMember.findOne({
      teamId,
      userId: user._id,
      status: notLeaveStatus
    })
      .select('_id userId teamId')
      .lean();
  })();
  if (!member) {
    return Promise.reject(ChatErrEnum.unAuthChat);
  }

  return {
    tmbId: String(member._id),
    isProxy: true
  };
};

/**
 * 鉴权 Chat Completions 头部请求，并返回后续对话运行需要的应用、团队和成员上下文。
 *
 * API Key 先完成凭证鉴权，再按 body.appId > apiKey-appId > legacyAppId 解析应用。
 * authProxy 只改变本次 completions 的 effective tmbId；应用和会话权限继续按
 * effective tmbId 走现有权限链路，不能因为 APIKey 创建者有权限而绕过代理成员权限。
 */
export const authChatCompletionHeaderRequest = async ({
  req,
  appId,
  chatId,
  authProxy,
  showSkillReferences
}: {
  req: NextApiRequest;
  appId?: string;
  chatId?: string;
  authProxy?: ChatCompletionAuthProxy;
  showSkillReferences?: boolean;
}): Promise<AuthResponseType> => {
  const { legacyAppId, parsedAppId, apiKeyAuthProxy, teamId, tmbId, authType, sourceName, apikey } =
    await authCert({
      req,
      authToken: true,
      authApiKey: true
    });

  const { tmbId: effectiveTmbId } = await resolveChatCompletionEffectiveTmbId({
    authType,
    authProxy,
    teamId,
    tmbId,
    legacyAppId,
    apiKeyAuthProxy
  });

  const currentAppId =
    authType === AuthUserTypeEnum.apikey ? appId || parsedAppId || legacyAppId : appId;

  if (!currentAppId) {
    return Promise.reject(new UserError('appId is empty'));
  }

  const { app, permission } = await (async () => {
    if (authType === AuthUserTypeEnum.apikey) {
      const { app } = await authAppByTmbId({
        tmbId: effectiveTmbId,
        appId: currentAppId,
        per: ReadPermissionVal
      });

      return {
        app,
        permission: app.permission
      };
    }

    const { app, permission } = await authApp({
      req,
      authToken: true,
      appId: currentAppId,
      per: ReadPermissionVal
    });

    return {
      app,
      permission
    };
  })();

  appId = String(app._id);
  const chat = chatId
    ? await MongoChat.findOne({
        ...buildChatSourceQuery({ sourceType: ChatSourceTypeEnum.app, sourceId: appId }),
        chatId
      }).lean()
    : null;

  if (
    chat &&
    (String(chat.teamId) !== teamId ||
      (!permission.hasReadChatLogPer && String(chat.tmbId) !== effectiveTmbId))
  ) {
    return Promise.reject(ChatErrEnum.unAuthChat);
  }

  return {
    teamId,
    tmbId: effectiveTmbId,
    app,
    apikey,
    authType,
    sourceName,
    responseAllData: true,
    showCite: true,
    showSkillReferences
  };
};
