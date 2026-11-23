import z from 'zod';
import { DateSchema } from '@fastgpt/global/common/zod';
import { AppLogKeysEnum, AppLogTimespanEnum } from '@fastgpt/global/core/app/logs/constants';
import { ChatSourceEnum } from '@fastgpt/global/core/chat/constants';
import {
  AppChatLogsSearchCursorSchema,
  ExportChatLogsBodySchema,
  GetAppChatLogsBodySchema,
  GetChartDataBodySchema,
  GetLogUsersBodySchema,
  GetTotalDataQuerySchema,
  SearchAppChatLogsBodySchema,
  type AppChatLogsSearchCursor,
  type GetLogUsersResponse,
  type SearchAppChatLogsResponse,
  type getAppChatLogsResponseType,
  type getChartDataResponse,
  type getTotalDataResponse
} from '@fastgpt/global/openapi/core/app/log/api';
import type { FileIoAdapter } from '../../infra/fs/file-io';
import {
  LONG_OPERATION_TIMEOUT_MS,
  parseFastGptEnvelopeError,
  type FastGptHttpClient,
  type RawHttpResponse
} from '../../infra/http/fastgpt-http-client';
import { CliApiError, CliArgumentError } from '../../shared/errors';
import { buildPaginationMeta } from '../../shared/input';
import { redactText } from '../../shared/redact';
import { createSuccessResult } from '../../shared/result';
import type { CliResult } from '../../shared/types';
import type { ResolvedCredential } from '../auth/auth-resolver';

const DEFAULT_LOGS_DAYS = 7;

const APP_LOG_KEY_HEADER_LABELS: Record<AppLogKeysEnum, string> = {
  [AppLogKeysEnum.SOURCE]: AppLogKeysEnum.SOURCE,
  [AppLogKeysEnum.PUBLISH_SOURCE_TYPE]: AppLogKeysEnum.PUBLISH_SOURCE_TYPE,
  [AppLogKeysEnum.USER]: AppLogKeysEnum.USER,
  [AppLogKeysEnum.AUTH_USER]: AppLogKeysEnum.AUTH_USER,
  [AppLogKeysEnum.TITLE]: AppLogKeysEnum.TITLE,
  [AppLogKeysEnum.SESSION_ID]: AppLogKeysEnum.SESSION_ID,
  [AppLogKeysEnum.CREATED_TIME]: AppLogKeysEnum.CREATED_TIME,
  [AppLogKeysEnum.LAST_CONVERSATION_TIME]: AppLogKeysEnum.LAST_CONVERSATION_TIME,
  [AppLogKeysEnum.MESSAGE_COUNT]: AppLogKeysEnum.MESSAGE_COUNT,
  [AppLogKeysEnum.FEEDBACK]: AppLogKeysEnum.FEEDBACK,
  [AppLogKeysEnum.CUSTOM_FEEDBACK]: AppLogKeysEnum.CUSTOM_FEEDBACK,
  [AppLogKeysEnum.ANNOTATED_COUNT]: AppLogKeysEnum.ANNOTATED_COUNT,
  [AppLogKeysEnum.POINTS]: AppLogKeysEnum.POINTS,
  [AppLogKeysEnum.RESPONSE_TIME]: AppLogKeysEnum.RESPONSE_TIME,
  [AppLogKeysEnum.ERROR_COUNT]: AppLogKeysEnum.ERROR_COUNT,
  [AppLogKeysEnum.REGION]: AppLogKeysEnum.REGION,
  [AppLogKeysEnum.VERSION_NAME]: AppLogKeysEnum.VERSION_NAME
};

/**
 * 根据实际导出的 logKeys 顺序生成完整 CSV 表头前缀（末尾固定追加 `chatDetails` 以对齐服务端数据行）。
 */
function buildDefaultExportTitle(logKeys: readonly AppLogKeysEnum[]): string {
  return [...logKeys.map((key) => APP_LOG_KEY_HEADER_LABELS[key]), 'chatDetails'].join(',');
}

function isCsvContentType(contentType: string | null): boolean {
  if (!contentType) {
    return false;
  }
  const mediaType = contentType.split(';')[0]?.trim().toLowerCase() ?? '';
  return mediaType === 'text/csv' || mediaType === 'application/csv';
}

export type AppLogsCredential = Pick<ResolvedCredential, 'kind' | 'boundAppId'>;

