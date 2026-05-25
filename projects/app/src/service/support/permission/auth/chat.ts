import { type ChatHistoryItemResType, type ChatSchemaType } from '@fastgpt/global/core/chat/type';
import { MongoChat } from '@fastgpt/service/core/chat/chatSchema';
import { type AuthModeType } from '@fastgpt/service/support/permission/type';
import { authOutLink } from './outLink';
import { ChatErrEnum } from '@fastgpt/global/common/error/code/chat';
import { authTeamSpaceToken } from './team';
import { AuthUserTypeEnum, ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import type { OutLinkChatAuthProps } from '@fastgpt/global/support/permission/chat';
import { authApp } from '@fastgpt/service/support/permission/app/auth';
import { MongoChatItem } from '@fastgpt/service/core/chat/chatItemSchema';
import { DatasetErrEnum } from '@fastgpt/global/common/error/code/dataset';
import { getFlatAppResponses } from '@fastgpt/global/core/chat/utils';
import { addLog } from '@fastgpt/service/common/system/log';
import { MongoChatItemResponse } from '@fastgpt/service/core/chat/chatItemResponseSchema';
import { ChatRoleEnum } from '@fastgpt/global/core/chat/constants';
import type { HelperBotTypeEnum } from '@fastgpt/global/core/chat/helperBot/type';
import { MongoHelperBotChat } from '@fastgpt/service/core/chat/HelperBot/chatSchema';
import { authCert, parseHeaderCert } from '@fastgpt/service/support/permission/auth/common';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { authSkillByTmbId } from '@fastgpt/service/support/permission/agentSkill/auth';
import { AppErrEnum } from '@fastgpt/global/common/error/code/app';

/*
  检查chat的权限：
  1. 无 chatId，仅校验 cookie、shareChat、teamChat 秘钥是否合法
  2. 有 chatId，校验用户是否有权限操作该 chat

  * cookie + appId 校验
  * shareId + outLinkUid 校验
  * teamId + teamToken + appId 校验

  Chat没有读写的权限之分，鉴权过了，都可以操作。
*/
export const defaultResponseShow = {
  showCite: true,
  showRunningStatus: true,
  showSkillReferences: true,
  showFullText: true,
  canDownloadSource: true
};
type AuthChatCommonProps = {
  appId: string;
  shareId?: string;
  outLinkUid?: string;
  teamId?: string;
  teamToken?: string;
};

export async function authChatCrud({
  appId,
  chatId,

  shareId,
  outLinkUid,

  teamId: spaceTeamId,
  teamToken,
  ...props
}: AuthModeType &
  AuthChatCommonProps & {
    chatId?: string;
  }): Promise<{
  teamId: string;
  tmbId: string; // 本轮鉴权的 uid
  uid: string; // chat 里的实际的 uid（outlinkUid??tmbId)
  chat?: ChatSchemaType;
  showCite: boolean;
  showRunningStatus: boolean;
  showSkillReferences: boolean;
  showFullText: boolean;
  canDownloadSource: boolean;
  authType?: `${AuthUserTypeEnum}`;
}> {
  if (!appId) return Promise.reject(ChatErrEnum.unAuthChat);

  if (spaceTeamId && teamToken) {
    const { uid, tmbId, tags } = await authTeamSpaceToken({
      teamId: spaceTeamId,
      teamToken
    });

    // Verify app belongs to the authenticated team and tag-based access
    const app = await MongoApp.findOne(
      {
        _id: appId,
        teamId: spaceTeamId,
        $or: [
          { teamTags: { $size: 0 } },
          { teamTags: { $exists: false } },
          { teamTags: { $in: tags } }
        ]
      },
      'teamId'
    ).lean();
    if (!app) {
      return Promise.reject(ChatErrEnum.unAuthChat);
    }

    if (!chatId) {
      return {
        teamId: spaceTeamId,
        tmbId,
        uid,
        ...defaultResponseShow,
        authType: AuthUserTypeEnum.teamDomain
      };
    }

    const chat = await MongoChat.findOne({ appId, chatId }).lean();
    if (!chat) {
      return {
        teamId: spaceTeamId,
        tmbId,
        uid,
        ...defaultResponseShow,
        authType: AuthUserTypeEnum.teamDomain
      };
    }

    if (String(chat.teamId) !== spaceTeamId || chat.outLinkUid !== uid)
      return Promise.reject(ChatErrEnum.unAuthChat);

    return {
      teamId: spaceTeamId,
      tmbId,
      uid,
      chat,
      ...defaultResponseShow,
      authType: AuthUserTypeEnum.teamDomain
    };
  }

  if (shareId && outLinkUid) {
    const {
      outLinkConfig,
      uid,
      appId: shareChatAppId
    } = await authOutLink({ shareId, outLinkUid });

    if (String(shareChatAppId) !== appId) return Promise.reject(ChatErrEnum.unAuthChat);

    if (!chatId) {
      return {
        teamId: String(outLinkConfig.teamId),
        tmbId: String(outLinkConfig.tmbId),
        uid,

        showCite: outLinkConfig.showCite ?? false,
        showRunningStatus: outLinkConfig.showRunningStatus ?? true,
        showSkillReferences: outLinkConfig.showSkillReferences ?? false,
        showFullText: outLinkConfig.showFullText ?? false,
        canDownloadSource: outLinkConfig.canDownloadSource ?? false,
        authType: AuthUserTypeEnum.outLink
      };
    }

    const chat = await MongoChat.findOne({ appId, chatId }).lean();

    if (!chat) {
      return {
        teamId: String(outLinkConfig.teamId),
        tmbId: String(outLinkConfig.tmbId),
        uid,
        showCite: outLinkConfig.showCite ?? false,
        showRunningStatus: outLinkConfig.showRunningStatus ?? true,
        showSkillReferences: outLinkConfig.showSkillReferences ?? false,
        showFullText: outLinkConfig.showFullText ?? false,
        canDownloadSource: outLinkConfig.canDownloadSource ?? false,
        authType: AuthUserTypeEnum.outLink
      };
    }
    if (chat.outLinkUid !== uid) return Promise.reject(ChatErrEnum.unAuthChat);
    return {
      teamId: String(outLinkConfig.teamId),
      tmbId: String(outLinkConfig.tmbId),
      chat,
      uid,
      showCite: outLinkConfig.showCite ?? false,
      showRunningStatus: outLinkConfig.showRunningStatus ?? true,
      showSkillReferences: outLinkConfig.showSkillReferences ?? false,
      showFullText: outLinkConfig.showFullText ?? false,
      canDownloadSource: outLinkConfig.canDownloadSource ?? false,
      authType: AuthUserTypeEnum.outLink
    };
  }

  // Cookie
  const { teamId, tmbId, permission, authType } = await authApp({
    req: props.req,
    authToken: true,
    authApiKey: true,
    appId,
    per: ReadPermissionVal
  });

  if (!chatId) {
    return {
      teamId,
      tmbId,
      uid: tmbId,
      ...defaultResponseShow,

      authType
    };
  }

  const chat = await MongoChat.findOne({ appId, chatId }).lean();
  if (!chat) {
    return {
      teamId,
      tmbId,
      uid: tmbId,
      ...defaultResponseShow,
      authType
    };
  }

  if (String(teamId) !== String(chat.teamId)) return Promise.reject(ChatErrEnum.unAuthChat);
  if (permission.hasReadChatLogPer) {
    return {
      teamId,
      tmbId,
      chat,
      uid: chat.outLinkUid ?? chat.tmbId,
      ...defaultResponseShow,
      authType
    };
  }

  if (String(tmbId) === String(chat.tmbId)) {
    return {
      teamId,
      tmbId,
      chat,
      uid: chat.outLinkUid ?? chat.tmbId,
      ...defaultResponseShow,
      authType
    };
  }

  return Promise.reject(ChatErrEnum.unAuthChat);
}

/**
 * Auth for sandbox API endpoints. Tries app auth first; falls back to skill auth
 * when appId is actually a skillId (e.g. Skill Preview sandbox file access).
 */
export async function authSandboxAccess({
  appId,
  chatId,
  outLinkAuthData,
  ...props
}: AuthModeType & {
  appId: string;
  chatId?: string;
  outLinkAuthData?: OutLinkChatAuthProps;
}): Promise<{
  teamId: string;
  tmbId: string;
  uid: string;
}> {
  try {
    const result = await authChatCrud({ appId, chatId, ...outLinkAuthData, ...props });
    return { teamId: result.teamId, tmbId: result.tmbId, uid: result.uid };
  } catch (err: any) {
    // Only fall back to skill auth for app-not-found / unAuthChat errors.
    // Errors can be plain strings (Promise.reject(AppErrEnum.unExist)) or objects.
    const errCode = err?.message || err?.statusText || err;
    if (
      errCode !== AppErrEnum.unExist &&
      errCode !== AppErrEnum.unAuthApp &&
      errCode !== ChatErrEnum.unAuthChat
    ) {
      throw err;
    }

    const { tmbId, teamId } = await parseHeaderCert(props);

    // appId may be empty for endpoints that only need chatId-based sandbox lookup.
    // Skip skill auth when appId is falsy — no specific app/resource to authorize.
    if (appId) {
      await authSkillByTmbId({
        tmbId,
        skillId: appId,
        per: ReadPermissionVal
      });
    }

    return {
      teamId,
      tmbId,
      uid: tmbId
    };
  }
}

export const authCollectionInChat = async ({
  collectionIds,
  appId,
  chatId,
  chatItemDataId
}: {
  collectionIds: string[];
  appId: string;
  chatId: string;
  chatItemDataId: string;
}) => {
  try {
    // 1. 使用 citeCollectionIds 字段来判断
    const chatItems = await MongoChatItem.find(
      {
        appId,
        chatId,
        obj: ChatRoleEnum.AI
      },
      'citeCollectionIds'
    )
      .sort({ _id: -1 })
      .limit(50)
      .lean();
    const citeCollectionIds = new Set(
      chatItems.map((item) => ('citeCollectionIds' in item ? item.citeCollectionIds : [])).flat()
    );
    if (collectionIds.every((id) => citeCollectionIds.has(id))) {
      return;
    }

    // Adapt <=4.13.0
    const chatItem = (await MongoChatItem.findOne(
      {
        appId,
        chatId,
        dataId: chatItemDataId
      },
      'responseData'
    ).lean()) as { time: Date; responseData?: ChatHistoryItemResType[] };

    if (!chatItem) return Promise.reject(DatasetErrEnum.unAuthDatasetFile);

    // Concat response data
    if (!chatItem.responseData || chatItem.responseData.length === 0) {
      const chatItemResponses = await MongoChatItemResponse.find(
        { appId, chatId, chatItemDataId },
        { data: 1 }
      ).lean();
      chatItem.responseData = chatItemResponses.map((item) => item.data);
    }

    // 找 responseData 里，是否有该文档 id
    const flatResData = getFlatAppResponses(chatItem.responseData || []);

    const quoteListSet = new Set(
      flatResData.map((item) => item.quoteList?.map((quote) => quote.collectionId) || []).flat()
    );

    if (collectionIds.every((id) => quoteListSet.has(id))) {
      return;
    }
  } catch (error) {
    addLog.warn('authCollectionInChat error', {
      error,
      collectionIds,
      appId,
      chatId,
      chatItemDataId
    });
  }
  return Promise.reject(DatasetErrEnum.unAuthDatasetFile);
};

/**
 * 使用 retrievalResults 字段校验集合权限（用于 getRetrievalResults 接口）
 */
export const authCollectionInChatForRetrievalResult = async ({
  collectionIds,
  appId,
  chatId,
  chatItemDataId
}: {
  collectionIds: string[];
  appId: string;
  chatId: string;
  chatItemDataId: string;
}) => {
  try {
    // 1. 使用 citeCollectionIds 字段来判断
    const chatItems = await MongoChatItem.find(
      {
        appId,
        chatId,
        obj: ChatRoleEnum.AI
      },
      'citeCollectionIds'
    )
      .sort({ _id: -1 })
      .limit(50)
      .lean();
    const citeCollectionIds = new Set(
      chatItems.map((item) => ('citeCollectionIds' in item ? item.citeCollectionIds : [])).flat()
    );
    if (collectionIds.every((id) => citeCollectionIds.has(id))) {
      return;
    }

    // Adapt <=4.13.0
    const chatItem = (await MongoChatItem.findOne(
      {
        appId,
        chatId,
        dataId: chatItemDataId
      },
      'responseData'
    ).lean()) as { time: Date; responseData?: ChatHistoryItemResType[] };

    if (!chatItem) return Promise.reject(DatasetErrEnum.unAuthDatasetFile);

    // Concat response data
    if (!chatItem.responseData || chatItem.responseData.length === 0) {
      const chatItemResponses = await MongoChatItemResponse.find(
        { appId, chatId, chatItemDataId },
        { data: 1 }
      ).lean();
      chatItem.responseData = chatItemResponses.map((item) => item.data);
    }

    // 找 responseData 里的 retrievalResults，是否有该集合 id
    const flatResData = getFlatAppResponses(chatItem.responseData || []);

    // 从 retrievalResults 中提取 collectionId
    const retrievalCollectionSet = new Set(
      flatResData
        .map((item) => item.retrievalResults?.map((result) => String(result.collectionId)) || [])
        .flat()
        .filter(Boolean)
    );

    if (collectionIds.every((id) => retrievalCollectionSet.has(String(id)))) {
      return {
        chatItem
      };
    }
  } catch (error) {
    addLog.warn('authCollectionInChatForRetrievalResult error', {
      error,
      collectionIds,
      appId,
      chatId,
      chatItemDataId
    });
  }
  return Promise.reject(DatasetErrEnum.unAuthDatasetFile);
};

export const authHelperBotChatCrud = async ({
  type,
  chatId,
  ...props
}: AuthModeType & {
  type: `${HelperBotTypeEnum}`;
  chatId: string;
}) => {
  const { userId, teamId, tmbId } = await authCert(props);

  const chat = await MongoHelperBotChat.findOne({ type, userId, chatId }).lean();

  return { chat, userId, teamId, tmbId };
};
