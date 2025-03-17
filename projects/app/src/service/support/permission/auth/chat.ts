import { AIChatItemType, ChatHistoryItemResType, ChatSchema } from '@fastgpt/global/core/chat/type';
import { MongoChat } from '@fastgpt/service/core/chat/chatSchema';
import { AuthModeType } from '@fastgpt/service/support/permission/type';
import { authOutLink } from './outLink';
import { ChatErrEnum } from '@fastgpt/global/common/error/code/chat';
import { authTeamSpaceToken } from './team';
import { AuthUserTypeEnum, ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import { authApp } from '@fastgpt/service/support/permission/app/auth';
import { MongoChatItem } from '@fastgpt/service/core/chat/chatItemSchema';
import { DatasetErrEnum } from '@fastgpt/global/common/error/code/dataset';

/* 
  检查chat的权限：
  1. 无 chatId，仅校验 cookie、shareChat、teamChat 秘钥是否合法
  2. 有 chatId，校验用户是否有权限操作该 chat

  * cookie + appId 校验
  * shareId + outLinkUid 校验
  * teamId + teamToken + appId 校验

  Chat没有读写的权限之分，鉴权过了，都可以操作。
*/
const defaultResponseShow = {
  responseDetail: true,
  showNodeStatus: true,
  showRawSource: true
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
  chat?: ChatSchema;
  responseDetail: boolean;
  showNodeStatus: boolean;
  showRawSource: boolean;
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
        responseDetail: outLinkConfig.responseDetail,
        showNodeStatus: outLinkConfig.showNodeStatus ?? true,
        showRawSource: outLinkConfig.showRawSource ?? false,
        authType: AuthUserTypeEnum.outLink
      };
    }

    const chat = await MongoChat.findOne({ appId, chatId }).lean();

    if (!chat) {
      return {
        teamId: String(outLinkConfig.teamId),
        tmbId: String(outLinkConfig.tmbId),
        uid,
        responseDetail: outLinkConfig.responseDetail,
        showNodeStatus: outLinkConfig.showNodeStatus ?? true,
        showRawSource: outLinkConfig.showRawSource ?? false,
        authType: AuthUserTypeEnum.outLink
      };
    }
    if (chat.outLinkUid !== uid) return Promise.reject(ChatErrEnum.unAuthChat);
    return {
      teamId: String(outLinkConfig.teamId),
      tmbId: String(outLinkConfig.tmbId),
      chat,
      uid,
      responseDetail: outLinkConfig.responseDetail,
      showNodeStatus: outLinkConfig.showNodeStatus ?? true,
      showRawSource: outLinkConfig.showRawSource ?? false,
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

  if (!chatId)
    return {
      teamId,
      tmbId,
      uid: tmbId,
      ...defaultResponseShow,

      authType
    };

  const chat = await MongoChat.findOne({ appId, chatId }).lean();
  if (!chat)
    return {
      teamId,
      tmbId,
      uid: tmbId,
      ...defaultResponseShow,
      authType
    };

  if (String(teamId) !== String(chat.teamId)) return Promise.reject(ChatErrEnum.unAuthChat);
  if (permission.hasManagePer)
    return {
      teamId,
      tmbId,
      chat,
      uid: tmbId,
      ...defaultResponseShow,
      authType
    };
  if (String(tmbId) === String(chat.tmbId))
    return {
      teamId,
      tmbId,
      chat,
      uid: tmbId,
      ...defaultResponseShow,
      authType
    };

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
}): Promise<{
  chatItem: { time: Date; responseData?: ChatHistoryItemResType[] };
}> => {
  try {
    const chatItem = (await MongoChatItem.findOne(
      {
        appId,
        chatId,
        dataId: chatItemDataId
      },
      'responseData time'
    ).lean()) as { time: Date; responseData?: ChatHistoryItemResType[] };

    if (!chatItem) return Promise.reject(DatasetErrEnum.unAuthDatasetCollection);

    // 找 responseData 里，是否有该文档 id
    const responseData = chatItem.responseData || [];
    const flatResData: ChatHistoryItemResType[] =
      responseData
        ?.map((item) => {
          return [
            item,
            ...(item.pluginDetail || []),
            ...(item.toolDetail || []),
            ...(item.loopDetail || [])
          ];
        })
        .flat() || [];

    const quoteListSet = new Set(
      flatResData
        .map((item) => item.quoteList?.map((quote) => String(quote.collectionId)) || [])
        .flat()
    );

    if (collectionIds.every((id) => quoteListSet.has(id))) {
      return {
        chatItem
      };
    }
  } catch (error) {}
  return Promise.reject(DatasetErrEnum.unAuthDatasetFile);
};
