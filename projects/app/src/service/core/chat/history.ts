import { buildChatPublishSourceFilter } from '@fastgpt/service/core/chat/publishSource/utils';
import { addMonths } from 'date-fns';
import { ChatErrEnum } from '@fastgpt/global/common/error/code/chat';
import { isAuxiliaryGenerationSourceType } from '@fastgpt/global/common/chat/source';
import { ChatSourceEnum, ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import { AuthUserTypeEnum, ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import type { PermissionValueType } from '@fastgpt/global/support/permission/type';
import type { ApiRequestProps } from '@fastgpt/next/type';
import { buildChatSourceQuery } from '@fastgpt/service/core/chat/source';
import { authChatTargetCrud } from '@fastgpt/service/core/chat/auth';
import type { ChatAuthProxy, OutLinkChatAuthProps } from '@fastgpt/global/support/permission/chat';
import { ApiKeyTypeEnum } from '@fastgpt/global/support/openapi/constants';

type ChatHistoryAuthProps = {
  req: ApiRequestProps;
  sourceType?: ChatSourceTypeEnum;
  sourceId?: string;
  chatId?: string;
  customUid?: string;
  authProxy?: ChatAuthProxy;
  outLinkAuthData?: OutLinkChatAuthProps;
  source?: ChatSourceEnum;
  per?: PermissionValueType;
};

type ClearChatHistoriesAuthProps = Omit<ChatHistoryAuthProps, 'sourceType'> & {
  sourceType: ChatSourceTypeEnum;
};

/**
 * 一次完成历史会话鉴权并构造查询条件，供列表操作和清空历史复用。
 *
 * 外链仍沿用 App-only 鉴权，并通过真实 appId 生成 source-aware 查询；
 * 标准 App/Skill Edit 请求必须先在 API schema 中转换为 `sourceType/sourceId`。
 */
async function getChatHistoryContext({
  req,
  sourceType,
  sourceId,
  chatId,
  customUid,
  authProxy,
  outLinkAuthData,
  source,
  per = ReadPermissionVal
}: ChatHistoryAuthProps) {
  const hasShareAuth = !!(outLinkAuthData?.shareId && outLinkAuthData?.outLinkUid);
  const authSourceType = sourceType ?? (hasShareAuth ? ChatSourceTypeEnum.app : undefined);

  if (
    !authSourceType ||
    (!sourceId && !hasShareAuth && authSourceType !== ChatSourceTypeEnum.app)
  ) {
    return undefined;
  }

  const {
    sourceType: resolvedSourceType,
    sourceId: resolvedSourceId,
    tmbId,
    uid,
    authType,
    publishSource,
    scope,
    apiKeyType
  } = await authChatTargetCrud({
    req,
    authToken: true,
    authApiKey: true,
    sourceType: authSourceType,
    sourceId,
    chatId,
    customUid,
    authProxy,
    outLinkAuthData,
    per
  });

  const match =
    authType === AuthUserTypeEnum.outLink
      ? {
          ...buildChatSourceQuery({ sourceType: resolvedSourceType, sourceId: resolvedSourceId }),
          'publishSource.type': ChatSourceEnum.share,
          'publishSource.id': publishSource!.id!,
          outLinkUid: uid,
          updateTime: { $gte: addMonths(new Date(), -1) }
        }
      : {
          ...buildChatSourceQuery({ sourceType: resolvedSourceType, sourceId: resolvedSourceId }),
          ...scope,
          ...(apiKeyType === ApiKeyTypeEnum.app ? {} : { tmbId }),
          ...(source && { $and: [buildChatPublishSourceFilter([source])] })
        };
  return { match, authType, resolvedSourceType, resolvedSourceId, apiKeyType };
}

/** 历史列表、改名和软删除默认使用当前成员范围；外链沿用发布身份和时间范围。 */
export async function buildChatHistoryMatch(props: ChatHistoryAuthProps) {
  return (await getChatHistoryContext(props))?.match;
}

/** 应用 Key 的会话列表固定为 API 来源，显式 appId 分支携带的 source 也不能改变查询范围。 */
export async function buildChatHistoryListMatch(props: ChatHistoryAuthProps) {
  const context = await getChatHistoryContext(props);
  if (context?.apiKeyType !== ApiKeyTypeEnum.app) return context?.match;

  return {
    ...context.match,
    $and: [buildChatPublishSourceFilter([ChatSourceEnum.api])]
  };
}

/**
 * 构造“清空历史”接口的范围。
 *
 * App 清空保持旧语义：网页登录只清 `online`，API Key 只清 `api`；
 * Skill Edit 和辅助生成只按资源来源及当前成员清理。
 */
export async function buildClearChatHistoriesMatch({
  req,
  sourceType,
  sourceId,
  customUid,
  authProxy,
  outLinkAuthData
}: ClearChatHistoriesAuthProps) {
  const context = await getChatHistoryContext({
    req,
    sourceType,
    sourceId,
    customUid,
    authProxy,
    outLinkAuthData
  });
  if (!context) return undefined;
  const { match, authType, resolvedSourceType, resolvedSourceId, apiKeyType } = context;

  // 辅助生成和 Skill 的会话不按 online/api 入口分组，直接复用同一次鉴权的成员范围。
  if (
    authType === AuthUserTypeEnum.outLink ||
    sourceType === ChatSourceTypeEnum.skillEdit ||
    isAuxiliaryGenerationSourceType(sourceType)
  ) {
    return match;
  }
  if (authType === AuthUserTypeEnum.token)
    return {
      ...match,
      $and: [buildChatPublishSourceFilter([ChatSourceEnum.online])]
    };
  if (authType === AuthUserTypeEnum.apikey) {
    // 普通 App 的 API 清空保留原有整应用 api 记录语义。
    return {
      ...(apiKeyType === ApiKeyTypeEnum.app || customUid !== undefined || authProxy !== undefined
        ? match
        : {}),
      ...buildChatSourceQuery({ sourceType: resolvedSourceType, sourceId: resolvedSourceId }),
      $and: [buildChatPublishSourceFilter([ChatSourceEnum.api])]
    };
  }
  return Promise.reject(ChatErrEnum.unAuthChat);
}
