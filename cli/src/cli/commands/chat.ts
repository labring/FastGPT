import z from 'zod';
import { BoolSchema } from '@fastgpt/global/common/zod';
import type { ChatOperation } from '../../domain/chat/chat-service';
import { CliArgumentError } from '../../shared/errors';
import type { CommandOptionMeta } from '../../shared/types';
import type { CliCommandSpec } from '../pipeline';

type ChatOption = CommandOptionMeta & {
  /** 映射到后端 OpenAPI 载荷的字段名；省略时默认等于 option.name。 */
  payloadKey?: string;
  encoding?: 'json' | 'csv' | 'boolean';
};

function toKebabFlag(name: string): string {
  return name.replace(/[A-Z]/g, (ch) => `-${ch.toLowerCase()}`);
}

/** 注册 Agent 会话命令，chat run 和 agent run 共用参数与执行逻辑，全部采用 kebab-case。 */
export function createChatCommandSpecs(): CliCommandSpec[] {
  function value({
    name,
    flagName,
    payloadKey,
    description,
    encoding
  }: {
    name: string;
    flagName?: string;
    payloadKey?: string;
    description: string;
    encoding?: 'json' | 'csv' | 'boolean';
  }): ChatOption {
    const cliFlag = flagName ?? toKebabFlag(name);
    return {
      name,
      flags: `--${cliFlag} <${encoding ?? 'value'}>`,
      takesValue: true,
      description,
      payloadKey,
      encoding
    };
  }
  function flag(name: string, description: string, flagName?: string): ChatOption {
    const cliFlag = flagName ?? toKebabFlag(name);
    return { name, flags: `--${cliFlag}`, takesValue: false, description };
  }

  const targetOptions: ChatOption[] = [
    value({
      name: 'id',
      flagName: 'id',
      payloadKey: 'appId',
      description: 'Target Agent ID; optional for an App API Key'
    }),
    value({
      name: 'customUid',
      description:
        'Agent conversation user ID (API Keys only; mutually exclusive with --auth-proxy)'
    }),
    value({
      name: 'authProxy',
      description:
        'Proxy Agent access as {"tmbId":"..."} or {"username":"..."} using an enabled personal API Key',
      encoding: 'json'
    })
  ];
  const chatId = value({ name: 'chatId', description: 'Agent conversation ID' });
  const dryRun = flag('dryRun', 'Validate and preview the request without making changes');

  const definitions: {
    operation: ChatOperation;
    summary: string;
    risk: CliCommandSpec['risk'];
    options: ChatOption[];
    example: string[];
  }[] = [
    {
      operation: 'run',
      summary: 'Run a published Agent conversation and return its JSON response',
      risk: 'write',
      options: [
        value({ name: 'text', description: 'User question; mutually exclusive with --messages' }),
        value({ name: 'messages', description: 'OpenAI-format message array', encoding: 'json' }),
        { ...chatId, description: 'Conversation ID; omit to create a new conversation' },
        value({ name: 'variables', description: 'Agent variables', encoding: 'json' }),
        flag(
          'detail',
          'Include detailed Agent response data and updated variables (default false)'
        ),
        value({
          name: 'file',
          description:
            'Read a JSON request object (supports advanced fields like metadata/retainDatasetCite) from a file (- reads stdin)'
        }),
        flag('stdin', 'Read a JSON request object from stdin'),
        value({
          name: 'timeout',
          flagName: 'timeout',
          description:
            'HTTP timeout in milliseconds (default 300000); a timeout does not stop the Agent'
        }),
        dryRun
      ],
      example: ['--text', 'Hello']
    },
    {
      operation: 'stop',
      summary: 'Send an Agent conversation stop signal without waiting for workflow cleanup',
      risk: 'write',
      options: [chatId, dryRun],
      example: ['--chat-id', 'conversation-id']
    },
    {
      operation: 'init',
      summary:
        'Read Agent configuration, variables, and conversation status without creating a conversation',
      risk: 'read',
      options: [chatId],
      example: ['--chat-id', 'conversation-id']
    },
    {
      operation: 'history list',
      summary: 'List accessible Agent conversations with pagination and filters',
      risk: 'read',
      options: [
        value({
          name: 'page',
          flagName: 'page',
          payloadKey: 'pageNum',
          description: 'Page number, starting at 1 (default 1)'
        }),
        value({
          name: 'pageSize',
          description: 'Items per page (default 20, capped at 500)'
        }),
        value({
          name: 'source',
          description: 'Entry source, e.g. api, online, test; App API Keys always use api'
        }),
        ...['startCreateTime', 'endCreateTime', 'startUpdateTime', 'endUpdateTime'].map((name) =>
          value({ name, description: `Conversation time filter: ${toKebabFlag(name)}` })
        )
      ],
      example: ['--page-size', '20']
    },
    {
      operation: 'history status',
      summary: 'Read generation and read status for Agent conversations',
      risk: 'read',
      options: [
        value({
          name: 'chatIds',
          description: 'Comma-separated conversation IDs (1 to 200)',
          encoding: 'csv'
        })
      ],
      example: ['--chat-ids', 'conversation-1,conversation-2']
    },
    {
      operation: 'history mark-read',
      summary: 'Mark an Agent conversation as read',
      risk: 'write',
      options: [chatId, dryRun],
      example: ['--chat-id', 'conversation-id']
    },
    {
      operation: 'history update',
      summary: 'Update an Agent conversation title or pinned state',
      risk: 'write',
      options: [
        chatId,
        value({ name: 'title', description: 'Conversation title' }),
        value({ name: 'customTitle', description: 'Custom title (an empty string clears it)' }),
        value({
          name: 'top',
          description: 'Pin or unpin the conversation: true or false',
          encoding: 'boolean'
        }),
        dryRun
      ],
      example: ['--chat-id', 'conversation-id', '--top', 'false']
    },
    {
      operation: 'history delete',
      summary: 'Soft-delete an Agent conversation',
      risk: 'destructive',
      options: [chatId, flag('yes', 'Confirm deletion'), dryRun],
      example: ['--chat-id', 'conversation-id', '--yes']
    },
    {
      operation: 'record list',
      summary: 'List Agent messages with cursor pagination (latest messages by default)',
      risk: 'read',
      options: [
        chatId,
        value({
          name: 'pageSize',
          description:
            'Target messages per page (default 20, capped at 500); full round boundaries may add messages'
        }),
        value({ name: 'prevId', description: 'Load older rounds; pass meta.prevCursor unchanged' }),
        value({ name: 'nextId', description: 'Load newer rounds; pass meta.nextCursor unchanged' }),
        value({
          name: 'initialId',
          description: 'Load messages around this dataId; use only one cursor'
        }),
        flag('includeDeleted', 'Include soft-deleted Agent messages'),
        flag('loadCustomFeedbacks', 'Include custom Agent message feedback')
      ],
      example: ['--chat-id', 'conversation-id', '--page-size', '20']
    },
    {
      operation: 'record detail',
      summary: 'Read detailed response data for an Agent assistant message',
      risk: 'read',
      options: [
        chatId,
        value({ name: 'dataId', description: 'Assistant message data ID (not its database _id)' })
      ],
      example: ['--chat-id', 'conversation-id', '--data-id', 'message-id']
    }
  ];

  return definitions.flatMap((definition): CliCommandSpec[] => {
    const fields = [...targetOptions, ...definition.options];
    const exampleOptions = ['--id', '68ad85a7463006c963799a05', ...definition.example];
    const spec: CliCommandSpec = {
      path: ['chat', ...definition.operation.split(' ')],
      summary: definition.summary,
      risk: definition.risk,
      authModes: ['token', 'personalKey', 'appKey'],
      options: fields.map(({ encoding, payloadKey, ...option }) => option),
      examples: [
        {
          description: definition.summary,
          args: ['chat', ...definition.operation.split(' '), ...exampleOptions]
        }
      ],
      execute: async ({ positional, options, client, container, resolvedAuth }) => {
        if (!client)
          throw new CliArgumentError('Active HTTP client required for Agent conversations.');

        const input = z.record(z.string(), z.unknown()).parse(
          definition.operation === 'run'
            ? await container.readJsonInput({
                file: options.file as string | undefined,
                stdin: options.stdin === true
              })
            : {}
        );

        // 支持 agent run <agentId> 位置参数；与 --id / JSON appId 重复时拒绝。
        if (positional[0] !== undefined) {
          if (options.id !== undefined || input.appId !== undefined) {
            throw new CliArgumentError(
              'Provide Agent ID either positionally, as --id, or in JSON payload, not multiple.'
            );
          }
          input.appId = positional[0];
        }

        const localOptions = ['file', 'stdin', 'timeout', 'dryRun', 'yes', 'text'];
        for (const field of fields) {
          const raw = options[field.name];
          if (raw === undefined || localOptions.includes(field.name)) continue;
          const targetKey = field.payloadKey ?? field.name;
          if (input[targetKey] !== undefined) {
            throw new CliArgumentError(
              `Provide ${targetKey} either in the JSON request or as a flag, not both.`
            );
          }
          input[targetKey] = (() => {
            if (field.encoding === 'json') {
              try {
                return JSON.parse(String(raw));
              } catch {
                throw new CliArgumentError(`--${toKebabFlag(field.name)} must be valid JSON.`);
              }
            }
            if (field.encoding === 'csv')
              return String(raw)
                .split(',')
                .map((id) => id.trim());
            if (field.encoding === 'boolean')
              return BoolSchema.parse(z.enum(['true', 'false']).parse(raw));
            return raw;
          })();
        }
        if (options.text !== undefined) {
          if (input.messages !== undefined)
            throw new CliArgumentError('Use either --text or messages.');
          input.messages = [{ role: 'user', content: options.text }];
        }

        if (definition.risk === 'destructive' && options.dryRun !== true && options.yes !== true) {
          const confirmed = await container.prompter.confirm({
            message: `Delete Agent conversation "${String(input.chatId ?? '')}" in Agent "${String(input.appId ?? resolvedAuth?.credential?.boundAppId ?? 'bound to the active API Key')}"?`,
            initialValue: false
          });
          if (!confirmed) throw new CliArgumentError('Agent conversation deletion cancelled.');
        }

        return container.chatService.execute({
          operation: definition.operation,
          client,
          input,
          credential: resolvedAuth?.credential,
          dryRun: options.dryRun === true,
          timeoutMs: options.timeout
        });
      }
    };
    if (definition.operation !== 'run') return [spec];

    return [
      spec,
      {
        ...spec,
        path: ['agent', 'run'],
        positionalArgs: [
          {
            name: 'agentId',
            required: false,
            description: 'Target Agent ObjectId (or use --id; optional for App API Key)'
          }
        ],
        examples: [
          {
            description: definition.summary,
            args: ['agent', 'run', '68ad85a7463006c963799a05', ...definition.example]
          }
        ]
      }
    ];
  });
}
