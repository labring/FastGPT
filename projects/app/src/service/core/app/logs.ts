import { getChatPublishSourceType } from '@fastgpt/global/common/chat/publishSource';
import { formatSourceMember } from '@fastgpt/service/support/user/utils';
import { getTeamMemberMap } from '@fastgpt/service/support/user/team/utils';
import { getLocationFromIp } from '@fastgpt/service/common/geo';
import type { AppLogsListItemType } from '@fastgpt/global/openapi/core/app/log/api';
import { ChatSourceEnum } from '@fastgpt/global/core/chat/constants';
import { getDisplayChatTitle } from '@fastgpt/service/core/chat/title';
import type { localeType } from '@fastgpt/global/common/i18n/type';
import type { ApiRequestProps } from '@fastgpt/next/type';
import { authApp } from '@fastgpt/service/support/permission/app/auth';
import { AppReadChatLogPerVal } from '@fastgpt/global/support/permission/app/constant';
import { buildAppChatLogFilter } from '@fastgpt/service/core/app/logs/utils';
import { isUnselectedLogUserFilter } from '@fastgpt/global/core/app/logs/utils';
import type {
  getAppChatLogsBody,
  SearchAppChatLogsBody
} from '@fastgpt/global/openapi/core/app/log/api';

/** 完成日志查询鉴权和筛选构造；列表与游标搜索共用同一业务边界。 */
export const getAuthenticatedAppChatLogFilter = async ({
  req,
  body
}: {
  req: ApiRequestProps;
  body: Omit<getAppChatLogsBody, 'pageNum' | 'pageSize'> | SearchAppChatLogsBody;
}) => {
  const {
    appId: requestedAppId,
    dateStart,
    dateEnd,
    sources,
    tmbIds,
    outLinkUids,
    chatSearch,
    feedbackType,
    unreadOnly,
    errorFilter
  } = body;
  const { teamId, appId } = await authApp({
    req,
    authToken: true,
    authApiKey: true,
    authAppApiKey: true,
    appId: requestedAppId,
    per: AppReadChatLogPerVal
  });
  const empty = isUnselectedLogUserFilter(tmbIds, outLinkUids);
  const where = empty
    ? {}
    : buildAppChatLogFilter({
        appId,
        dateStart,
        dateEnd,
        sources,
        tmbIds,
        outLinkUids,
        chatSearch,
        feedbackType,
        unreadOnly,
        errorFilter
      });

  return { teamId, appId, empty, where };
};

/** 给日志聚合行补齐渠道、地区、成员和展示标题；分页协议由各 API 路由负责。 */
export const formatAppChatLogList = async ({
  list,
  teamId,
  locale
}: {
  list: AppLogsListItemType[];
  teamId: string;
  locale: localeType;
}) => {
  const listWithRegion = list.map((item) => {
    const originIp = item.region;
    const region = getLocationFromIp(originIp ?? undefined, locale);

    return {
      ...item,
      originIp,
      region: region ?? originIp
    };
  });

  // 一次读取本页鉴权者及分享访客，且限制在已鉴权团队中。
  const memberIds = listWithRegion
    .flatMap((item) => [
      item.tmbId,
      ...(getChatPublishSourceType(item) === ChatSourceEnum.share && item.outLinkUid
        ? [item.outLinkUid]
        : [])
    ])
    .filter((id): id is string => typeof id === 'string');
  const memberMap = await getTeamMemberMap({
    teamId,
    memberIds,
    fields: '_id name avatar status'
  });

  return listWithRegion.map((item) => {
    const member = memberMap.get(String(item.tmbId));
    const authMember = member ? formatSourceMember(member) : undefined;
    // sourceMember 保留旧接口语义；authMember 始终属于 tmbId，不被外链访客覆盖。
    const sourceMember = (() => {
      if (getChatPublishSourceType(item) !== ChatSourceEnum.share || !item.outLinkUid)
        return authMember;
      const visitor = memberMap.get(String(item.outLinkUid));
      return visitor ? formatSourceMember(visitor) : undefined;
    })();
    return {
      ...item,
      authMember,
      sourceMember,
      title: getDisplayChatTitle({ customTitle: item.customTitle, title: item.title })
    };
  });
};
