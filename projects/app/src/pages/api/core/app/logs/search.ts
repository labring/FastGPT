import {
  buildAppChatLogSearchFilter,
  getAppChatLogNextCursor
} from '@fastgpt/service/core/app/logs/utils';
import { NextAPI } from '@/service/middleware/entry';
import type { ApiRequestProps } from '@fastgpt/next/type';
import { getLocale } from '@fastgpt/service/common/middle/i18n';
import {
  SearchAppChatLogsBodySchema,
  SearchAppChatLogsResponseSchema,
  type SearchAppChatLogsResponse
} from '@fastgpt/global/openapi/core/app/log/api';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { getAppChatLogList } from '@fastgpt/service/core/app/logs/service';
import { extendChatPublishSources } from '@fastgpt/service/core/chat/publishSource/service';
import { formatAppChatLogList, getAuthenticatedAppChatLogFilter } from '@/service/core/app/logs';

const SEARCH_PAGE_SIZE = 50;

/** 返回应用日志的固定 50 条游标分页结果，不查询或返回 total。 */
async function handler(req: ApiRequestProps): Promise<SearchAppChatLogsResponse> {
  const body = parseApiInput({
    req,
    bodySchema: SearchAppChatLogsBodySchema
  }).body;
  const { cursor } = body;

  const { teamId, appId, empty, where } = await getAuthenticatedAppChatLogFilter({
    req,
    body
  });

  if (empty) {
    return SearchAppChatLogsResponseSchema.parse({ list: [] });
  }

  const cursorWhere = buildAppChatLogSearchFilter({ where, cursor });

  // 多取一条用于判断是否还有下一页，避免额外 count 查询。
  const pageListResult = await getAppChatLogList({
    appId,
    filter: cursorWhere,
    sort: { updateTime: -1, _id: -1 },
    skip: 0,
    limit: SEARCH_PAGE_SIZE + 1,
    extendPublishSources: (list) => extendChatPublishSources({ list, teamId, appId })
  });
  const hasMore = pageListResult.length > SEARCH_PAGE_SIZE;
  const finalList = await formatAppChatLogList({
    list: pageListResult.slice(0, SEARCH_PAGE_SIZE),
    teamId,
    locale: getLocale(req)
  });

  return SearchAppChatLogsResponseSchema.parse({
    list: finalList,
    nextCursor: getAppChatLogNextCursor({ list: finalList, hasMore })
  });
}

export default NextAPI(handler);
