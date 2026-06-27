import { type ChatSchemaType } from '@fastgpt/global/core/chat/type';
import { MongoChat } from '@fastgpt/service/core/chat/chatSchema';
import { type AuthModeType } from '@fastgpt/service/support/permission/type';
import { authOutLink } from './outLink';
import { ChatErrEnum } from '@fastgpt/global/common/error/code/chat';
import { AuthUserTypeEnum, ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import { authApp } from '@fastgpt/service/support/permission/app/auth';
import { authSkill } from '@fastgpt/service/support/permission/skill/auth';
import { MongoChatItem } from '@fastgpt/service/core/chat/chatItemSchema';
import { DatasetErrEnum } from '@fastgpt/global/common/error/code/dataset';
import { ChatRoleEnum, ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import type { HelperBotTypeEnum } from '@fastgpt/global/core/chat/helperBot/type';
import { MongoHelperBotChat } from '@fastgpt/service/core/chat/HelperBot/chatSchema';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import {
  buildChatSourceAggregateMatch,
  buildChatSourceQuery
} from '@fastgpt/service/core/chat/source';
import type { OutLinkChatAuthProps } from '@fastgpt/global/support/permission/chat';

/* 
  检查chat的权限：
  1. 无 chatId，仅校验 cookie、shareChat 秘钥是否合法
  2. 有 chatId，校验用户是否有权限操作该 chat

  * cookie + appId 校验
  * shareId + outLinkUid 校验

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
  appId?: string;
  shareId?: string;
  outLinkUid?: string;
};

const buildAppChatAuthQuery = (appId: string) =>
  buildChatSourceQuery({
    sourceType: ChatSourceTypeEnum.app,
    sourceId: appId
  });

export async function authChatCrud({
  appId,
  chatId,

  shareId,
  outLinkUid,
  ...props
}: AuthModeType &
  AuthChatCommonProps & {
    chatId?: string;
  }): Promise<{
  appId?: string;
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
  if (shareId && outLinkUid) {
    const {
      outLinkConfig,
      uid,
      appId: shareChatAppId
    } = await authOutLink({ shareId, outLinkUid });

    const resolvedAppId = String(shareChatAppId);
    if (appId && resolvedAppId !== appId) return Promise.reject(ChatErrEnum.unAuthChat);

    if (!chatId) {
      return {
        appId: resolvedAppId,
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

    const chat = await MongoChat.findOne({
      ...buildAppChatAuthQuery(resolvedAppId),
      chatId
    }).lean();

    if (!chat) {
      return {
        appId: resolvedAppId,
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
      appId: resolvedAppId,
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
  if (!appId) return Promise.reject(ChatErrEnum.unAuthChat);

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

  const chat = await MongoChat.findOne({ ...buildAppChatAuthQuery(appId), chatId }).lean();
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

export type ChatTargetAuthParams = AuthModeType & {
  sourceType: ChatSourceTypeEnum;
  sourceId?: string;
  chatId?: string;
  outLinkAuthData?: OutLinkChatAuthProps;
  per?: number;
};

type AuthChatTargetCrudResult = {
  appId?: string;
  sourceType: ChatSourceTypeEnum;
  sourceId: string;
  teamId: string;
  tmbId: string;
  uid: string;
  chat?: ChatSchemaType;
  showCite: boolean;
  showRunningStatus: boolean;
  showSkillReferences: boolean;
  showFullText: boolean;
  canDownloadSource: boolean;
  authType?: `${AuthUserTypeEnum}`;
};

/**
 * 标准 chat target 鉴权入口。
 *
 * API 边界已经把 `appId/skillId` 转换为 `sourceType/sourceId`；这里按 source 类型分发
 * 到现有 App Chat 或 Skill Edit 权限体系，并返回后续 chat 查询需要的 uid/team 信息。
 */
export async function authChatTargetCrud({
  sourceType,
  sourceId,
  chatId,
  outLinkAuthData,
  per = ReadPermissionVal,
  ...props
}: ChatTargetAuthParams): Promise<AuthChatTargetCrudResult> {
  if (sourceType === ChatSourceTypeEnum.app) {
    const authRes = await authChatCrud({
      ...props,
      appId: sourceId,
      chatId,
      ...outLinkAuthData,
      per
    });

    const resolvedSourceId = sourceId ?? authRes.appId;
    if (!resolvedSourceId) return Promise.reject(ChatErrEnum.unAuthChat);

    return {
      ...authRes,
      sourceType,
      sourceId: resolvedSourceId
    };
  }

  if (sourceType === ChatSourceTypeEnum.skillEdit) {
    if (!sourceId) return Promise.reject(ChatErrEnum.unAuthChat);

    const authRes = await authSkill({
      ...props,
      skillId: sourceId,
      per
    });
    const chat =
      (chatId
        ? await MongoChat.findOne({
            ...buildChatSourceQuery({ sourceType, sourceId }),
            chatId
          }).lean()
        : undefined) ?? undefined;

    if (chat && String(chat.teamId) !== String(authRes.teamId)) {
      return Promise.reject(ChatErrEnum.unAuthChat);
    }

    return {
      teamId: authRes.teamId,
      tmbId: authRes.tmbId,
      uid: authRes.tmbId,
      chat,
      showCite: true,
      showRunningStatus: true,
      showSkillReferences: true,
      showFullText: true,
      canDownloadSource: true,
      sourceType,
      sourceId,
      authType: authRes.authType
    };
  }

  const exhaustiveCheck: never = sourceType;
  throw new Error(`Unsupported chat source type: ${exhaustiveCheck}`);
}

/**
 * 校验文档是否来自当前会话引用。
 *
 * 只依赖 ChatItem 上的 citeCollectionIds 判断 collection 是否在当前会话中被引用，
 * 避免读取和解析完整 responseData。
 */
export const authCollectionInChat = async ({
  collectionIds,
  sourceType,
  sourceId,
  chatId
}: {
  collectionIds: string[];
  sourceType: ChatSourceTypeEnum;
  sourceId: string;
  chatId: string;
}) => {
  const targetCollectionIds = collectionIds.map(String);

  const [authResult] = await MongoChatItem.aggregate<{ isAuthorized: boolean }>([
    {
      $match: {
        ...buildChatSourceAggregateMatch({ sourceType, sourceId }),
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
