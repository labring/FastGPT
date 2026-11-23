import { CliArgumentError } from '../../../shared/errors';
import { isPlainObject, parseIdListOption, resolveJsonObjectPayload } from '../../../shared/input';
import type { CommandOptionMeta } from '../../../shared/types';
import type { CliCommandSpec } from '../../pipeline';
import { parseOptionalNumber, requireActiveClient } from '../dataset/shared';

const APP_ID_POSITIONAL = [
  {
    name: 'appId',
    required: false,
    description: 'Target App ObjectId (or use --app-id; optional for App API Key)'
  }
] as const;

const APP_ID_OPTION: CommandOptionMeta = {
  name: 'appId',
  flags: '--app-id <appId>',
  takesValue: true,
  description: 'Target App ObjectId (optional for an App API Key)'
};

const TIME_RANGE_OPTIONS: readonly CommandOptionMeta[] = [
  {
    name: 'dateStart',
    flags: '--date-start <iso>',
    takesValue: true,
    description: 'Start date/time in ISO-8601 or YYYY-MM-DD format (paired with --date-end)'
  },
  {
    name: 'dateEnd',
    flags: '--date-end <iso>',
    takesValue: true,
    description: 'End date/time in ISO-8601 or YYYY-MM-DD format (paired with --date-start)'
  },
  {
    name: 'days',
    flags: '--days <n>',
    takesValue: true,
    description: 'Trailing day window (default 7 when neither --date-start nor --date-end is given)'
  }
];

const LOG_FILTER_OPTIONS: readonly CommandOptionMeta[] = [
  {
    name: 'sources',
    flags: '--sources <sources>',
    takesValue: true,
    description: 'Comma-separated chat sources (e.g. api,online,share)'
  },
  {
    name: 'tmbIds',
    flags: '--tmb-ids <ids>',
    takesValue: true,
    description: 'Comma-separated team member IDs'
  },
  {
    name: 'outLinkUids',
    flags: '--out-link-uids <ids>',
    takesValue: true,
    description: 'Comma-separated external user / customUid values'
  },
  {
    name: 'chatSearch',
    flags: '--chat-search <keyword>',
    takesValue: true,
    description: 'Conversation search keyword'
  },
  {
    name: 'feedbackType',
    flags: '--feedback-type <type>',
    takesValue: true,
    description: 'Feedback filter: all, has_feedback, good, or bad'
  },
  {
    name: 'unreadOnly',
    flags: '--unread-only',
    takesValue: false,
    description: 'Include only logs with unread feedback'
  },
  {
    name: 'errorFilter',
    flags: '--error-filter <filter>',
    takesValue: true,
    description: 'Error filter: all or has_error'
  }
];

const PAGINATION_OPTIONS: readonly CommandOptionMeta[] = [
  {
    name: 'page',
    flags: '--page <n>',
    takesValue: true,
    description: 'Page number (default 1)'
  },
  {
    name: 'pageSize',
    flags: '--page-size <n>',
    takesValue: true,
    description: 'Items per page (default 20, max 500)'
  },
  {
    name: 'offset',
    flags: '--offset <n>',
    takesValue: true,
    description: 'Offset pagination start (takes precedence over --page)'
  }
];

function resolveCliAppId({
  positional,
  flagAppId
}: {
  positional: readonly string[];
  flagAppId: unknown;
}): string | undefined {
  const pos = (() => {
    if (positional[0] === undefined) {
      return undefined;
    }
    const trimmed = positional[0].trim();
    if (!trimmed) {
      throw new CliArgumentError('appId cannot be empty.');
    }
    return trimmed;
  })();

  const flag = (() => {
    if (flagAppId === undefined) {
      return undefined;
    }
    if (typeof flagAppId !== 'string' || flagAppId.trim().length === 0) {
      throw new CliArgumentError('--app-id cannot be empty.');
    }
    return flagAppId.trim();
  })();

  if (pos !== undefined && flag !== undefined && pos !== flag) {
    throw new CliArgumentError('Positional appId and --app-id must match when both are provided.');
  }

  return pos ?? flag;
}

function requireNumericFlag(raw: unknown, flagName: string): number | undefined {
  if (raw === undefined) {
    return undefined;
  }
  const parsed = parseOptionalNumber(raw);
  if (parsed === undefined) {
    throw new CliArgumentError(`${flagName} cannot be empty.`);
  }
  return parsed;
}

