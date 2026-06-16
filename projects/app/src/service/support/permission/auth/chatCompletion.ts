import type { NextApiRequest } from 'next';
import type {
  AuthResponseType,
  ChatCompletionAuthProxy
} from '@fastgpt/global/openapi/core/chat/completion/api';
import { ChatErrEnum } from '@fastgpt/global/common/error/code/chat';
import { AuthUserTypeEnum, ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import { notLeaveStatus } from '@fastgpt/global/support/user/team/constant';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { MongoChat } from '@fastgpt/service/core/chat/chatSchema';
import { authApp } from '@fastgpt/service/support/permission/app/auth';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import { MongoUser } from '@fastgpt/service/support/user/schema';
import { MongoTeamMember } from '@fastgpt/service/support/user/team/teamMemberSchema';

/**
 * 解析 Chat Completions 请求最终应归属的团队成员。
 *
 * 普通调用直接使用鉴权凭证中的 tmbId。只有开启 authProxy 的团队级 API Key 调用，
 * 才允许通过 authProxy 指定“代表团队内某个成员执行”。代理成员必须仍在当前团队内；
 * username 与 tmbId 同时传入时，两者必须解析到同一个团队成员。
 */
export const resolveChatCompletionEffectiveTmbId = async ({
  authType,
  authProxy,
  teamId,
  tmbId,
  apiKeyAppId,
  apiKeyAuthProxy
}: {
  authType: AuthUserTypeEnum;
  authProxy?: ChatCompletionAuthProxy;
  teamId: string;
  tmbId: string;
  apiKeyAppId?: string;
  apiKeyAuthProxy?: boolean;
}) => {
  if (!authProxy) {
    return {
      tmbId,
      isProxy: false
    };
  }

  if (authType !== AuthUserTypeEnum.apikey || apiKeyAppId || !apiKeyAuthProxy) {
    return Promise.reject(ChatErrEnum.unAuthChat);
  }

  const username = authProxy.username?.trim();
  if (!username && !authProxy.tmbId) {
    return Promise.reject(ChatErrEnum.unAuthChat);
  }

  const [memberByTmbId, memberByUsername] = await Promise.all([
    authProxy.tmbId
      ? MongoTeamMember.findOne({
          _id: authProxy.tmbId,
          teamId,
          status: notLeaveStatus
        })
          .select('_id userId teamId')
          .lean()
      : null,
    username
      ? (async () => {
          const user = await MongoUser.findOne({ username }).select('_id').lean();
          if (!user) return null;

          return MongoTeamMember.findOne({
            teamId,
            userId: user._id,
            status: notLeaveStatus
          })
            .select('_id userId teamId')
            .lean();
        })()
      : null
  ]);

  if ((authProxy.tmbId && !memberByTmbId) || (username && !memberByUsername)) {
    return Promise.reject(ChatErrEnum.unAuthChat);
  }

  if (
    memberByTmbId &&
    memberByUsername &&
    String(memberByTmbId._id) !== String(memberByUsername._id)
  ) {
    return Promise.reject(ChatErrEnum.unAuthChat);
  }

  const member = memberByTmbId || memberByUsername;
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
 * API Key 必须绑定 appId 或在请求体显式传 appId。全局 API Key 只有在 key 记录
 * 开启 authProxy 时，才能把运行身份切换到团队内的指定成员。
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
  const {
    appId: authorizedAppId,
    apiKeyAppId,
    apiKeyAuthProxy,
    teamId,
    tmbId,
    authType,
    sourceName,
    apikey
  } = await authCert({
    req,
    authToken: true,
    authApiKey: true
  });

  const { app } = await (async () => {
    if (authType === AuthUserTypeEnum.apikey) {
      const currentAppId = authorizedAppId || appId;
      if (!currentAppId) {
        return Promise.reject(
          'Key is error. You need to use the app key rather than the account key.'
        );
      }
      const app = await MongoApp.findOne({ _id: currentAppId, teamId });

      if (!app) {
        return Promise.reject('app is empty');
      }

      appId = String(app._id);

      return {
        app
      };
    }

    if (!appId) {
      return Promise.reject('appId is empty');
    }
    const { app } = await authApp({
      req,
      authToken: true,
      appId,
      per: ReadPermissionVal
    });

    return {
      app
    };
  })();

  const { tmbId: effectiveTmbId, isProxy } = await resolveChatCompletionEffectiveTmbId({
    authType,
    authProxy,
    teamId,
    tmbId,
    apiKeyAppId,
    apiKeyAuthProxy
  });

  const chat = await MongoChat.findOne({ appId, chatId }).lean();
  const shouldCheckChatMember =
    authType === AuthUserTypeEnum.token || (authType === AuthUserTypeEnum.apikey && isProxy);

  if (
    chat &&
    (String(chat.teamId) !== teamId ||
      (shouldCheckChatMember && String(chat.tmbId) !== effectiveTmbId))
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
