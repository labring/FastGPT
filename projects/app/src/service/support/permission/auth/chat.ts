import { type ChatHistoryItemResType, type ChatSchemaType } from '@fastgpt/global/core/chat/type';
import { MongoChat } from '@fastgpt/service/core/chat/chatSchema';
import { type AuthModeType } from '@fastgpt/service/support/permission/type';
import { authOutLink } from './outLink';
import { ChatErrEnum } from '@fastgpt/global/common/error/code/chat';
import { authTeamSpaceToken } from './team';
import { AuthUserTypeEnum, ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import { authApp } from '@fastgpt/service/support/permission/app/auth';
import { MongoChatItem } from '@fastgpt/service/core/chat/chatItemSchema';
import { DatasetErrEnum } from '@fastgpt/global/common/error/code/dataset';
import { getFlatAppResponses } from '@/global/core/chat/utils';
import { MongoChatItemResponse } from '@fastgpt/service/core/chat/chatItemResponseSchema';
import { ChatRoleEnum } from '@fastgpt/global/core/chat/constants';

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
  tmbId: string;
  uid: string;
  chat?: ChatSchemaType;
  showCite: boolean;
  showRunningStatus: boolean;
  showFullText: boolean;
  canDownloadSource: boolean;
  authType?: `${AuthUserTypeEnum}`;
}> {
  if (!appId) return Promise.reject(ChatErrEnum.unAuthChat);

  if (spaceTeamId && teamToken) {
    const { uid, tmbId } = await authTeamSpaceToken({ teamId: spaceTeamId, teamToken });
    if (!chatId)
      return {
        teamId: spaceTeamId,
        tmbId,
        uid,
        ...defaultResponseShow,
        authType: AuthUserTypeEnum.teamDomain
      };

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

    if (chat.outLinkUid !== uid) return Promise.reject(ChatErrEnum.unAuthChat);

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
      uid: tmbId,
      ...defaultResponseShow,
      authType
    };
  }

  if (String(tmbId) === String(chat.tmbId)) {
    return {
      teamId,
      tmbId,
      chat,
      uid: tmbId,
      ...defaultResponseShow,
      authType
    };
  }

  return Promise.reject(ChatErrEnum.unAuthChat);
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
  } catch (error) {}
  return Promise.reject(DatasetErrEnum.unAuthDatasetFile);
};
