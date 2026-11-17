import z from 'zod';
import { IntSchema } from '@fastgpt/global/common/zod';
import { PaginationPageSizeSchema } from '@fastgpt/global/openapi/api';
import { ChatIdSchema } from '@fastgpt/global/core/chat/schema';
import type { ChatHistoryItemResType } from '@fastgpt/global/core/chat/type';
import {
  CompletionsPropsSchema,
  type CompletionsResponseType
} from '@fastgpt/global/openapi/core/chat/completion/api';
import {
  InitChatQueryRawSchema,
  StopV2ChatRawSchema,
  type InitChatResponseType,
  type StopV2ChatResponse
} from '@fastgpt/global/openapi/core/chat/controler/api';
import {
  DelChatHistoryRawSchema,
  GetHistoriesBodyRawSchema,
  GetHistoryStatusBodyRawSchema,
  MarkChatReadBodyRawSchema,
  UpdateHistoryBodyRawSchema,
  type GetHistoriesResponseType,
  type GetHistoryStatusResponseType
} from '@fastgpt/global/openapi/core/chat/history/api';
import {
  GetRecordsV2BodyRawSchema,
  GetResDataQueryRawSchema,
  type GetRecordsV2ResponseType
} from '@fastgpt/global/openapi/core/chat/record/api';
import type { ResolvedCredential } from '../auth/auth-resolver';
import type { FastGptHttpClient } from '../../infra/http/fastgpt-http-client';
import { CliArgumentError } from '../../shared/errors';
import { redactValue } from '../../shared/redact';
import { createChangedResult, createDryRunResult, createSuccessResult } from '../../shared/result';
import type { CliResult, CliRiskLevel } from '../../shared/types';

const CHAT_OPERATIONS = {
  run: {
    method: 'POST',
    path: '/v2/chat/completions',
    schema: CompletionsPropsSchema,
    risk: 'write'
  },
  stop: { method: 'POST', path: '/v2/chat/stop', schema: StopV2ChatRawSchema, risk: 'write' },
  init: { method: 'GET', path: '/core/chat/init', schema: InitChatQueryRawSchema, risk: 'read' },
  'history list': {
    method: 'POST',
    path: '/core/chat/history/getHistories',
    schema: GetHistoriesBodyRawSchema,
    risk: 'read'
  },
  'history status': {
    method: 'POST',
    path: '/core/chat/history/getHistoryStatus',
    schema: GetHistoryStatusBodyRawSchema,
    risk: 'read'
  },
  'history mark-read': {
    method: 'POST',
    path: '/core/chat/history/markRead',
    schema: MarkChatReadBodyRawSchema,
    risk: 'write'
  },
  'history update': {
    method: 'PUT',
    path: '/core/chat/history/updateHistory',
    schema: UpdateHistoryBodyRawSchema,
    risk: 'write'
  },
  'history delete': {
    method: 'DELETE',
    path: '/core/chat/history/delHistory',
    schema: DelChatHistoryRawSchema,
    risk: 'destructive'
  },
  'record list': {
    method: 'POST',
    path: '/core/chat/record/getRecords_v2',
    schema: GetRecordsV2BodyRawSchema,
    risk: 'read'
  },
  'record detail': {
    method: 'GET',
    path: '/core/chat/record/getResData',
    schema: GetResDataQueryRawSchema,
    risk: 'read'
  }
} as const satisfies Record<
  string,
  {
    method: 'GET' | 'POST' | 'PUT' | 'DELETE';
    path: string;
    schema: z.ZodType;
    risk: CliRiskLevel;
  }
>;

export type ChatOperation = keyof typeof CHAT_OPERATIONS;

type ChatResponseByOperation = {
  run: CompletionsResponseType;
  stop: StopV2ChatResponse;
  init: InitChatResponseType;
  'history list': GetHistoriesResponseType;
  'history status': GetHistoryStatusResponseType;
  'history mark-read': null;
  'history update': null;
  'history delete': null;
  'record list': GetRecordsV2ResponseType;
  'record detail': ChatHistoryItemResType[];
};

export type ChatService = {
  execute: (params: {
    operation: ChatOperation;
    client: FastGptHttpClient;
    input: unknown;
    credential?: Pick<ResolvedCredential, 'kind' | 'boundAppId'>;
    dryRun?: boolean;
    timeoutMs?: unknown;
  }) => Promise<CliResult>;
};

/**
 * App 会话的 OpenAPI 适配器。复用 raw schema 校验对外载荷，不发送内部 source 字段。
 * 写操作预览只在本地执行；生成请求保持 JSON 响应且不自动重试，避免重复生成或计费。
 */