function parseListFlag(raw: unknown, flagName: string): string[] | undefined {
  if (raw === undefined) {
    return undefined;
  }
  if (typeof raw === 'string' && raw.trim() === '[]') {
    return [];
  }
  const parsed = parseIdListOption(raw);
  if (parsed === undefined) {
    throw new CliArgumentError(`${flagName} cannot be empty.`);
  }
  return parsed;
}

function parseJsonObjectFlag(raw: unknown, flagName: string): Record<string, unknown> | undefined {
  if (raw === undefined) {
    return undefined;
  }
  if (typeof raw !== 'string' || raw.trim().length === 0) {
    throw new CliArgumentError(`${flagName} cannot be empty.`);
  }
  const parsed = (() => {
    try {
      return JSON.parse(raw) as unknown;
    } catch {
      throw new CliArgumentError(`${flagName} must be valid JSON.`);
    }
  })();
  if (!isPlainObject(parsed)) {
    throw new CliArgumentError(`${flagName} must be a JSON object.`);
  }
  return parsed;
}

function buildFilterInput(options: Record<string, unknown>): Record<string, unknown> {
  const sources = parseListFlag(options.sources, '--sources');
  const tmbIds = parseListFlag(options.tmbIds, '--tmb-ids');
  const outLinkUids = parseListFlag(options.outLinkUids, '--out-link-uids');

  return {
    ...(sources !== undefined ? { sources } : {}),
    ...(tmbIds !== undefined ? { tmbIds } : {}),
    ...(outLinkUids !== undefined ? { outLinkUids } : {}),
    ...(options.chatSearch !== undefined ? { chatSearch: options.chatSearch } : {}),
    ...(options.feedbackType !== undefined ? { feedbackType: options.feedbackType } : {}),
    ...(options.unreadOnly === true ? { unreadOnly: true } : {}),
    ...(options.errorFilter !== undefined ? { errorFilter: options.errorFilter } : {})
  };
}

function buildTimeRangeInput(options: Record<string, unknown>): Record<string, unknown> {
  const days = requireNumericFlag(options.days, '--days');
  return {
    ...(options.dateStart !== undefined ? { dateStart: options.dateStart } : {}),
    ...(options.dateEnd !== undefined ? { dateEnd: options.dateEnd } : {}),
    ...(days !== undefined ? { days } : {})
  };
}