export type AppLogsExportResultData =
  | {
      outputPath: string;
      bytes: number;
    }
  | {
      csv: string;
      bytes: number;
    };

export type AppLogsServiceDeps = {
  fileIo: FileIoAdapter;
  now?: () => Date;
};

export type AppLogsService = {
  search: (params: {
    client: FastGptHttpClient;
    input: Record<string, unknown>;
    credential?: AppLogsCredential;
  }) => Promise<CliResult<SearchAppChatLogsResponse>>;
  list: (params: {
    client: FastGptHttpClient;
    input: Record<string, unknown>;
    credential?: AppLogsCredential;
  }) => Promise<CliResult<getAppChatLogsResponseType>>;
  users: (params: {
    client: FastGptHttpClient;
    input: Record<string, unknown>;
    credential?: AppLogsCredential;
  }) => Promise<CliResult<GetLogUsersResponse>>;
  stats: (params: {
    client: FastGptHttpClient;
    input: Record<string, unknown>;
    credential?: AppLogsCredential;
  }) => Promise<CliResult<getTotalDataResponse>>;
  chart: (params: {
    client: FastGptHttpClient;
    input: Record<string, unknown>;
    credential?: AppLogsCredential;
  }) => Promise<CliResult<getChartDataResponse>>;
  exportLogs: (params: {
    client: FastGptHttpClient;
    input: Record<string, unknown>;
    credential?: AppLogsCredential;
    outputPath?: string;
    overwrite?: boolean;
  }) => Promise<CliResult<AppLogsExportResultData>>;
};

function assertAppLogsAppId({
  appId,
  credential
}: {
  appId: unknown;
  credential?: AppLogsCredential;
}): string | undefined {
  const normalized = (() => {
    if (appId === undefined) {
      return undefined;
    }
    if (typeof appId !== 'string' || appId.trim().length === 0) {
      throw new CliArgumentError('--app-id cannot be empty.');
    }
    return appId.trim();
  })();

  if (
    normalized === undefined &&
    credential?.kind !== 'appKey' &&
    credential?.kind !== 'unknownApiKey'
  ) {
    throw new CliArgumentError(
      '--app-id is required for a user session or personal API Key.',
      undefined,
      'Pass <appId> or --app-id <appId>, or authenticate with an App API Key.'
    );
  }

  if (
    (credential?.kind === 'appKey' || credential?.kind === 'unknownApiKey') &&
    credential.boundAppId &&
    normalized !== undefined &&
    normalized !== credential.boundAppId
  ) {
    throw new CliArgumentError('--app-id does not match the App bound to the active API Key.');
  }

  return normalized;
}

function parseDays(raw: unknown): number {
  const numeric = typeof raw === 'string' && raw.trim().length > 0 ? Number(raw.trim()) : raw;
  if (typeof numeric !== 'number' || !Number.isInteger(numeric) || numeric <= 0) {
    throw new CliArgumentError('--days must be a positive integer.');
  }
  return numeric;
}

function resolveAppLogsTimeRange({
  dateStart,
  dateEnd,
  days,
  now
}: {
  dateStart?: unknown;
  dateEnd?: unknown;
  days?: unknown;
  now: () => Date;
}): { dateStart: z.output<typeof DateSchema>; dateEnd: z.output<typeof DateSchema> } {
  if (days !== undefined && (dateStart !== undefined || dateEnd !== undefined)) {
    throw new CliArgumentError('--days is mutually exclusive with --date-start and --date-end.');
  }

  if ((dateStart !== undefined) !== (dateEnd !== undefined)) {
    throw new CliArgumentError(
      'Both --date-start and --date-end are required when specifying an explicit time range.'
    );
  }

  if (dateStart !== undefined && dateEnd !== undefined) {
    const parsedStart = DateSchema.parse(dateStart);
    const parsedEnd = DateSchema.parse(dateEnd);
    const startMs = new Date(parsedStart).getTime();
    const endMs = new Date(parsedEnd).getTime();
    if (Number.isNaN(startMs) || Number.isNaN(endMs)) {
      throw new CliArgumentError('Invalid --date-start or --date-end timestamp.');
    }
    if (startMs > endMs) {
      throw new CliArgumentError('--date-start must not be later than --date-end.');
    }
    return { dateStart: parsedStart, dateEnd: parsedEnd };
  }

  const resolvedDays = days === undefined ? DEFAULT_LOGS_DAYS : parseDays(days);
  const end = now();
  const start = new Date(end.getTime() - resolvedDays * 24 * 60 * 60 * 1000);
  return {
    dateStart: DateSchema.parse(start.toISOString()),
    dateEnd: DateSchema.parse(end.toISOString())
  };
}

