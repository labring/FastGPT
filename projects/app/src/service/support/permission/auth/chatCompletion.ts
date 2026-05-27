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
 * 普通调用直接使用鉴权凭证中的 tmbId；只有 API Key 调用允许通过 authProxy
 * 指定“代表团队内某个成员执行”。代理成员必须仍在当前团队内，且当 username 与
 * tmbId 同时传入时，两者必须解析到同一个团队成员，避免调用方用一个字段绕过另一个
 * 字段的身份约束。
 */
export const resolveChatCompletionEffectiveTmbId = async ({
  authType,
  authProxy,
  teamId,
  tmbId
}: {
  authType: AuthUserTypeEnum;
  authProxy?: ChatCompletionAuthProxy;
  teamId: string;
  tmbId: string;
}) => {
  if (!authProxy) {
    return {
      tmbId,
      isProxy: false
    };
  }

  // authProxy 是 API Key 的团队成员代理能力；用户 token、分享链接等身份不能叠加代理身份。
  if (authType !== AuthUserTypeEnum.apikey) {
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

  // 任一显式传入的身份字段找不到有效团队成员，都不能降级使用另一个字段。
  if ((authProxy.tmbId && !memberByTmbId) || (username && !memberByUsername)) {
    return Promise.reject(ChatErrEnum.unAuthChat);
  }

  // 同时传 username 和 tmbId 时要求二者指向同一成员，防止调用方构造歧义代理身份。
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
 * 这里同时支持应用 API Key 与用户 token：API Key 必须绑定或显式传入 appId，并按
 * teamId 限定应用；用户 token 则复用 authApp 做应用读权限校验。若 API Key 使用
 * authProxy，则后续会把 tmbId 切换为被代理成员，并对续聊 chatId 做成员归属校验。
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
    appId: apiKeyAppId,
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
      // 应用 Key 自带 appId；账号 Key 没有应用上下文，调用方必须额外传 appId。
      const currentAppId = apiKeyAppId || appId;
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
    } else {
      // 用户 token 走标准应用权限检查，保证调用者至少有应用读取权限。
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
    }
  })();

  const { tmbId: effectiveTmbId, isProxy } = await resolveChatCompletionEffectiveTmbId({
    authType,
    authProxy,
    teamId,
    tmbId
  });

  const chat = await MongoChat.findOne({ appId, chatId }).lean();
  // 新会话没有历史记录可校验；续聊时必须先保证会话属于当前团队。
  const shouldCheckChatMember =
    authType === AuthUserTypeEnum.token || (authType === AuthUserTypeEnum.apikey && isProxy);

  if (
    chat &&
    (String(chat.teamId) !== teamId ||
      // 用户 token 与 API Key 代理都是成员身份调用，不能续聊其他成员的历史会话。
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
