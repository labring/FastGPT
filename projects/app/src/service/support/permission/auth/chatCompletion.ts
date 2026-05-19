import type { NextApiRequest } from 'next';
import type {
  AuthResponseType,
  ChatCompletionAuthProxy
} from '@fastgpt/global/openapi/core/chat/completion/api';
import { ChatErrEnum } from '@fastgpt/global/common/error/code/chat';
import {
  AuthUserTypeEnum,
  ReadPermissionVal
} from '@fastgpt/global/support/permission/constant';
import { notLeaveStatus } from '@fastgpt/global/support/user/team/constant';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { MongoChat } from '@fastgpt/service/core/chat/chatSchema';
import { authApp } from '@fastgpt/service/support/permission/app/auth';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import { MongoUser } from '@fastgpt/service/support/user/schema';
import { MongoTeamMember } from '@fastgpt/service/support/user/team/teamMemberSchema';

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
