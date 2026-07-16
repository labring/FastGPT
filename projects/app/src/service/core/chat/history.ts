import { addMonths } from 'date-fns';
import { ChatErrEnum } from '@fastgpt/global/common/error/code/chat';
import { ChatSourceEnum, ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import { AuthUserTypeEnum, ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import type { PermissionValueType } from '@fastgpt/global/support/permission/type';
import type { ApiRequestProps } from '@fastgpt/next/types';
import { buildChatSourceQuery } from '@fastgpt/service/core/chat/source';
import { authChatTargetCrud } from '../../support/permission/auth/chat';
import type { OutLinkChatAuthProps } from '@fastgpt/global/support/permission/chat';

type ChatHistoryAuthProps = {
  req: ApiRequestProps;
  sourceType?: ChatSourceTypeEnum;
  sourceId?: string;
  chatId?: string;
  outLinkAuthData?: OutLinkChatAuthProps;
  source?: ChatSourceEnum;
  per?: PermissionValueType;
};

type ClearChatHistoriesAuthProps = Omit<ChatHistoryAuthProps, 'sourceType'> & {
  sourceType: ChatSourceTypeEnum;
};

/**
 * 将历史会话接口的鉴权上下文转换为 chat 表查询条件。
 *
 * 外链仍沿用 App-only 鉴权，并通过真实 appId 生成 source-aware 查询；
 * 标准 App/Skill Edit 请求必须先在 API schema 中转换为 `sourceType/sourceId`。
 */
export async function buildChatHistoryMatch({
  req,
  sourceType,
  sourceId,
  chatId,
  outLinkAuthData,
  source,
  per = ReadPermissionVal
}: ChatHistoryAuthProps) {
  const hasShareAuth = !!(outLinkAuthData?.shareId && outLinkAuthData?.outLinkUid);
  const authSourceType = sourceType ?? (hasShareAuth ? ChatSourceTypeEnum.app : undefined);

  if (!authSourceType || (!sourceId && !hasShareAuth)) {
    return undefined;
  }

  const {
    sourceType: resolvedSourceType,
    sourceId: resolvedSourceId,
    tmbId,
    uid,
    authType
  } = await authChatTargetCrud({
    req,
    authToken: true,
    authApiKey: true,
    sourceType: authSourceType,
    sourceId,
    chatId,
    outLinkAuthData,
    per
  });

  if (authType === AuthUserTypeEnum.outLink) {
    return {
      ...buildChatSourceQuery({ sourceType: resolvedSourceType, sourceId: resolvedSourceId }),
      shareId: outLinkAuthData?.shareId,
      outLinkUid: uid,
      updateTime: {
        $gte: addMonths(new Date(), -1)
      }
    };
  }

  return {
    ...buildChatSourceQuery({ sourceType: resolvedSourceType, sourceId: resolvedSourceId }),
    tmbId,
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
  outLinkAuthData
}: ClearChatHistoriesAuthProps) {
  const match = await buildChatHistoryMatch({
    req,
    sourceType,
    sourceId,
    outLinkAuthData
  });
  if (!match) return undefined;

  if (outLinkAuthData?.shareId && outLinkAuthData?.outLinkUid) {
    return match;
  }

  if (!sourceId) {
    return undefined;
  }

  const {
    sourceType: resolvedSourceType,
    sourceId: resolvedSourceId,
    tmbId,
    uid,
    authType
  } = await authChatTargetCrud({
    req,
    authToken: true,
    authApiKey: true,
    sourceType,
    sourceId,
    outLinkAuthData
  });

  if (authType === AuthUserTypeEnum.outLink) {
    return {
      ...buildChatSourceQuery({ sourceType: resolvedSourceType, sourceId: resolvedSourceId }),
      outLinkUid: uid
    };
  }

  if (sourceType === ChatSourceTypeEnum.skillEdit) {
    return {
      ...buildChatSourceQuery({ sourceType: resolvedSourceType, sourceId: resolvedSourceId }),
      tmbId
    };
  }

  if (authType === AuthUserTypeEnum.token) {
    return {
      ...buildChatSourceQuery({ sourceType: resolvedSourceType, sourceId: resolvedSourceId }),
      tmbId,
      source: ChatSourceEnum.online
    };
  }

  if (authType === AuthUserTypeEnum.apikey) {
    return {
      ...buildChatSourceQuery({ sourceType: resolvedSourceType, sourceId: resolvedSourceId }),
      source: ChatSourceEnum.api
    };
  }

  return Promise.reject(ChatErrEnum.unAuthChat);
}