/** 注册应用运行日志查询、用户统计、商业版报表与 CSV 导出命令组。 */
export function createAppLogsCommandSpecs(): CliCommandSpec[] {
  return [
    {
      path: ['app', 'logs', 'search'],
      summary: 'Search App conversation logs with cursor pagination',
      risk: 'read',
      authModes: ['token', 'personalKey', 'appKey'],
      positionalArgs: [...APP_ID_POSITIONAL],
      options: [
        APP_ID_OPTION,
        ...TIME_RANGE_OPTIONS,
        ...LOG_FILTER_OPTIONS,
        {
          name: 'searchType',
          flags: '--search-type <type>',
          takesValue: true,
          description: 'Search target: title or chatId'
        },
        {
          name: 'cursor',
          flags: '--cursor <json>',
          takesValue: true,
          description: 'JSON cursor from meta.nextCursor ({"timestamp":...,"id":"..."})'
        },
        {
          name: 'cursorTimestamp',
          flags: '--cursor-timestamp <ms>',
          takesValue: true,
          description: 'Cursor timestamp in milliseconds (paired with --cursor-id)'
        },
        {
          name: 'cursorId',
          flags: '--cursor-id <id>',
          takesValue: true,
          description: 'Cursor log ObjectId (paired with --cursor-timestamp)'
        }
      ],
      examples: [
        {
          description: 'Search the last 7 days of App logs',
          args: ['app', 'logs', 'search', '68ad85a7463006c963799a05']
        },
        {
          description: 'Continue searching with the next cursor',
          args: [
            'app',
            'logs',
            'search',
            '--app-id',
            '68ad85a7463006c963799a05',
            '--cursor-timestamp',
            '1735689600000',
            '--cursor-id',
            '68ad85a7463006c963799a06'
          ]
        }
      ],
      execute: async ({ positional, options, client, container, resolvedAuth }) => {
        const activeClient = requireActiveClient(client, 'app logs search');
        const appId = resolveCliAppId({ positional, flagAppId: options.appId });
        const cursorTimestamp = requireNumericFlag(options.cursorTimestamp, '--cursor-timestamp');

        return container.appLogsService.search({
          client: activeClient,
          credential: resolvedAuth?.credential,
          input: {
            ...(appId !== undefined ? { appId } : {}),
            ...buildTimeRangeInput(options),
            ...buildFilterInput(options),
            ...(options.searchType !== undefined ? { searchType: options.searchType } : {}),
            ...(options.cursor !== undefined ? { cursor: options.cursor } : {}),
            ...(cursorTimestamp !== undefined ? { cursorTimestamp } : {}),
            ...(options.cursorId !== undefined ? { cursorId: options.cursorId } : {})
          }
        });
      }
    },

    {
      path: ['app', 'logs', 'list'],
      summary: 'List App conversation logs with page or offset pagination',
      risk: 'read',
      authModes: ['token', 'personalKey', 'appKey'],
      positionalArgs: [...APP_ID_POSITIONAL],
      options: [APP_ID_OPTION, ...TIME_RANGE_OPTIONS, ...LOG_FILTER_OPTIONS, ...PAGINATION_OPTIONS],
      examples: [
        {
          description: 'List App logs for the past 7 days',
          args: [
            'app',
            'logs',
            'list',
            '68ad85a7463006c963799a05',
            '--page',
            '1',
            '--page-size',
            '20'
          ]
        }
      ],
      execute: async ({ positional, options, client, container, resolvedAuth }) => {
        const activeClient = requireActiveClient(client, 'app logs list');
        const appId = resolveCliAppId({ positional, flagAppId: options.appId });
        const page = requireNumericFlag(options.page, '--page');
        const pageSize = requireNumericFlag(options.pageSize, '--page-size');
        const offset = requireNumericFlag(options.offset, '--offset');

        return container.appLogsService.list({
          client: activeClient,
          credential: resolvedAuth?.credential,
          input: {
            ...(appId !== undefined ? { appId } : {}),
            ...buildTimeRangeInput(options),
            ...buildFilterInput(options),
            ...(page !== undefined ? { page } : {}),
            ...(pageSize !== undefined ? { pageSize } : {}),
            ...(offset !== undefined ? { offset } : {})
          }
        });
      }
    },

    {
      path: ['app', 'logs', 'users'],
      summary: 'List active users in App conversation logs sorted by conversation count',
      risk: 'read',
      authModes: ['token', 'personalKey', 'appKey'],
      positionalArgs: [...APP_ID_POSITIONAL],
      options: [
        APP_ID_OPTION,
        ...TIME_RANGE_OPTIONS,
        {
          name: 'search',
          flags: '--search <keyword>',
          takesValue: true,
          description: 'Search by userId, member name, username, or contact'
        },
        {
          name: 'sources',
          flags: '--sources <sources>',
          takesValue: true,
          description: 'Comma-separated chat sources (e.g. online,share)'
        },
        ...PAGINATION_OPTIONS
      ],
      examples: [
        {
          description: 'List top users in App logs over the past 30 days',
          args: ['app', 'logs', 'users', '68ad85a7463006c963799a05', '--days', '30']
        }
      ],
      execute: async ({ positional, options, client, container, resolvedAuth }) => {
        const activeClient = requireActiveClient(client, 'app logs users');
        const appId = resolveCliAppId({ positional, flagAppId: options.appId });
        const sources = parseListFlag(options.sources, '--sources');
        const page = requireNumericFlag(options.page, '--page');
        const pageSize = requireNumericFlag(options.pageSize, '--page-size');
        const offset = requireNumericFlag(options.offset, '--offset');

        return container.appLogsService.users({
          client: activeClient,
          credential: resolvedAuth?.credential,
          input: {
            ...(appId !== undefined ? { appId } : {}),
            ...buildTimeRangeInput(options),
            ...(options.search !== undefined ? { searchKey: options.search } : {}),
            ...(sources !== undefined ? { sources } : {}),
            ...(page !== undefined ? { page } : {}),
            ...(pageSize !== undefined ? { pageSize } : {}),
            ...(offset !== undefined ? { offset } : {})
          }
        });
      }
    },

    {
      path: ['app', 'logs', 'stats'],
      summary: 'Get overall App log totals (FastGPT Pro required)',
      risk: 'read',
      authModes: ['token', 'personalKey', 'appKey'],
      positionalArgs: [...APP_ID_POSITIONAL],
      options: [APP_ID_OPTION],
      examples: [
        {
          description: 'Get total users, chats, points, and tokens for an App',
          args: ['app', 'logs', 'stats', '68ad85a7463006c963799a05']
        }
      ],
      execute: async ({ positional, options, client, container, resolvedAuth }) => {
        const activeClient = requireActiveClient(client, 'app logs stats');
        const appId = resolveCliAppId({ positional, flagAppId: options.appId });

        return container.appLogsService.stats({
          client: activeClient,
          credential: resolvedAuth?.credential,
          input: {
            ...(appId !== undefined ? { appId } : {})
          }
        });
      }
    },

    {
      path: ['app', 'logs', 'chart'],
      summary: 'Get time-series App log chart analytics (FastGPT Pro required)',
      risk: 'read',
      authModes: ['token', 'personalKey', 'appKey'],
      positionalArgs: [...APP_ID_POSITIONAL],
      options: [
        APP_ID_OPTION,
        ...TIME_RANGE_OPTIONS,
        {
          name: 'sources',
          flags: '--sources <sources>',
          takesValue: true,
          description: 'Comma-separated chat sources (e.g. api,online,share)'
        },
        {
          name: 'offset',
          flags: '--offset <n>',
          takesValue: true,
          description: 'User retention offset in userTimespan units (default 1)'
        },
        {
          name: 'timespan',
          flags: '--timespan <span>',
          takesValue: true,
          description: 'Default bucket timespan for all series: day, week, month, or quarter'
        },
        {
          name: 'userTimespan',
          flags: '--user-timespan <span>',
          takesValue: true,
          description: 'User analytics bucket timespan: day, week, month, or quarter'
        },
        {
          name: 'chatTimespan',
          flags: '--chat-timespan <span>',
          takesValue: true,
          description: 'Chat analytics bucket timespan: day, week, month, or quarter'
        },
        {
          name: 'appTimespan',
          flags: '--app-timespan <span>',
          takesValue: true,
          description: 'App analytics bucket timespan: day, week, month, or quarter'
        }
      ],
      examples: [
        {
          description: 'Get daily chart analytics for the past 14 days',
          args: [
            'app',
            'logs',
            'chart',
            '68ad85a7463006c963799a05',
            '--days',
            '14',
            '--timespan',
            'day'
          ]
        }
      ],
      execute: async ({ positional, options, client, container, resolvedAuth }) => {
        const activeClient = requireActiveClient(client, 'app logs chart');
        const appId = resolveCliAppId({ positional, flagAppId: options.appId });
        const source = parseListFlag(options.sources, '--sources');
        const offset = requireNumericFlag(options.offset, '--offset');

        return container.appLogsService.chart({
          client: activeClient,
          credential: resolvedAuth?.credential,
          input: {
            ...(appId !== undefined ? { appId } : {}),
            ...buildTimeRangeInput(options),
            ...(source !== undefined ? { source } : {}),
            ...(offset !== undefined ? { offset } : {}),
            ...(options.timespan !== undefined ? { timespan: options.timespan } : {}),
            ...(options.userTimespan !== undefined ? { userTimespan: options.userTimespan } : {}),
            ...(options.chatTimespan !== undefined ? { chatTimespan: options.chatTimespan } : {}),
            ...(options.appTimespan !== undefined ? { appTimespan: options.appTimespan } : {})
          }
        });
      }
    },

    {
      path: ['app', 'logs', 'export'],
      summary: 'Export App conversation logs to CSV or write directly to a file',
      risk: 'read',
      authModes: ['token', 'appKey'],
      positionalArgs: [...APP_ID_POSITIONAL],
      options: [
        APP_ID_OPTION,
        ...TIME_RANGE_OPTIONS,
        ...LOG_FILTER_OPTIONS,
        {
          name: 'searchType',
          flags: '--search-type <type>',
          takesValue: true,
          description: 'Search target: title or chatId'
        },
        {
          name: 'title',
          flags: '--title <title>',
          takesValue: true,
          description:
            'Comma-separated CSV header prefix matching logKeys + chatDetails (auto-generated from logKeys by default)'
        },
        {
          name: 'sourcesMap',
          flags: '--sources-map <json>',
          takesValue: true,
          description: 'JSON map from source key to {"label":"..."}'
        },
        {
          name: 'logKeys',
          flags: '--log-keys <keys>',
          takesValue: true,
          description: 'Comma-separated AppLogKeysEnum columns (defaults to all log keys)'
        },
        {
          name: 'file',
          flags: '--file <path>',
          takesValue: true,
          description: 'Read JSON export request payload from file ("-" for stdin)'
        },
        {
          name: 'stdin',
          flags: '--stdin',
          takesValue: false,
          description: 'Read JSON export request payload from stdin'
        },
        {
          name: 'output',
          flags: '--output <path>',
          takesValue: true,
          description: 'Write exported CSV to file instead of returning inline csv'
        },
        {
          name: 'overwrite',
          flags: '--overwrite',
          takesValue: false,
          description: 'Allow overwriting an existing --output file'
        }
      ],
      examples: [
        {
          description: 'Export the last 7 days of App logs to a CSV file',
          args: [
            'app',
            'logs',
            'export',
            '68ad85a7463006c963799a05',
            '--days',
            '7',
            '--output',
            './app-logs.csv'
          ]
        }
      ],
      execute: async ({ positional, options, client, container, resolvedAuth }) => {
        const activeClient = requireActiveClient(client, 'app logs export');
        if (options.file !== undefined && options.stdin === true) {
          throw new CliArgumentError('Use either --file or --stdin.');
        }

        const filePayload = await resolveJsonObjectPayload({
          filePath: typeof options.file === 'string' ? options.file : undefined,
          useStdin: options.stdin === true,
          readTextFile: container.fileIo.readTextFile,
          readStdin: container.readStdin,
          fieldLabel: 'app logs export payload'
        });

        const explicitAppId = resolveCliAppId({ positional, flagAppId: options.appId });
        const appId = explicitAppId ?? filePayload?.appId;

        const explicitDays = requireNumericFlag(options.days, '--days');
        if (
          explicitDays !== undefined &&
          (options.dateStart !== undefined || options.dateEnd !== undefined)
        ) {
          throw new CliArgumentError(
            '--days is mutually exclusive with --date-start and --date-end.'
          );
        }
        if ((options.dateStart !== undefined) !== (options.dateEnd !== undefined)) {
          throw new CliArgumentError(
            'Both --date-start and --date-end are required when specifying an explicit time range.'
          );
        }

        const timeInput = (() => {
          if (explicitDays !== undefined) {
            return { days: explicitDays };
          }
          if (options.dateStart !== undefined && options.dateEnd !== undefined) {
            return { dateStart: options.dateStart, dateEnd: options.dateEnd };
          }
          return {
            ...(filePayload?.dateStart !== undefined ? { dateStart: filePayload.dateStart } : {}),
            ...(filePayload?.dateEnd !== undefined ? { dateEnd: filePayload.dateEnd } : {})
          };
        })();

        const sourcesMap = parseJsonObjectFlag(options.sourcesMap, '--sources-map');
        const logKeys = parseListFlag(options.logKeys, '--log-keys');
        const filterOverrides = buildFilterInput(options);

        const basePayload = (() => {
          if (!filePayload) {
            return {};
          }
          const { appId: _a, dateStart: _s, dateEnd: _e, ...rest } = filePayload;
          return rest;
        })();

        return container.appLogsService.exportLogs({
          client: activeClient,
          credential: resolvedAuth?.credential,
          outputPath: typeof options.output === 'string' ? options.output : undefined,
          overwrite: options.overwrite === true,
          input: {
            ...basePayload,
            ...(appId !== undefined ? { appId } : {}),
            ...timeInput,
            ...filterOverrides,
            ...(options.searchType !== undefined ? { searchType: options.searchType } : {}),
            ...(options.title !== undefined ? { title: options.title } : {}),
            ...(sourcesMap !== undefined ? { sourcesMap } : {}),
            ...(logKeys !== undefined ? { logKeys } : {})
          }
        });
      }
    }
  ];
}