function resolveSearchCursor({
  cursor,
  cursorTimestamp,
  cursorId
}: {
  cursor?: unknown;
  cursorTimestamp?: unknown;
  cursorId?: unknown;
}): AppChatLogsSearchCursor | undefined {
  if (cursor !== undefined && (cursorTimestamp !== undefined || cursorId !== undefined)) {
    throw new CliArgumentError(
      'Provide either --cursor or --cursor-timestamp/--cursor-id, not both.'
    );
  }

  if ((cursorTimestamp !== undefined) !== (cursorId !== undefined)) {
    throw new CliArgumentError('Provide both --cursor-timestamp and --cursor-id.');
  }

  if (cursor !== undefined) {
    const parsedJson = (() => {
      if (typeof cursor !== 'string') {
        return cursor;
      }
      try {
        return JSON.parse(cursor) as unknown;
      } catch {
        throw new CliArgumentError('--cursor must be valid JSON.');
      }
    })();
    return AppChatLogsSearchCursorSchema.parse(parsedJson);
  }

  if (cursorTimestamp !== undefined && cursorId !== undefined) {
    if (typeof cursorTimestamp === 'string' && cursorTimestamp.trim().length === 0) {
      throw new CliArgumentError('--cursor-timestamp cannot be empty.');
    }
    return AppChatLogsSearchCursorSchema.parse({
      timestamp: cursorTimestamp,
      id: cursorId
    });
  }

  return undefined;
}

function buildDefaultSourcesMap(): Record<string, { label: string }> {
  return Object.fromEntries(
    Object.values(ChatSourceEnum).map((source) => [source, { label: source }])
  );
}

function rethrowProUnavailableError(error: unknown, commandName: string): never {
  if (error instanceof CliApiError && error.httpStatus === 404) {
    throw new CliApiError({
      message: `Command "${commandName}" requires FastGPT Pro (/proApi endpoint returned HTTP 404).`,
      httpStatus: error.httpStatus,
      serverCode: error.serverCode,
      statusText: error.statusText,
      hint: 'Connect to a FastGPT Pro server to use this analytics endpoint.',
      details: error.details
    });
  }
  throw error;
}

/**
 * 应用运行日志与统计导出领域服务：
 * 统一处理 appKey 自动省略 appId / 绑定校验、时间窗口解析、游标与偏移分页、Pro 404 降级提示及 CSV 导出写入。
 */
