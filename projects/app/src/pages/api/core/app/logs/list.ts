import { NextAPI } from '@/service/middleware/entry';
import { parsePaginationRequest } from '@fastgpt/service/common/api/pagination';
import type { ApiRequestProps } from '@fastgpt/next/type';
import { getLocale } from '@fastgpt/service/common/middle/i18n';
import {
  GetAppChatLogsBodySchema,
  GetAppChatLogsResponseSchema,
  type getAppChatLogsResponseType
} from '@fastgpt/global/openapi/core/app/log/api';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { getAppChatLogList } from '@fastgpt/service/core/app/logs/service';
import { countAppChatLogs } from '@fastgpt/service/core/app/logs/entity';
import { extendChatPublishSources } from '@fastgpt/service/core/chat/publishSource/service';
import { formatAppChatLogList, getAuthenticatedAppChatLogFilter } from '@/service/core/app/logs';

/** 返回应用日志的 offset 分页结果，并保留已有 total 契约。 */
async function handler(req: ApiRequestProps): Promise<getAppChatLogsResponseType> {
  const body = parseApiInput({
    req,
    bodySchema: GetAppChatLogsBodySchema
  }).body;

  const { pageSize = 20, offset } = parsePaginationRequest(req);

  const { teamId, appId, empty, where } = await getAuthenticatedAppChatLogFilter({
    req,
    body
  });

  if (empty) {
    return GetAppChatLogsResponseSchema.parse({ list: [], total: 0 });
  }

  // Execute both queries
  const [listResult, total] = await Promise.all([
    getAppChatLogList({
      appId,
      filter: where,
      sort: { updateTime: -1 },
      skip: offset,
      limit: pageSize,
      extendPublishSources: (list) => extendChatPublishSources({ list, teamId, appId })
    }),
    countAppChatLogs(where)
  ]);
  const finalList = await formatAppChatLogList({
    list: listResult,
    teamId,
    locale: getLocale(req)
  });

  return GetAppChatLogsResponseSchema.parse({
    list: finalList,
    total
  });
}

export default NextAPI(handler);
