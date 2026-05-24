import { type ChatSchemaType } from '@fastgpt/global/core/chat/type';
import { MongoChat } from '@fastgpt/service/core/chat/chatSchema';
import { type AuthModeType } from '@fastgpt/service/support/permission/type';
import { authOutLink } from './outLink';
import { ChatErrEnum } from '@fastgpt/global/common/error/code/chat';
import { authTeamSpaceToken } from './team';
import { AuthUserTypeEnum, ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import { authApp } from '@fastgpt/service/support/permission/app/auth';
import { MongoChatItem } from '@fastgpt/service/core/chat/chatItemSchema';
import { DatasetErrEnum } from '@fastgpt/global/common/error/code/dataset';
import { ChatRoleEnum } from '@fastgpt/global/core/chat/constants';
import type { HelperBotTypeEnum } from '@fastgpt/global/core/chat/helperBot/type';
import { MongoHelperBotChat } from '@fastgpt/service/core/chat/HelperBot/chatSchema';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { Types } from 'mongoose';

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
 * 校验文档是否来自当前会话引用。
 *
 * 只依赖 ChatItem 上的 citeCollectionIds 判断 collection 是否在当前会话中被引用，
 * 避免读取和解析完整 responseData。
 */
export const authCollectionInChat = async ({
  collectionIds,
  appId,
  chatId
}: {
  collectionIds: string[];
  appId: string;
  chatId: string;
}) => {
  const appObjectId = Types.ObjectId.isValid(String(appId))
    ? new Types.ObjectId(String(appId))
    : appId;
  const targetCollectionIds = collectionIds.map(String);

  const [authResult] = await MongoChatItem.aggregate<{ isAuthorized: boolean }>([
    {
      $match: {
        appId: appObjectId,
        chatId,
        obj: ChatRoleEnum.AI
      }
    },
    { $sort: { _id: -1 } },
    { $limit: 50 },
    { $unwind: '$citeCollectionIds' },
    {
      $group: {
        _id: null,
        citeCollectionIds: { $addToSet: { $toString: '$citeCollectionIds' } }
      }
    },
    {
      $project: {
        _id: 0,
        isAuthorized: { $setIsSubset: [targetCollectionIds, '$citeCollectionIds'] }
      }
    }
  ]);

  if (authResult?.isAuthorized) {
    return;
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