export function createAppLogsService({
  fileIo,
  now = () => new Date()
}: AppLogsServiceDeps): AppLogsService {
  return {
    search: async ({ client, input, credential }) => {
      const {
        appId: rawAppId,
        dateStart: rawDateStart,
        dateEnd: rawDateEnd,
        days,
        cursor: rawCursor,
        cursorTimestamp,
        cursorId,
        ...rest
      } = input;

      const appId = assertAppLogsAppId({ appId: rawAppId, credential });
      const { dateStart, dateEnd } = resolveAppLogsTimeRange({
        dateStart: rawDateStart,
        dateEnd: rawDateEnd,
        days,
        now
      });
      const cursor = resolveSearchCursor({
        cursor: rawCursor,
        cursorTimestamp,
        cursorId
      });

      const validated = SearchAppChatLogsBodySchema.parse({
        ...rest,
        ...(appId !== undefined ? { appId } : {}),
        dateStart,
        dateEnd,
        ...(cursor !== undefined ? { cursor } : {})
      });

      const data = await client.request<SearchAppChatLogsResponse>({
        method: 'POST',
        path: '/core/app/logs/search',
        body: validated
      });

      return createSuccessResult({
        data,
        meta: {
          count: data.list.length,
          nextCursor: data.nextCursor,
          hasMore: Boolean(data.nextCursor)
        }
      });
    },

    list: async ({ client, input, credential }) => {
      const {
        appId: rawAppId,
        dateStart: rawDateStart,
        dateEnd: rawDateEnd,
        days,
        page,
        pageNum,
        ...rest
      } = input;

      const appId = assertAppLogsAppId({ appId: rawAppId, credential });
      const { dateStart, dateEnd } = resolveAppLogsTimeRange({
        dateStart: rawDateStart,
        dateEnd: rawDateEnd,
        days,
        now
      });

      const resolvedPageNum = pageNum ?? page;
      const validated = GetAppChatLogsBodySchema.parse({
        ...rest,
        ...(appId !== undefined ? { appId } : {}),
        dateStart,
        dateEnd,
        ...(resolvedPageNum !== undefined ? { pageNum: resolvedPageNum } : {})
      });

      const data = await client.request<getAppChatLogsResponseType>({
        method: 'POST',
        path: '/core/app/logs/list',
        body: validated
      });

      return createSuccessResult({
        data,
        meta: buildPaginationMeta({
          validatedBody: validated as Record<string, unknown>,
          total: data.total ?? 0,
          count: data.list.length
        })
      });
    },

    users: async ({ client, input, credential }) => {
      const {
        appId: rawAppId,
        dateStart: rawDateStart,
        dateEnd: rawDateEnd,
        days,
        page,
        pageNum,
        ...rest
      } = input;

      const appId = assertAppLogsAppId({ appId: rawAppId, credential });
      const { dateStart, dateEnd } = resolveAppLogsTimeRange({
        dateStart: rawDateStart,
        dateEnd: rawDateEnd,
        days,
        now
      });

      const resolvedPageNum = pageNum ?? page;
      const validated = GetLogUsersBodySchema.parse({
        ...rest,
        ...(appId !== undefined ? { appId } : {}),
        dateStart,
        dateEnd,
        ...(resolvedPageNum !== undefined ? { pageNum: resolvedPageNum } : {})
      });

      const data = await client.request<GetLogUsersResponse>({
        method: 'POST',
        path: '/core/app/logs/getUsers',
        body: validated
      });

      return createSuccessResult({
        data,
        meta: buildPaginationMeta({
          validatedBody: validated as Record<string, unknown>,
          total: data.total ?? 0,
          count: data.list.length
        })
      });
    },

    stats: async ({ client, input, credential }) => {
      const appId = assertAppLogsAppId({ appId: input.appId, credential });
      const validated = GetTotalDataQuerySchema.parse(appId !== undefined ? { appId } : {});

      const data = await (async () => {
        try {
          return await client.request<getTotalDataResponse>({
            method: 'GET',
            path: '/proApi/core/app/logs/getTotalData',
            ...(Object.keys(validated).length > 0 ? { query: validated } : {})
          });
        } catch (error) {
          rethrowProUnavailableError(error, 'app logs stats');
        }
      })();

      return createSuccessResult({ data });
    },

    chart: async ({ client, input, credential }) => {
      const {
        appId: rawAppId,
        dateStart: rawDateStart,
        dateEnd: rawDateEnd,
        days,
        timespan,
        userTimespan,
        chatTimespan,
        appTimespan,
        ...rest
      } = input;

      const appId = assertAppLogsAppId({ appId: rawAppId, credential });
      const { dateStart, dateEnd } = resolveAppLogsTimeRange({
        dateStart: rawDateStart,
        dateEnd: rawDateEnd,
        days,
        now
      });

      const baseTimespan = timespan ?? AppLogTimespanEnum.day;
      const validated = GetChartDataBodySchema.parse({
        ...rest,
        ...(appId !== undefined ? { appId } : {}),
        dateStart,
        dateEnd,
        userTimespan: userTimespan ?? baseTimespan,
        chatTimespan: chatTimespan ?? baseTimespan,
        appTimespan: appTimespan ?? baseTimespan
      });

      const data = await (async () => {
        try {
          return await client.request<getChartDataResponse>({
            method: 'POST',
            path: '/proApi/core/app/logs/getChartData',
            body: validated
          });
        } catch (error) {
          rethrowProUnavailableError(error, 'app logs chart');
        }
      })();

      return createSuccessResult({ data });
    },

    exportLogs: async ({ client, input, credential, outputPath, overwrite }) => {
      const {
        appId: rawAppId,
        dateStart: rawDateStart,
        dateEnd: rawDateEnd,
        days,
        title,
        sourcesMap,
        logKeys,
        ...rest
      } = input;

      const appId = assertAppLogsAppId({ appId: rawAppId, credential });
      const { dateStart, dateEnd } = resolveAppLogsTimeRange({
        dateStart: rawDateStart,
        dateEnd: rawDateEnd,
        days,
        now
      });

      const selectedLogKeys = z
        .array(z.enum(AppLogKeysEnum))
        .parse(logKeys ?? Object.values(AppLogKeysEnum));

      const validated = ExportChatLogsBodySchema.parse({
        ...rest,
        ...(appId !== undefined ? { appId } : {}),
        dateStart,
        dateEnd,
        title: title ?? buildDefaultExportTitle(selectedLogKeys),
        sourcesMap: sourcesMap ?? buildDefaultSourcesMap(),
        logKeys: selectedLogKeys
      });

      const normalizedOutputPath = (() => {
        if (outputPath === undefined) {
          return undefined;
        }
        const trimmed = outputPath.trim();
        if (!trimmed) {
          throw new CliArgumentError('--output path cannot be empty.');
        }
        return trimmed;
      })();

      // 1. 存在目标文件且未传 --overwrite 时提前拒绝，避免无效拉取 CSV 与触发服务端导出审计。
      if (normalizedOutputPath !== undefined && overwrite !== true) {
        const exists = await fileIo.exists(normalizedOutputPath);
        if (exists) {
          throw new CliArgumentError(
            `Output file "${normalizedOutputPath}" already exists.`,
            { outputPath: fileIo.resolvePath(normalizedOutputPath) },
            'Pass --overwrite to replace the existing file.'
          );
        }
      }

      // 2. 使用 requestRaw 拉取原始响应，先校验必须为 CSV 媒体类型再消费/落盘，防止反代 HTML 或业务错误 JSON 污染导出文件。
      const exportUrl = `${client.baseUrl}/core/app/logs/exportLogs`;
      const rawResponse = await client.requestRaw({
        method: 'POST',
        path: '/core/app/logs/exportLogs',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(validated),
        timeoutMs: LONG_OPERATION_TIMEOUT_MS
      });

      const contentType = rawResponse.headers.get('content-type');
      if (!isCsvContentType(contentType)) {
        const rawText = await rawResponse.text();
        const envelopeError = parseFastGptEnvelopeError({
          httpStatus: rawResponse.status,
          rawText,
          url: rawResponse.url ?? exportUrl
        });
        if (envelopeError) {
          throw envelopeError;
        }
        const snippet = redactText(rawText.trim().slice(0, 200));
        throw new CliApiError({
          message: `Expected text/csv response from app logs export, got "${contentType ?? 'unknown'}".`,
          httpStatus: rawResponse.status,
          hint: 'Verify FASTGPT_BASE_URL points directly to the FastGPT API and your credentials are valid.',
          details: {
            contentType: contentType ?? null,
            url: redactText(rawResponse.url ?? exportUrl),
            ...(snippet ? { bodySnippet: snippet } : {})
          }
        });
      }

      // 3. 指定 --output 且存在原始响应流时优先走流式原子写盘；内存回退与文本返回保持 BOM 与字节数一致。
      const readCsvResponsePayload = async (
        response: RawHttpResponse
      ): Promise<{ csv: string; bytes: number }> => {
        if (typeof response.arrayBuffer === 'function') {
          const buffer = await response.arrayBuffer();
          return {
            csv: new TextDecoder('utf-8', { ignoreBOM: true }).decode(buffer),
            bytes: buffer.byteLength
          };
        }
        const text = await response.text();
        return {
          csv: text,
          bytes: new TextEncoder().encode(text).byteLength
        };
      };

      if (normalizedOutputPath !== undefined) {
        if (rawResponse.body) {
          const streamed = await fileIo.writeStreamAtomic({
            filePath: normalizedOutputPath,
            stream: rawResponse.body,
            overwrite: overwrite === true
          });
          return createSuccessResult({
            data: {
              outputPath: streamed.path,
              bytes: streamed.bytes
            },
            message: `Exported app chat logs (${streamed.bytes} bytes) to "${streamed.path}".`
          });
        }

        const { csv, bytes } = await readCsvResponsePayload(rawResponse);
        const writtenPath = await fileIo.writeTextAtomic({
          filePath: normalizedOutputPath,
          content: csv,
          overwrite: overwrite === true
        });
        return createSuccessResult({
          data: {
            outputPath: writtenPath,
            bytes
          },
          message: `Exported app chat logs (${bytes} bytes) to "${writtenPath}".`
        });
      }

      const { csv, bytes } = await readCsvResponsePayload(rawResponse);

      return createSuccessResult({
        data: {
          csv,
          bytes
        }
      });
    }
  };
}
