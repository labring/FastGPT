import { addMonths } from 'date-fns';
import { ChatErrEnum } from '@fastgpt/global/common/error/code/chat';
import { ChatSourceEnum, ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import { AuthUserTypeEnum, ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import type { PermissionValueType } from '@fastgpt/global/support/permission/type';
import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { buildChatSourceQuery } from '@fastgpt/service/core/chat/source';
import { authOutLink } from '../../support/permission/auth/outLink';
import { authTeamSpaceToken } from '../../support/permission/auth/team';
import { authChatTargetCrud } from '../../support/permission/auth/chat';

type ChatHistoryAuthProps = {
  req: ApiRequestProps;
  sourceType?: ChatSourceTypeEnum;
  sourceId?: string;
  chatId?: string;
  shareId?: string;
  outLinkUid?: string;
  teamId?: string;
  teamToken?: string;
  source?: ChatSourceEnum;
  per?: PermissionValueType;
};

/**
 * 将历史会话接口的鉴权上下文转换为 chat 表查询条件。
 *
 * 外链和团队空间仍沿用 App-only 鉴权，并通过真实 appId 生成 source-aware 查询；
 * 标准 App/Skill Edit 请求必须先在 API schema 中转换为 `sourceType/sourceId`。
 */
export async function buildChatHistoryMatch({
  req,
  sourceType,
  sourceId,
  chatId,
  shareId,
  outLinkUid,
  teamId,
  teamToken,
  source,
  per = ReadPermissionVal
}: ChatHistoryAuthProps) {
  if (shareId && outLinkUid) {
    const { uid, appId } = await authOutLink({ shareId, outLinkUid });

    return {
      ...buildChatSourceQuery({
        sourceType: ChatSourceTypeEnum.app,
        sourceId: String(appId)
      }),
      shareId,
      outLinkUid: uid,
      updateTime: {
        $gte: addMonths(new Date(), -1)
      }
    };
  }

  if (sourceType === ChatSourceTypeEnum.app && sourceId && teamId && teamToken) {
    const { uid, tags } = await authTeamSpaceToken({ teamId, teamToken });

    const app = await MongoApp.findOne({
      _id: sourceId,
      teamId,
      $or: [
        { teamTags: { $size: 0 } },
        { teamTags: { $exists: false } },
        { teamTags: { $in: tags } }
      ]
    }).lean();
    if (!app) return undefined;

    return {
      ...buildChatSourceQuery({ sourceType, sourceId }),
      outLinkUid: uid,
      source: ChatSourceEnum.team
    };
  }

  if (!sourceType || !sourceId) {
    return undefined;
  }

  const { tmbId, uid, authType } = await authChatTargetCrud({
    req,
    authToken: true,
    authApiKey: true,
    sourceType,
    sourceId,
    chatId,
    shareId,
    outLinkUid,
    teamId,
    teamToken,
    per
  });

  return {
    ...buildChatSourceQuery({ sourceType, sourceId }),
    ...(authType === AuthUserTypeEnum.outLink || authType === AuthUserTypeEnum.teamDomain
      ? { outLinkUid: uid }
      : { tmbId }),
    ...(source && { source })
  };
}

/**
 * 构造“清空历史”接口的范围。
 *
 * App 清空保持旧语义：网页登录只清 `online`，API Key 只清 `api`；
 * Skill Edit 没有 App 入口来源区分，只按 skill source 和当前成员清理。
 */
export async function buildClearChatHistoriesMatch({
  req,
  sourceType,
  sourceId,
  shareId,
  outLinkUid,
  teamId,
  teamToken
}: ChatHistoryAuthProps) {
  const match = await buildChatHistoryMatch({
    req,
    sourceType,
    sourceId,
    shareId,
    outLinkUid,
    teamId,
    teamToken
  });
  if (!match) return undefined;

  if (shareId && outLinkUid) {
    return match;
  }

  if (!sourceType || !sourceId) {
    return undefined;
  }

  const { tmbId, uid, authType } = await authChatTargetCrud({
    req,
    authToken: true,
    authApiKey: true,
    sourceType,
    sourceId,
    shareId,
    outLinkUid,
    teamId,
    teamToken
  });

  if (authType === AuthUserTypeEnum.outLink || authType === AuthUserTypeEnum.teamDomain) {
    return {
      ...buildChatSourceQuery({ sourceType, sourceId }),
      outLinkUid: uid
    };
  }

  if (sourceType === ChatSourceTypeEnum.skillEdit) {
    return {
      ...buildChatSourceQuery({ sourceType, sourceId }),
      tmbId
    };
  }

  if (authType === AuthUserTypeEnum.token) {
    return {
      ...buildChatSourceQuery({ sourceType, sourceId }),
      tmbId,
      source: ChatSourceEnum.online
    };
  }

  if (authType === AuthUserTypeEnum.apikey) {
    return {
      ...buildChatSourceQuery({ sourceType, sourceId }),
      source: ChatSourceEnum.api
    };
  }

  return Promise.reject(ChatErrEnum.unAuthChat);
}