export function createChatService(): ChatService {
  return {
    execute: async ({ operation, client, input, credential, dryRun, timeoutMs }) => {
      const definition = CHAT_OPERATIONS[operation];
      const payload = z.record(z.string(), z.unknown()).parse(input);

      // 即使通过 JSON 文件调用，也不能切换到其他会话目标或内部运行参数。
      const unsupported = [
        'skillId',
        'sourceType',
        'sourceId',
        'shareId',
        'outLinkUid',
        'outLinkAuthData'
      ];
      if (unsupported.some((key) => payload[key] !== undefined)) {
        throw new CliArgumentError(
          'Chat commands only accept App conversations. Use appId to select an App.'
        );
      }
      if (
        payload.appId === undefined &&
        credential?.kind !== 'appKey' &&
        credential?.kind !== 'unknownApiKey'
      ) {
        throw new CliArgumentError('--appId is required for a user session or personal API Key.');
      }
      if (
        credential?.kind === 'appKey' &&
        credential.boundAppId &&
        payload.appId !== undefined &&
        payload.appId !== credential.boundAppId
      ) {
        throw new CliArgumentError('--appId does not match the App bound to the active API Key.');
      }
      if (
        payload.authProxy !== undefined &&
        (credential?.kind === 'appKey' || credential?.kind === 'token')
      ) {
        throw new CliArgumentError('--authProxy requires an enabled personal API Key.');
      }
      if (payload.customUid !== undefined && credential?.kind === 'token') {
        throw new CliArgumentError('--customUid requires an API Key.');
      }

      if (operation === 'run') {
        if (payload.stream !== undefined && payload.stream !== false) {
          throw new CliArgumentError('chat run returns JSON; stream must be false.');
        }
        payload.stream = false;
      }
      if (operation === 'record list' || operation === 'record detail') {
        // 接口为兼容旧客户端允许缺省 chatId；CLI 显式要求，避免把空结果误认为真实记录。
        payload.chatId = ChatIdSchema.min(1).parse(payload.chatId);
      }
      if (operation === 'record detail') {
        payload.dataId = z.string().min(1).parse(payload.dataId);
      }
      if (operation === 'record list') {
        if (payload.role !== undefined)
          throw new CliArgumentError(
            'Anchor roles are determined by pagination direction; do not provide role.'
          );
        if (payload.type !== undefined && payload.type !== 'normal') {
          throw new CliArgumentError('App record queries use the normal record type.');
        }
        const cursors = ['initialId', 'prevId', 'nextId'].filter(
          (key) => payload[key] !== undefined
        );
        if (cursors.length > 1) {
          throw new CliArgumentError('Use only one of --initialId, --prevId, or --nextId.');
        }
        for (const key of cursors) payload[key] = z.string().min(1).parse(payload[key]);
      }
      if (
        operation === 'history update' &&
        ['title', 'customTitle', 'top'].every((key) => payload[key] === undefined)
      ) {
        throw new CliArgumentError(
          'Provide --title, --customTitle, or --top to update the App conversation.'
        );
      }

      // 默认值和分页截断沿用接口；GET/DELETE 的代理身份按 Query 契约传 JSON 字符串。
      const isQuery = definition.method === 'GET' || definition.method === 'DELETE';
      const validated = definition.schema.parse({
        ...payload,
        ...(isQuery && payload.authProxy !== undefined
          ? { authProxy: JSON.stringify(payload.authProxy) }
          : {})
      });
      const request = {
        method: definition.method,
        path: definition.path,
        ...(isQuery
          ? {
              query: Object.fromEntries(
                Object.entries(validated).map(([key, value]) => [
                  key,
                  typeof value === 'object' && value !== null ? JSON.stringify(value) : value
                ])
              ) as Record<string, string | number | boolean | undefined>
            }
          : { body: validated }),
        ...(operation === 'run'
          ? {
              timeoutMs: IntSchema.positive()
                .max(2_147_483_647)
                .parse(timeoutMs ?? 300_000)
            }
          : {})
      };

      if (dryRun && definition.risk !== 'read') {
        return createDryRunResult({
          operation: `chat ${operation}`,
          risk: definition.risk,
          preview: redactValue(request)
        });
      }

      const data = await client.request<ChatResponseByOperation[ChatOperation]>(request);
      const meta = (() => {
        if (operation === 'history list') {
          const page = data as GetHistoriesResponseType;
          const parsed = validated as z.infer<typeof GetHistoriesBodyRawSchema>;
          const pageSize = PaginationPageSizeSchema.parse(parsed.pageSize);
          const offset = parsed.offset ?? ((parsed.pageNum ?? 1) - 1) * pageSize;
          return {
            total: page.total,
            count: page.list.length,
            pageSize,
            offset,
            page: parsed.offset === undefined ? (parsed.pageNum ?? 1) : undefined,
            hasMore: offset + page.list.length < page.total
          };
        }
        if (operation === 'record list') {
          const page = data as GetRecordsV2ResponseType;
          return {
            total: page.total,
            count: page.list.length,
            pageSize: Reflect.get(validated, 'pageSize'),
            hasMorePrev: page.hasMorePrev,
            hasMoreNext: page.hasMoreNext,
            prevCursor: page.prevCursor,
            nextCursor: page.nextCursor
          };
        }
        return undefined;
      })();

      return definition.risk === 'read'
        ? createSuccessResult({ data, meta })
        : createChangedResult({
            data,
            ...(operation === 'stop'
              ? { message: 'Stop signal written; the App workflow may still be finishing.' }
              : {})
          });
    }
  };
}
