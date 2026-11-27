import { CliArgumentError } from '../../../shared/errors';
import { parseIdListOption, parseOptionalNumber } from '../../../shared/input';
import type { CliCommandSpec } from '../../pipeline';
import { requireActiveClient } from '../shared/helpers';

function parseOptionalCursorOption(raw: unknown): unknown {
  if (raw === undefined) return undefined;
  if (typeof raw !== 'string') return raw;
  try {
    return JSON.parse(raw);
  } catch {
    throw new CliArgumentError(
      '--cursor must be valid JSON.',
      undefined,
      'Example: --cursor \'{"timestamp":1735689600000,"id":"68ad85a7463006c963799a05"}\''
    );
  }
}

/** 注册 FastGPT Agent 对话日志只读查询命令：list / users。 */
export function createAgentLogsCommandSpecs(): CliCommandSpec[] {
  return [
    {
      path: ['agent', 'logs', 'list'],
      summary: 'Search FastGPT agent conversation logs with cursor pagination',
      risk: 'read',
      authModes: ['token', 'personalKey', 'appKey'],
      positionalArgs: [
        {
          name: 'agentId',
          required: false,
          description: 'Agent ObjectId (or use --id; optional for App API Key)'
        }
      ],
      options: [
        {
          name: 'id',
          flags: '--id <agentId>',
          takesValue: true,
          description: 'Agent ObjectId (alternative to positional argument)'
        },
        {
          name: 'dateStart',
          flags: '--date-start <iso>',
          takesValue: true,
          description: 'Start timestamp in ISO 8601 format (defaults to 7 days ago)'
        },
        {
          name: 'dateEnd',
          flags: '--date-end <iso>',
          takesValue: true,
          description: 'End timestamp in ISO 8601 format (defaults to now)'
        },
        {
          name: 'sources',
          flags: '--sources <list>',
          takesValue: true,
          description: 'Comma-separated chat sources (e.g. api,online,share,test)'
        },
        {
          name: 'tmbIds',
          flags: '--tmb-ids <list>',
          takesValue: true,
          description: 'Comma-separated team member IDs to filter by'
        },
        {
          name: 'outLinkUids',
          flags: '--out-link-uids <list>',
          takesValue: true,
          description: 'Comma-separated external user IDs (outLinkUid / customUid) to filter by'
        },
        {
          name: 'search',
          flags: '--search <keyword>',
          takesValue: true,
          description: 'Search keyword for chat title or exact chatId'
        },
        {
          name: 'searchType',
          flags: '--search-type <type>',
          takesValue: true,
          description: 'Search mode: title or chatId'
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
          description: 'Return only logs with unread feedback'
        },
        {
          name: 'errorFilter',
          flags: '--error-filter <filter>',
          takesValue: true,
          description: 'Error filter: all or has_error'
        },
        {
          name: 'cursor',
          flags: '--cursor <json>',
          takesValue: true,
          description: 'Cursor JSON from previous meta.nextCursor'
        }
      ],
      examples: [
        {
          description: 'List recent conversation logs for an agent (last 7 days)',
          args: ['agent', 'logs', 'list', '68ad85a7463006c963799a05']
        },
        {
          description: 'Filter error logs by source and date range',
          args: [
            'agent',
            'logs',
            'list',
            '68ad85a7463006c963799a05',
            '--date-start',
            '2026-01-01T00:00:00.000Z',
            '--date-end',
            '2026-12-31T23:59:59.999Z',
            '--sources',
            'api,online',
            '--error-filter',
            'has_error'
          ]
        }
      ],
      execute: ({ positional, options, client, container, resolvedAuth }) => {
        const activeClient = requireActiveClient(client, 'agent logs list');
        const appId = positional[0] ?? (typeof options.id === 'string' ? options.id : undefined);

        return container.agentLogsService.list({
          client: activeClient,
          credential: resolvedAuth?.credential,
          input: {
            appId,
            dateStart: typeof options.dateStart === 'string' ? options.dateStart : undefined,
            dateEnd: typeof options.dateEnd === 'string' ? options.dateEnd : undefined,
            sources: parseIdListOption(options.sources),
            tmbIds: parseIdListOption(options.tmbIds),
            outLinkUids: parseIdListOption(options.outLinkUids),
            chatSearch: typeof options.search === 'string' ? options.search : undefined,
            searchType: typeof options.searchType === 'string' ? options.searchType : undefined,
            feedbackType:
              typeof options.feedbackType === 'string' ? options.feedbackType : undefined,
            unreadOnly: options.unreadOnly === true ? true : undefined,
            errorFilter: typeof options.errorFilter === 'string' ? options.errorFilter : undefined,
            cursor: parseOptionalCursorOption(options.cursor)
          }
        });
      }
    },

    {
      path: ['agent', 'logs', 'users'],
      summary: 'List aggregated conversation users for a FastGPT agent',
      risk: 'read',
      authModes: ['token', 'personalKey', 'appKey'],
      positionalArgs: [
        {
          name: 'agentId',
          required: false,
          description: 'Agent ObjectId (or use --id; optional for App API Key)'
        }
      ],
      options: [
        {
          name: 'id',
          flags: '--id <agentId>',
          takesValue: true,
          description: 'Agent ObjectId (alternative to positional argument)'
        },
        {
          name: 'dateStart',
          flags: '--date-start <iso>',
          takesValue: true,
          description: 'Start timestamp in ISO 8601 format (defaults to 7 days ago)'
        },
        {
          name: 'dateEnd',
          flags: '--date-end <iso>',
          takesValue: true,
          description: 'End timestamp in ISO 8601 format (defaults to now)'
        },
        {
          name: 'search',
          flags: '--search <keyword>',
          takesValue: true,
          description: 'Search users by username, name, or user ID'
        },
        {
          name: 'sources',
          flags: '--sources <list>',
          takesValue: true,
          description: 'Comma-separated chat sources (e.g. api,online,share)'
        },
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
          description: 'Items per page (default 20)'
        }
      ],
      examples: [
        {
          description: 'List active conversation users for an agent (last 7 days)',
          args: ['agent', 'logs', 'users', '68ad85a7463006c963799a05']
        }
      ],
      execute: ({ positional, options, client, container, resolvedAuth }) => {
        const activeClient = requireActiveClient(client, 'agent logs users');
        const appId = positional[0] ?? (typeof options.id === 'string' ? options.id : undefined);

        return container.agentLogsService.listUsers({
          client: activeClient,
          credential: resolvedAuth?.credential,
          input: {
            appId,
            dateStart: typeof options.dateStart === 'string' ? options.dateStart : undefined,
            dateEnd: typeof options.dateEnd === 'string' ? options.dateEnd : undefined,
            searchKey: typeof options.search === 'string' ? options.search : undefined,
            sources: parseIdListOption(options.sources),
            page: parseOptionalNumber(options.page),
            pageSize: parseOptionalNumber(options.pageSize)
          }
        });
      }
    }
  ];
}
