import { ObjectIdSchema } from '@fastgpt/global/common/type/mongo';
import {
  GetLogUsersBodySchema,
  SearchAppChatLogsBodySchema,
  type GetLogUsersResponse,
  type SearchAppChatLogsResponse
} from '@fastgpt/global/openapi/core/app/log/api';
import type { FastGptHttpClient } from '../../infra/http/fastgpt-http-client';
import { CliArgumentError } from '../../shared/errors';
import { buildPaginationMeta, trimIfString } from '../../shared/input';
import { createSuccessResult } from '../../shared/result';
import type { CliResult, ResolvedCredential } from '../../shared/types';

const DEFAULT_LOG_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

function resolveLogsAppId({
  appId,
  credential
}: {
  appId?: string;
  credential?: Pick<ResolvedCredential, 'kind' | 'boundAppId'>;
}): string | undefined {
  const trimmed = trimIfString(appId);
  if (!trimmed && credential?.kind !== 'appKey' && credential?.kind !== 'unknownApiKey') {
    throw new CliArgumentError(
      'Agent ID is required for a user session or personal API Key.',
      undefined,
      'Pass <agentId> or --id <agentId>.'
    );
  }
  if (trimmed) {
    ObjectIdSchema.parse(trimmed);
  }
  if (
    credential?.kind === 'appKey' &&
    credential.boundAppId &&
    trimmed &&
    trimmed !== credential.boundAppId
  ) {
    throw new CliArgumentError('Agent ID does not match the Agent bound to the active API Key.');
  }
  return trimmed;
}

/** 缺省时间窗口为最近 7 天，避免直接查询日志时必须手写起止时间戳。 */
function resolveLogDateRange({ dateStart, dateEnd }: { dateStart?: string; dateEnd?: string }): {
  dateStart: string;
  dateEnd: string;
} {
  const trimmedStart = trimIfString(dateStart);
  const trimmedEnd = trimIfString(dateEnd);

  if (trimmedStart && trimmedEnd) {
    return { dateStart: trimmedStart, dateEnd: trimmedEnd };
  }

  const now = new Date();
  if (trimmedStart && !trimmedEnd) {
    return { dateStart: trimmedStart, dateEnd: now.toISOString() };
  }
  if (!trimmedStart && trimmedEnd) {
    const endDate = new Date(trimmedEnd);
    const startIso = Number.isNaN(endDate.getTime())
      ? new Date(now.getTime() - DEFAULT_LOG_WINDOW_MS).toISOString()
      : new Date(endDate.getTime() - DEFAULT_LOG_WINDOW_MS).toISOString();
    return { dateStart: startIso, dateEnd: trimmedEnd };
  }

  return {
    dateStart: new Date(now.getTime() - DEFAULT_LOG_WINDOW_MS).toISOString(),
    dateEnd: now.toISOString()
  };
}

export type AgentLogsService = {
  list: (params: {
    client: FastGptHttpClient;
    credential?: Pick<ResolvedCredential, 'kind' | 'boundAppId'>;
    input: {
      appId?: string;
      dateStart?: string;
      dateEnd?: string;
      sources?: string[];
      tmbIds?: string[];
      outLinkUids?: string[];
      chatSearch?: string;
      searchType?: string;
      feedbackType?: string;
      unreadOnly?: boolean;
      errorFilter?: string;
      cursor?: unknown;
    };
  }) => Promise<CliResult<SearchAppChatLogsResponse>>;
  listUsers: (params: {
    client: FastGptHttpClient;
    credential?: Pick<ResolvedCredential, 'kind' | 'boundAppId'>;
    input: {
      appId?: string;
      dateStart?: string;
      dateEnd?: string;
      searchKey?: string;
      sources?: string[];
      page?: number;
      pageSize?: number;
    };
  }) => Promise<CliResult<GetLogUsersResponse>>;
};

/**
 * FastGPT Agent 对话日志领域服务：封装游标搜索（`logs/search`）与日志使用者聚合分页（`logs/getUsers`）。
 */
export function createAgentLogsService(): AgentLogsService {
  return {
    list: async ({ client, credential, input }) => {
      const appId = resolveLogsAppId({ appId: input.appId, credential });
      const { dateStart, dateEnd } = resolveLogDateRange({
        dateStart: input.dateStart,
        dateEnd: input.dateEnd
      });

      const validatedBody = SearchAppChatLogsBodySchema.parse({
        ...(appId !== undefined ? { appId } : {}),
        dateStart,
        dateEnd,
        ...(input.sources !== undefined ? { sources: input.sources } : {}),
        ...(input.tmbIds !== undefined ? { tmbIds: input.tmbIds } : {}),
        ...(input.outLinkUids !== undefined ? { outLinkUids: input.outLinkUids } : {}),
        ...(input.chatSearch !== undefined ? { chatSearch: input.chatSearch } : {}),
        ...(input.searchType !== undefined ? { searchType: input.searchType } : {}),
        ...(input.feedbackType !== undefined ? { feedbackType: input.feedbackType } : {}),
        ...(input.unreadOnly !== undefined ? { unreadOnly: input.unreadOnly } : {}),
        ...(input.errorFilter !== undefined ? { errorFilter: input.errorFilter } : {}),
        ...(input.cursor !== undefined ? { cursor: input.cursor } : {})
      });

      const data = await client.request<SearchAppChatLogsResponse>({
        method: 'POST',
        path: '/core/app/logs/search',
        body: validatedBody
      });

      return createSuccessResult({
        data,
        meta: {
          count: data.list.length,
          hasMore: Boolean(data.nextCursor),
          ...(data.nextCursor ? { nextCursor: data.nextCursor } : {})
        }
      });
    },

    listUsers: async ({ client, credential, input }) => {
      const appId = resolveLogsAppId({ appId: input.appId, credential });
      const { dateStart, dateEnd } = resolveLogDateRange({
        dateStart: input.dateStart,
        dateEnd: input.dateEnd
      });

      const validatedBody = GetLogUsersBodySchema.parse({
        ...(appId !== undefined ? { appId } : {}),
        dateStart,
        dateEnd,
        ...(input.searchKey !== undefined ? { searchKey: input.searchKey } : {}),
        ...(input.sources !== undefined ? { sources: input.sources } : {}),
        ...(input.page !== undefined ? { pageNum: input.page } : {}),
        ...(input.pageSize !== undefined ? { pageSize: input.pageSize } : {})
      });

      const data = await client.request<GetLogUsersResponse>({
        method: 'POST',
        path: '/core/app/logs/getUsers',
        body: validatedBody
      });

      return createSuccessResult({
        data,
        meta: buildPaginationMeta({
          validatedBody: validatedBody as Record<string, unknown>,
          total: data.total,
          count: data.list.length
        })
      });
    }
  };
}
