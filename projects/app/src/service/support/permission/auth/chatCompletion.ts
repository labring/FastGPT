import type { ChatAuthProxy } from '@fastgpt/global/support/permission/chat';
import { resolveChatProxyMember } from '@fastgpt/service/core/chat/identity';
import type { NextApiRequest } from 'next';
import type { AuthResponseType } from '@fastgpt/global/openapi/core/chat/completion/api';
import { ChatErrEnum } from '@fastgpt/global/common/error/code/chat';
import { AuthUserTypeEnum, ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import { MongoChat } from '@fastgpt/service/core/chat/chatSchema';
import { buildChatSourceQuery } from '@fastgpt/service/core/chat/source';
import { authApp, authAppByTmbId } from '@fastgpt/service/support/permission/app/auth';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import { ChatSourceEnum, ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import { UserError } from '@fastgpt/global/common/error/utils';
import { ApiKeyTypeEnum } from '@fastgpt/global/support/openapi/constants';
import { getAppByApiKey } from '@fastgpt/service/support/openapi/auth';
import { AppPermission } from '@fastgpt/global/support/permission/app/controller';
import { ReadRoleVal } from '@fastgpt/global/support/permission/constant';

/**
 * 鉴权 Chat Completions 头部请求，并返回后续对话运行需要的应用、团队和成员上下文。
 *
 * API Key 先完成凭证鉴权；应用 Key 使用绑定应用，个人密钥按 body.appId > apiKey-appId > legacyAppId 解析。
 * 个人密钥（含 authProxy）按 effective tmbId 校验 ACL；应用 Key 只按可信绑定授权，
 * 不依赖归属成员 ACL，也不支持 authProxy。请求中的 appId 和 SDK 后缀均不覆盖应用 Key 的绑定。
 */
export const authChatCompletionHeaderRequest = async ({
  req,
  appId,
  chatId,
  authProxy,
  customUid,
  showSkillReferences
}: {
  req: NextApiRequest;
  appId?: string;
  chatId?: string;
  authProxy?: ChatAuthProxy;
  customUid?: string;
  showSkillReferences?: boolean;
}): Promise<AuthResponseType> => {
  const {
    legacyAppId,
    parsedAppId,
    apiKeyAuthProxy,
    teamId,
    tmbId,
    authType,
    sourceName,
    apikey,
    apiKeyId,
    apiKeyType,
    boundAppId
  } = await authCert({
    req,
    authToken: true,
    authApiKey: true,
    authAppApiKey: true
  });

  if (customUid && (authType !== AuthUserTypeEnum.apikey || authProxy)) {
    throw ChatErrEnum.unAuthChat;
  }

  const { tmbId: effectiveTmbId } = await resolveChatProxyMember({
    authType,
    authProxy,
    teamId,
    tmbId,
    legacyAppId,
    apiKeyAuthProxy,
    apiKeyType
  });

  const currentAppId =
    apiKeyType === ApiKeyTypeEnum.app
      ? boundAppId
      : authType === AuthUserTypeEnum.apikey
        ? appId || parsedAppId || legacyAppId
        : appId;

  if (!currentAppId) {
    return Promise.reject(new UserError('appId is empty'));
  }

  const { app, permission } = await (async () => {
    if (apiKeyType === ApiKeyTypeEnum.app) {
      const app = await getAppByApiKey({ teamId, boundAppId });
      return { app, permission: new AppPermission({ role: ReadRoleVal }) };
    }
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
      // 空字符串按旧协议属于默认身份；已有外部身份时省略或清空也不能改绑。
      (chat.outLinkUid || undefined) !== (customUid || undefined) ||
      (apiKeyType !== ApiKeyTypeEnum.app &&
        !permission.hasReadChatLogPer &&
        String(chat.tmbId) !== effectiveTmbId))
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
    publishSource:
      authType === AuthUserTypeEnum.apikey
        ? { type: ChatSourceEnum.api, id: apiKeyId }
        : { type: ChatSourceEnum.online },
    canReadModerationRecords: permission.hasWritePer,
    responseAllData: true,
    showCite: true,
    showSkillReferences
  };
};
