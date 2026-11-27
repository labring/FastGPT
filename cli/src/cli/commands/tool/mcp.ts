import { CliArgumentError } from '../../../shared/errors';
import {
  isPlainObject,
  parseInlineJsonValue,
  parseParentIdOption,
  resolveJsonObjectPayload,
  resolveJsonPayload
} from '../../../shared/input';
import type { CliCommandSpec } from '../../pipeline';
import {
  confirmDestructiveAction,
  createDryRunOption,
  createIdOption,
  createIdPositionalArg,
  createJsonInputOptions,
  createPaginationOptions,
  createParentIdOption,
  createSearchOption,
  createYesOption,
  parseOptionalNumber,
  requireActiveClient,
  resolveCommonAppMetadata,
  resolveIdArg,
  resolveStringOption
} from '../shared/helpers';

/** 注册 FastGPT 外部 MCP 工具集命令：list / get / children / parse / create / update / run / delete。 */
export function createToolMcpCommandSpecs(): CliCommandSpec[] {
  return [
    {
      path: ['tool', 'mcp', 'list'],
      summary: 'List FastGPT MCP toolsets accessible to the current team',
      risk: 'read',
      authModes: ['token', 'personalKey'],
      options: [
        createSearchOption('Search MCP toolsets by name or intro'),
        createParentIdOption('Filter by parent tool folder ID ("null" for root)'),
        ...createPaginationOptions()
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
      positionalArgs: [createIdPositionalArg('appId', 'MCP toolset')],
      options: [createIdOption('appId', 'MCP toolset')],
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
      positionalArgs: [createIdPositionalArg('appId', 'MCP toolset')],
      options: [
        createIdOption('appId', 'MCP toolset'),
        createSearchOption('Filter child tools by tool name')
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
        createParentIdOption('Target parent tool folder ID ("null" for root)'),
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
        ...createJsonInputOptions('create'),
        createDryRunOption('Validate and preview creation without executing')
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
        const metadata = resolveCommonAppMetadata(options, filePayload);

        return container.mcpToolService.create({
          client: activeClient,
          input: {
            name: (metadata.name ?? '').trim(),
            url: (resolveStringOption(options, filePayload, 'url') ?? '').trim(),
            intro: metadata.intro,
            avatar: metadata.avatar,
            parentId: metadata.parentId,
            inheritPermission:
              typeof filePayload?.inheritPermission === 'boolean'
                ? filePayload.inheritPermission
                : undefined,
            headerSecret:
              options.headerSecret !== undefined
                ? parseInlineJsonValue(options.headerSecret, '--header-secret')
                : filePayload?.headerSecret,
            toolList:
              options.toolList !== undefined
                ? parseInlineJsonValue(options.toolList, '--tool-list')
                : filePayload?.toolList
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
      positionalArgs: [createIdPositionalArg('appId', 'MCP toolset')],
      options: [
        createIdOption('appId', 'MCP toolset'),
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
        createParentIdOption('Move to target tool folder ID ("null" for root)'),
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
        ...createJsonInputOptions('update'),
        createDryRunOption('Validate and preview update without applying')
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

        return container.mcpToolService.update({
          client: activeClient,
          appId,
          metadata: resolveCommonAppMetadata(options, filePayload),
          config: {
            url: resolveStringOption(options, filePayload, 'url'),
            headerSecret:
              options.headerSecret !== undefined
                ? parseInlineJsonValue(options.headerSecret, '--header-secret')
                : filePayload?.headerSecret,
            toolList:
              options.toolList !== undefined
                ? parseInlineJsonValue(options.toolList, '--tool-list')
                : filePayload?.toolList,
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
        ...createJsonInputOptions('run'),
        createDryRunOption('Validate and preview MCP tool call without executing')
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

        return container.mcpToolService.run({
          client: activeClient,
          input: {
            appId: resolveStringOption(options, filePayload, 'id', 'appId'),
            url: resolveStringOption(options, filePayload, 'url'),
            toolName: resolveStringOption(options, filePayload, 'tool', 'toolName') ?? '',
            params: rawParams,
            headerSecret:
              options.headerSecret !== undefined
                ? parseInlineJsonValue(options.headerSecret, '--header-secret')
                : filePayload?.headerSecret
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
      positionalArgs: [createIdPositionalArg('appId', 'MCP toolset')],
      options: [
        createIdOption('appId', 'MCP toolset'),
        createYesOption(),
        createDryRunOption('Preview deletion without executing')
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
