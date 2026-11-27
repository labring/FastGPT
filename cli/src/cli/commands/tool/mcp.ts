import { CliArgumentError } from '../../../shared/errors';
import {
  isPlainObject,
  parseParentIdOption,
  resolveJsonObjectPayload,
  resolveJsonPayload
} from '../../../shared/input';
import type { CliCommandSpec } from '../../pipeline';
import {
  confirmDestructiveAction,
  parseOptionalNumber,
  requireActiveClient,
  resolveIdArg
} from '../dataset/shared';

function parseInlineJsonValue(raw: unknown, flagLabel: string): unknown {
  if (typeof raw !== 'string') return undefined;
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  try {
    return JSON.parse(trimmed) as unknown;
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    throw new CliArgumentError(`Invalid JSON for ${flagLabel}: ${msg}`);
  }
}

/** 注册 FastGPT 外部 MCP 工具集命令：list / get / children / parse / create / update / run / delete。 */
export function createToolMcpCommandSpecs(): CliCommandSpec[] {
  return [
    {
      path: ['tool', 'mcp', 'list'],
      summary: 'List FastGPT MCP toolsets accessible to the current team',
      risk: 'read',
      authModes: ['token', 'personalKey'],
      options: [
        {
          name: 'search',
          flags: '--search <keyword>',
          takesValue: true,
          description: 'Search MCP toolsets by name or intro'
        },
        {
          name: 'parentId',
          flags: '--parent-id <id>',
          takesValue: true,
          description: 'Filter by parent tool folder ID ("null" for root)'
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
        { description: 'List MCP toolsets', args: ['tool', 'mcp', 'list'] },
        {
          description: 'Search MCP toolsets inside a folder',
          args: ['tool', 'mcp', 'list', '--parent-id', '68ad85a7463006c963799a05']
        }
      ],
      execute: ({ options, client, container }) =>
        container.mcpToolService.list({
          client: requireActiveClient(client, 'tool mcp list'),
          input: {
            searchKey: typeof options.search === 'string' ? options.search : undefined,
            parentId: parseParentIdOption(options.parentId),
            page: parseOptionalNumber(options.page),
            pageSize: parseOptionalNumber(options.pageSize)
          }
        })
    },

    {
      path: ['tool', 'mcp', 'get'],
      summary: 'Get details and configuration of a FastGPT MCP toolset',
      risk: 'read',
      authModes: ['token'],
      positionalArgs: [
        { name: 'appId', required: false, description: 'MCP toolset ObjectId (or use --id)' }
      ],
      options: [
        {
          name: 'id',
          flags: '--id <appId>',
          takesValue: true,
          description: 'MCP toolset ObjectId (alternative to positional argument)'
        }
      ],
      examples: [
        {
          description: 'Inspect an MCP toolset configuration',
          args: ['tool', 'mcp', 'get', '68ad85a7463006c963799a05']
        }
      ],
      execute: ({ positional, options, client, container }) => {
        const activeClient = requireActiveClient(client, 'tool mcp get');
        const appId = resolveIdArg({
          positional: positional[0],
          flagValue: options.id,
          label: 'MCP toolset ID',
          usage: 'fastgpt tool mcp get <appId> or fastgpt tool mcp get --id <appId>'
        });

        return container.mcpToolService.getDetail({
          client: activeClient,
          appId
        });
      }
    },

    {
      path: ['tool', 'mcp', 'children'],
      summary: 'List child tools exposed by an MCP toolset (with workflow reference IDs)',
      risk: 'read',
      authModes: ['token'],
      positionalArgs: [
        { name: 'appId', required: false, description: 'MCP toolset ObjectId (or use --id)' }
      ],
      options: [
        {
          name: 'id',
          flags: '--id <appId>',
          takesValue: true,
          description: 'MCP toolset ObjectId (alternative to positional argument)'
        },
        {
          name: 'search',
          flags: '--search <keyword>',
          takesValue: true,
          description: 'Filter child tools by tool name'
        }
      ],
      examples: [
        {
          description: 'List child tools of an MCP toolset',
          args: ['tool', 'mcp', 'children', '68ad85a7463006c963799a05']
        }
      ],
      execute: ({ positional, options, client, container }) => {
        const activeClient = requireActiveClient(client, 'tool mcp children');
        const appId = resolveIdArg({
          positional: positional[0],
          flagValue: options.id,
          label: 'MCP toolset ID',
          usage: 'fastgpt tool mcp children <appId>'
        });

        return container.mcpToolService.listChildren({
          client: activeClient,
          appId,
          searchKey: typeof options.search === 'string' ? options.search : undefined
        });
      }
    },

    {
      path: ['tool', 'mcp', 'parse'],
      summary: 'Probe a remote MCP server URL and list its tools without creating a toolset',
      risk: 'read',
      authModes: ['token'],
      positionalArgs: [
        { name: 'url', required: false, description: 'Remote MCP server URL (or use --url)' }
      ],
      options: [
        {
          name: 'url',
          flags: '--url <url>',
          takesValue: true,
          description: 'Remote MCP server URL (SSE or Streamable HTTP)'
        },
        {
          name: 'headerSecret',
          flags: '--header-secret <json>',
          takesValue: true,
          description:
            'JSON object of request headers (e.g. \'{"Authorization":"Bearer xxx"}\' or StoreSecretValueType)'
        }
      ],
      examples: [
        {
          description: 'Parse tools from a remote MCP server',
          args: ['tool', 'mcp', 'parse', 'https://mcp.deepwiki.com/mcp']
        }
      ],
      execute: ({ positional, options, client, container }) => {
        const activeClient = requireActiveClient(client, 'tool mcp parse');
        const url = resolveIdArg({
          positional: positional[0],
          flagValue: options.url,
          label: 'MCP server URL',
          usage: 'fastgpt tool mcp parse <url> or fastgpt tool mcp parse --url <url>'
        });

        return container.mcpToolService.parse({
          client: activeClient,
          url,
          headerSecret: parseInlineJsonValue(options.headerSecret, '--header-secret')
        });
      }
    },

    {
      path: ['tool', 'mcp', 'create'],
      summary: 'Create a FastGPT MCP toolset (auto-parses remote tools if --tool-list is omitted)',
      risk: 'write',
      authModes: ['token'],
      options: [
        {
          name: 'name',
          flags: '--name <name>',
          takesValue: true,
          description: 'MCP toolset display name'
        },
        {
          name: 'url',
          flags: '--url <url>',
          takesValue: true,
          description: 'Remote MCP server URL'
        },
        {
          name: 'intro',
          flags: '--intro <text>',
          takesValue: true,
          description: 'MCP toolset description'
        },
        {
          name: 'avatar',
          flags: '--avatar <path>',
          takesValue: true,
          description: 'Avatar path (e.g. from "fastgpt file upload-avatar")'
        },
        {
          name: 'parentId',
          flags: '--parent-id <id>',
          takesValue: true,
          description: 'Target parent tool folder ID ("null" for root)'
        },
        {
          name: 'headerSecret',
          flags: '--header-secret <json>',
          takesValue: true,
          description: 'JSON object of auth/custom headers for the MCP server'
        },
        {
          name: 'toolList',
          flags: '--tool-list <json>',
          takesValue: true,
          description:
            'Explicit toolList JSON array (if omitted, automatically fetched via MCP parse)'
        },
        {
          name: 'file',
          flags: '--file <path>',
          takesValue: true,
          description: 'Read create JSON payload from file ("-" for stdin)'
        },
        {
          name: 'stdin',
          flags: '--stdin',
          takesValue: false,
          description: 'Read create JSON payload from stdin'
        },
        {
          name: 'dryRun',
          flags: '--dry-run',
          takesValue: false,
          description: 'Validate and preview creation without executing'
        }
      ],
      examples: [
        {
          description: 'Create an MCP toolset with auto-parsed tools',
          args: [
            'tool',
            'mcp',
            'create',
            '--name',
            'DeepWiki MCP',
            '--url',
            'https://mcp.deepwiki.com/mcp'
          ]
        }
      ],
      execute: async ({ options, client, container }) => {
        const activeClient = requireActiveClient(client, 'tool mcp create');
        const filePayload = await resolveJsonObjectPayload({
          filePath: typeof options.file === 'string' ? options.file : undefined,
          useStdin: options.stdin === true,
          readTextFile: container.fileIo.readTextFile,
          readStdin: container.readStdin,
          fieldLabel: 'tool mcp create payload'
        });

        const name =
          (typeof options.name === 'string' ? options.name.trim() : '') ||
          (typeof filePayload?.name === 'string' ? filePayload.name.trim() : '');
        const url =
          (typeof options.url === 'string' ? options.url.trim() : '') ||
          (typeof filePayload?.url === 'string' ? filePayload.url.trim() : '');

        const headerSecret =
          options.headerSecret !== undefined
            ? parseInlineJsonValue(options.headerSecret, '--header-secret')
            : filePayload?.headerSecret;

        const toolList =
          options.toolList !== undefined
            ? parseInlineJsonValue(options.toolList, '--tool-list')
            : filePayload?.toolList;

        return container.mcpToolService.create({
          client: activeClient,
          input: {
            name,
            url,
            intro:
              typeof options.intro === 'string'
                ? options.intro
                : typeof filePayload?.intro === 'string'
                  ? filePayload.intro
                  : undefined,
            avatar:
              typeof options.avatar === 'string'
                ? options.avatar
                : typeof filePayload?.avatar === 'string'
                  ? filePayload.avatar
                  : undefined,
            parentId:
              options.parentId !== undefined
                ? parseParentIdOption(options.parentId)
                : filePayload?.parentId !== undefined
                  ? parseParentIdOption(filePayload.parentId)
                  : undefined,
            inheritPermission:
              typeof filePayload?.inheritPermission === 'boolean'
                ? filePayload.inheritPermission
                : undefined,
            headerSecret,
            toolList
          },
          dryRun: options.dryRun === true
        });
      }
    },

    {
      path: ['tool', 'mcp', 'update'],
      summary: 'Update MCP toolset metadata (name/intro/avatar/folder) and/or MCP config/tools',
      risk: 'write',
      authModes: ['token'],
      positionalArgs: [
        { name: 'appId', required: false, description: 'MCP toolset ObjectId (or use --id)' }
      ],
      options: [
        {
          name: 'id',
          flags: '--id <appId>',
          takesValue: true,
          description: 'MCP toolset ObjectId (alternative to positional argument)'
        },
        {
          name: 'name',
          flags: '--name <name>',
          takesValue: true,
          description: 'New display name'
        },
        {
          name: 'intro',
          flags: '--intro <text>',
          takesValue: true,
          description: 'New description'
        },
        {
          name: 'avatar',
          flags: '--avatar <path>',
          takesValue: true,
          description: 'New avatar path'
        },
        {
          name: 'parentId',
          flags: '--parent-id <id>',
          takesValue: true,
          description: 'Move to target tool folder ID ("null" for root)'
        },
        {
          name: 'url',
          flags: '--url <url>',
          takesValue: true,
          description: 'New remote MCP server URL'
        },
        {
          name: 'headerSecret',
          flags: '--header-secret <json>',
          takesValue: true,
          description: 'New JSON object of MCP request headers'
        },
        {
          name: 'toolList',
          flags: '--tool-list <json>',
          takesValue: true,
          description: 'Explicit replacement toolList JSON array'
        },
        {
          name: 'refresh',
          flags: '--refresh',
          takesValue: false,
          description: 'Re-fetch toolList from the remote MCP server'
        },
        {
          name: 'file',
          flags: '--file <path>',
          takesValue: true,
          description: 'Read update JSON payload from file ("-" for stdin)'
        },
        {
          name: 'stdin',
          flags: '--stdin',
          takesValue: false,
          description: 'Read update JSON payload from stdin'
        },
        {
          name: 'dryRun',
          flags: '--dry-run',
          takesValue: false,
          description: 'Validate and preview update without applying'
        }
      ],
      examples: [
        {
          description: 'Update MCP toolset avatar',
          args: [
            'tool',
            'mcp',
            'update',
            '68ad85a7463006c963799a05',
            '--avatar',
            '/api/system/img/avatar/team/file/mcp.png'
          ]
        },
        {
          description: 'Refresh remote MCP tools',
          args: ['tool', 'mcp', 'update', '68ad85a7463006c963799a05', '--refresh']
        }
      ],
      execute: async ({ positional, options, client, container }) => {
        const activeClient = requireActiveClient(client, 'tool mcp update');
        const filePayload = await resolveJsonObjectPayload({
          filePath: typeof options.file === 'string' ? options.file : undefined,
          useStdin: options.stdin === true,
          readTextFile: container.fileIo.readTextFile,
          readStdin: container.readStdin,
          fieldLabel: 'tool mcp update payload'
        });

        const appId = resolveIdArg({
          positional: positional[0],
          flagValue:
            options.id ?? (typeof filePayload?.appId === 'string' ? filePayload.appId : ''),
          label: 'MCP toolset ID',
          usage: 'fastgpt tool mcp update <appId> --avatar <path> | --refresh'
        });

        const headerSecret =
          options.headerSecret !== undefined
            ? parseInlineJsonValue(options.headerSecret, '--header-secret')
            : filePayload?.headerSecret;

        const toolList =
          options.toolList !== undefined
            ? parseInlineJsonValue(options.toolList, '--tool-list')
            : filePayload?.toolList;

        return container.mcpToolService.update({
          client: activeClient,
          appId,
          metadata: {
            name:
              typeof options.name === 'string'
                ? options.name
                : typeof filePayload?.name === 'string'
                  ? filePayload.name
                  : undefined,
            intro:
              typeof options.intro === 'string'
                ? options.intro
                : typeof filePayload?.intro === 'string'
                  ? filePayload.intro
                  : undefined,
            avatar:
              typeof options.avatar === 'string'
                ? options.avatar
                : typeof filePayload?.avatar === 'string'
                  ? filePayload.avatar
                  : undefined,
            parentId:
              options.parentId !== undefined
                ? parseParentIdOption(options.parentId)
                : filePayload?.parentId !== undefined
                  ? parseParentIdOption(filePayload.parentId)
                  : undefined
          },
          config: {
            url:
              typeof options.url === 'string'
                ? options.url
                : typeof filePayload?.url === 'string'
                  ? filePayload.url
                  : undefined,
            headerSecret,
            toolList,
            refresh: options.refresh === true || filePayload?.refresh === true
          },
          dryRun: options.dryRun === true
        });
      }
    },

    {
      path: ['tool', 'mcp', 'run'],
      summary: 'Execute a single remote MCP tool call for testing',
      risk: 'write',
      authModes: ['token'],
      options: [
        {
          name: 'id',
          flags: '--id <appId>',
          takesValue: true,
          description: 'Saved MCP toolset ObjectId (auto-loads url and headerSecret)'
        },
        {
          name: 'url',
          flags: '--url <url>',
          takesValue: true,
          description: 'Remote MCP server URL (optional when --id is provided)'
        },
        {
          name: 'tool',
          flags: '--tool <toolName>',
          takesValue: true,
          description: 'MCP tool name to invoke'
        },
        {
          name: 'params',
          flags: '--params <json>',
          takesValue: true,
          description: 'Tool arguments as a JSON object (default {})'
        },
        {
          name: 'headerSecret',
          flags: '--header-secret <json>',
          takesValue: true,
          description: 'JSON object of MCP request headers'
        },
        {
          name: 'file',
          flags: '--file <path>',
          takesValue: true,
          description: 'Read run JSON payload from file ("-" for stdin)'
        },
        {
          name: 'stdin',
          flags: '--stdin',
          takesValue: false,
          description: 'Read run JSON payload from stdin'
        },
        {
          name: 'dryRun',
          flags: '--dry-run',
          takesValue: false,
          description: 'Validate and preview MCP tool call without executing'
        }
      ],
      examples: [
        {
          description: 'Test an MCP tool call',
          args: [
            'tool',
            'mcp',
            'run',
            '--url',
            'https://mcp.deepwiki.com/mcp',
            '--tool',
            'read_wiki_structure',
            '--params',
            '{"repoName":"labring/FastGPT"}'
          ]
        }
      ],
      execute: async ({ options, client, container }) => {
        const activeClient = requireActiveClient(client, 'tool mcp run');
        const filePayload = await resolveJsonObjectPayload({
          filePath: typeof options.file === 'string' ? options.file : undefined,
          useStdin: options.stdin === true,
          readTextFile: container.fileIo.readTextFile,
          readStdin: container.readStdin,
          fieldLabel: 'tool mcp run payload'
        });

        const rawParams =
          options.params !== undefined
            ? await resolveJsonPayload({
                inlineJson: typeof options.params === 'string' ? options.params : undefined,
                readTextFile: container.fileIo.readTextFile,
                readStdin: container.readStdin,
                fieldLabel: '--params'
              })
            : filePayload?.params;
        if (rawParams !== undefined && !isPlainObject(rawParams)) {
          throw new CliArgumentError('--params must be a JSON object.');
        }

        const headerSecret =
          options.headerSecret !== undefined
            ? parseInlineJsonValue(options.headerSecret, '--header-secret')
            : filePayload?.headerSecret;

        return container.mcpToolService.run({
          client: activeClient,
          input: {
            appId:
              (typeof options.id === 'string' ? options.id : undefined) ??
              (typeof filePayload?.appId === 'string' ? filePayload.appId : undefined),
            url:
              (typeof options.url === 'string' ? options.url : undefined) ??
              (typeof filePayload?.url === 'string' ? filePayload.url : undefined),
            toolName:
              (typeof options.tool === 'string' ? options.tool : undefined) ??
              (typeof filePayload?.toolName === 'string' ? filePayload.toolName : ''),
            params: rawParams,
            headerSecret
          },
          dryRun: options.dryRun === true
        });
      }
    },

    {
      path: ['tool', 'mcp', 'delete'],
      summary: 'Delete a FastGPT MCP toolset',
      risk: 'destructive',
      authModes: ['token'],
      positionalArgs: [
        { name: 'appId', required: false, description: 'MCP toolset ObjectId (or use --id)' }
      ],
      options: [
        {
          name: 'id',
          flags: '--id <appId>',
          takesValue: true,
          description: 'MCP toolset ObjectId (alternative to positional argument)'
        },
        {
          name: 'yes',
          flags: '--yes',
          takesValue: false,
          description: 'Confirm destructive deletion'
        },
        {
          name: 'dryRun',
          flags: '--dry-run',
          takesValue: false,
          description: 'Preview deletion without executing'
        }
      ],
      examples: [
        {
          description: 'Delete an MCP toolset non-interactively',
          args: ['tool', 'mcp', 'delete', '68ad85a7463006c963799a05', '--yes']
        }
      ],
      execute: async (ctx) => {
        const activeClient = requireActiveClient(ctx.client, 'tool mcp delete');
        const appId = resolveIdArg({
          positional: ctx.positional[0],
          flagValue: ctx.options.id,
          label: 'MCP toolset ID',
          usage: 'fastgpt tool mcp delete <appId> --yes'
        });

        await confirmDestructiveAction({
          ctx,
          message: `Delete MCP toolset "${appId}"?`
        });

        return ctx.container.mcpToolService.delete({
          client: activeClient,
          appId,
          dryRun: ctx.options.dryRun === true
        });
      }
    }
  ];
}
