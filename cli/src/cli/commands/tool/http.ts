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

/** 注册 FastGPT HTTP 工具集命令：list / get / children / parse / create / update / run / delete。 */
export function createToolHttpCommandSpecs(): CliCommandSpec[] {
  return [
    {
      path: ['tool', 'http', 'list'],
      summary: 'List FastGPT HTTP toolsets accessible to the current team',
      risk: 'read',
      authModes: ['token', 'personalKey'],
      options: [
        {
          name: 'search',
          flags: '--search <keyword>',
          takesValue: true,
          description: 'Search HTTP toolsets by name or intro'
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
        { description: 'List HTTP toolsets', args: ['tool', 'http', 'list'] },
        {
          description: 'Search HTTP toolsets by keyword',
          args: ['tool', 'http', 'list', '--search', 'weather']
        }
      ],
      execute: ({ options, client, container }) =>
        container.httpToolService.list({
          client: requireActiveClient(client, 'tool http list'),
          input: {
            searchKey: typeof options.search === 'string' ? options.search : undefined,
            parentId: parseParentIdOption(options.parentId),
            page: parseOptionalNumber(options.page),
            pageSize: parseOptionalNumber(options.pageSize)
          }
        })
    },

    {
      path: ['tool', 'http', 'get'],
      summary: 'Get details and configuration of a FastGPT HTTP toolset',
      risk: 'read',
      authModes: ['token'],
      positionalArgs: [
        { name: 'appId', required: false, description: 'HTTP toolset ObjectId (or use --id)' }
      ],
      options: [
        {
          name: 'id',
          flags: '--id <appId>',
          takesValue: true,
          description: 'HTTP toolset ObjectId (alternative to positional argument)'
        }
      ],
      examples: [
        {
          description: 'Inspect an HTTP toolset configuration',
          args: ['tool', 'http', 'get', '68ad85a7463006c963799a05']
        }
      ],
      execute: ({ positional, options, client, container }) => {
        const activeClient = requireActiveClient(client, 'tool http get');
        const appId = resolveIdArg({
          positional: positional[0],
          flagValue: options.id,
          label: 'HTTP toolset ID',
          usage: 'fastgpt tool http get <appId> or fastgpt tool http get --id <appId>'
        });

        return container.httpToolService.getDetail({
          client: activeClient,
          appId
        });
      }
    },

    {
      path: ['tool', 'http', 'children'],
      summary: 'List child tools of an HTTP toolset with pagination and search',
      risk: 'read',
      authModes: ['token', 'personalKey'],
      positionalArgs: [
        { name: 'appId', required: false, description: 'HTTP toolset ObjectId (or use --id)' }
      ],
      options: [
        {
          name: 'id',
          flags: '--id <appId>',
          takesValue: true,
          description: 'HTTP toolset ObjectId (alternative to positional argument)'
        },
        {
          name: 'search',
          flags: '--search <keyword>',
          takesValue: true,
          description: 'Filter child tools by name or description'
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
          description: 'List child tools of an HTTP toolset',
          args: ['tool', 'http', 'children', '68ad85a7463006c963799a05']
        }
      ],
      execute: ({ positional, options, client, container }) => {
        const activeClient = requireActiveClient(client, 'tool http children');
        const appId = resolveIdArg({
          positional: positional[0],
          flagValue: options.id,
          label: 'HTTP toolset ID',
          usage: 'fastgpt tool http children <appId>'
        });

        return container.httpToolService.listChildren({
          client: activeClient,
          input: {
            appId,
            searchKey: typeof options.search === 'string' ? options.search : undefined,
            page: parseOptionalNumber(options.page),
            pageSize: parseOptionalNumber(options.pageSize)
          }
        });
      }
    },

    {
      path: ['tool', 'http', 'parse'],
      summary: 'Fetch and parse an OpenAPI/Swagger schema from a URL',
      risk: 'read',
      authModes: ['token'],
      positionalArgs: [
        { name: 'url', required: false, description: 'OpenAPI/Swagger schema URL (or use --url)' }
      ],
      options: [
        {
          name: 'url',
          flags: '--url <url>',
          takesValue: true,
          description: 'OpenAPI/Swagger schema URL'
        }
      ],
      examples: [
        {
          description: 'Parse OpenAPI schema from URL',
          args: ['tool', 'http', 'parse', 'https://petstore3.swagger.io/api/v3/openapi.json']
        }
      ],
      execute: ({ positional, options, client, container }) => {
        const activeClient = requireActiveClient(client, 'tool http parse');
        const url = resolveIdArg({
          positional: positional[0],
          flagValue: options.url,
          label: 'OpenAPI schema URL',
          usage: 'fastgpt tool http parse <url> or fastgpt tool http parse --url <url>'
        });

        return container.httpToolService.parse({
          client: activeClient,
          url
        });
      }
    },

    {
      path: ['tool', 'http', 'create'],
      summary: 'Create a FastGPT HTTP toolset (optionally configuring tools immediately)',
      risk: 'write',
      authModes: ['token'],
      options: [
        {
          name: 'name',
          flags: '--name <name>',
          takesValue: true,
          description: 'HTTP toolset display name'
        },
        {
          name: 'intro',
          flags: '--intro <text>',
          takesValue: true,
          description: 'HTTP toolset description'
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
          name: 'targetUrl',
          flags: '--target-url <url>',
          takesValue: true,
          description: 'Target HTTP API base URL (maps to API field baseUrl)'
        },
        {
          name: 'apiSchema',
          flags: '--api-schema <str>',
          takesValue: true,
          description: 'Raw OpenAPI schema string (for batch mode)'
        },
        {
          name: 'toolList',
          flags: '--tool-list <json>',
          takesValue: true,
          description: 'HTTP toolList JSON array to populate immediately after creation'
        },
        {
          name: 'headerSecret',
          flags: '--header-secret <json>',
          takesValue: true,
          description: 'JSON object of secret headers'
        },
        {
          name: 'customHeaders',
          flags: '--custom-headers <json>',
          takesValue: true,
          description: 'Custom headers JSON string or object'
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
          description: 'Create an empty manual HTTP toolset',
          args: ['tool', 'http', 'create', '--name', 'Weather API']
        },
        {
          description: 'Create and populate an HTTP toolset from JSON file',
          args: ['tool', 'http', 'create', '--file', './http-toolset.json']
        }
      ],
      execute: async ({ options, client, container }) => {
        const activeClient = requireActiveClient(client, 'tool http create');
        const filePayload = await resolveJsonObjectPayload({
          filePath: typeof options.file === 'string' ? options.file : undefined,
          useStdin: options.stdin === true,
          readTextFile: container.fileIo.readTextFile,
          readStdin: container.readStdin,
          fieldLabel: 'tool http create payload'
        });

        const name =
          (typeof options.name === 'string' ? options.name.trim() : '') ||
          (typeof filePayload?.name === 'string' ? filePayload.name.trim() : '');

        const headerSecret =
          options.headerSecret !== undefined
            ? parseInlineJsonValue(options.headerSecret, '--header-secret')
            : filePayload?.headerSecret;
        const toolList =
          options.toolList !== undefined
            ? parseInlineJsonValue(options.toolList, '--tool-list')
            : filePayload?.toolList;
        const targetBaseUrl =
          typeof options.targetUrl === 'string'
            ? options.targetUrl
            : typeof filePayload?.baseUrl === 'string'
              ? filePayload.baseUrl
              : undefined;
        const apiSchemaStr =
          typeof options.apiSchema === 'string'
            ? options.apiSchema
            : typeof filePayload?.apiSchemaStr === 'string'
              ? filePayload.apiSchemaStr
              : undefined;
        const customHeaders =
          options.customHeaders !== undefined ? options.customHeaders : filePayload?.customHeaders;

        const hasConfig =
          targetBaseUrl !== undefined ||
          apiSchemaStr !== undefined ||
          toolList !== undefined ||
          headerSecret !== undefined ||
          customHeaders !== undefined;

        return container.httpToolService.create({
          client: activeClient,
          input: {
            name,
            createType:
              typeof filePayload?.createType === 'string'
                ? filePayload.createType.trim()
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
                  : undefined,
            inheritPermission:
              typeof filePayload?.inheritPermission === 'boolean'
                ? filePayload.inheritPermission
                : undefined
          },
          config: hasConfig
            ? {
                baseUrl: targetBaseUrl,
                apiSchemaStr,
                toolList,
                headerSecret,
                customHeaders
              }
            : undefined,
          dryRun: options.dryRun === true
        });
      }
    },

    {
      path: ['tool', 'http', 'update'],
      summary: 'Update HTTP toolset metadata (name/intro/avatar/folder) and/or API config/tools',
      risk: 'write',
      authModes: ['token'],
      positionalArgs: [
        { name: 'appId', required: false, description: 'HTTP toolset ObjectId (or use --id)' }
      ],
      options: [
        {
          name: 'id',
          flags: '--id <appId>',
          takesValue: true,
          description: 'HTTP toolset ObjectId (alternative to positional argument)'
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
          name: 'targetUrl',
          flags: '--target-url <url>',
          takesValue: true,
          description: 'New target HTTP API base URL (maps to API field baseUrl)'
        },
        {
          name: 'apiSchema',
          flags: '--api-schema <str>',
          takesValue: true,
          description: 'New raw OpenAPI schema string'
        },
        {
          name: 'toolList',
          flags: '--tool-list <json>',
          takesValue: true,
          description: 'Replacement HTTP toolList JSON array'
        },
        {
          name: 'headerSecret',
          flags: '--header-secret <json>',
          takesValue: true,
          description: 'New JSON object of secret headers'
        },
        {
          name: 'customHeaders',
          flags: '--custom-headers <json>',
          takesValue: true,
          description: 'New custom headers JSON string or object'
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
          description: 'Update an HTTP toolset avatar',
          args: [
            'tool',
            'http',
            'update',
            '68ad85a7463006c963799a05',
            '--avatar',
            '/api/system/img/avatar/team/file/http.png'
          ]
        }
      ],
      execute: async ({ positional, options, client, container }) => {
        const activeClient = requireActiveClient(client, 'tool http update');
        const filePayload = await resolveJsonObjectPayload({
          filePath: typeof options.file === 'string' ? options.file : undefined,
          useStdin: options.stdin === true,
          readTextFile: container.fileIo.readTextFile,
          readStdin: container.readStdin,
          fieldLabel: 'tool http update payload'
        });

        const appId = resolveIdArg({
          positional: positional[0],
          flagValue:
            options.id ?? (typeof filePayload?.appId === 'string' ? filePayload.appId : ''),
          label: 'HTTP toolset ID',
          usage: 'fastgpt tool http update <appId> --avatar <path> | --file <spec.json>'
        });

        const headerSecret =
          options.headerSecret !== undefined
            ? parseInlineJsonValue(options.headerSecret, '--header-secret')
            : filePayload?.headerSecret;
        const toolList =
          options.toolList !== undefined
            ? parseInlineJsonValue(options.toolList, '--tool-list')
            : filePayload?.toolList;

        return container.httpToolService.update({
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
            baseUrl:
              typeof options.targetUrl === 'string'
                ? options.targetUrl
                : typeof filePayload?.baseUrl === 'string'
                  ? filePayload.baseUrl
                  : undefined,
            apiSchemaStr:
              typeof options.apiSchema === 'string'
                ? options.apiSchema
                : typeof filePayload?.apiSchemaStr === 'string'
                  ? filePayload.apiSchemaStr
                  : undefined,
            toolList,
            headerSecret,
            customHeaders:
              options.customHeaders !== undefined
                ? options.customHeaders
                : filePayload?.customHeaders
          },
          dryRun: options.dryRun === true
        });
      }
    },

    {
      path: ['tool', 'http', 'run'],
      summary: 'Execute a single HTTP tool call for testing',
      risk: 'write',
      authModes: ['token'],
      options: [
        {
          name: 'id',
          flags: '--id <appId>',
          takesValue: true,
          description: 'Saved HTTP toolset ObjectId (auto-loads targetUrl, headers, and apiSchema)'
        },
        {
          name: 'targetUrl',
          flags: '--target-url <url>',
          takesValue: true,
          description: 'Target HTTP API base URL (optional when --id is provided)'
        },
        {
          name: 'toolPath',
          flags: '--tool-path <path>',
          takesValue: true,
          description: 'HTTP tool endpoint path (e.g. /get)'
        },
        {
          name: 'method',
          flags: '--method <method>',
          takesValue: true,
          description: 'HTTP method (default POST)'
        },
        {
          name: 'params',
          flags: '--params <json>',
          takesValue: true,
          description: 'Tool arguments JSON object (default {})'
        },
        {
          name: 'apiSchema',
          flags: '--api-schema <str>',
          takesValue: true,
          description: 'Optional OpenAPI schema raw string'
        },
        {
          name: 'customHeaders',
          flags: '--custom-headers <json>',
          takesValue: true,
          description: 'Custom headers JSON object'
        },
        {
          name: 'headerSecret',
          flags: '--header-secret <json>',
          takesValue: true,
          description: 'Secret headers JSON object'
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
          description: 'Validate and preview HTTP tool call without executing'
        }
      ],
      examples: [
        {
          description: 'Test an HTTP tool call',
          args: [
            'tool',
            'http',
            'run',
            '--target-url',
            'https://httpbin.org',
            '--tool-path',
            '/get',
            '--method',
            'GET',
            '--params',
            '{"q":"fastgpt"}'
          ]
        }
      ],
      execute: async ({ options, client, container }) => {
        const activeClient = requireActiveClient(client, 'tool http run');
        const filePayload = await resolveJsonObjectPayload({
          filePath: typeof options.file === 'string' ? options.file : undefined,
          useStdin: options.stdin === true,
          readTextFile: container.fileIo.readTextFile,
          readStdin: container.readStdin,
          fieldLabel: 'tool http run payload'
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

        const rawCustomHeaders =
          options.customHeaders !== undefined
            ? parseInlineJsonValue(options.customHeaders, '--custom-headers')
            : filePayload?.customHeaders;
        if (rawCustomHeaders !== undefined && !isPlainObject(rawCustomHeaders)) {
          throw new CliArgumentError('--custom-headers must be a JSON object.');
        }

        const headerSecret =
          options.headerSecret !== undefined
            ? parseInlineJsonValue(options.headerSecret, '--header-secret')
            : filePayload?.headerSecret;

        return container.httpToolService.run({
          client: activeClient,
          input: {
            appId:
              (typeof options.id === 'string' ? options.id : undefined) ??
              (typeof filePayload?.appId === 'string' ? filePayload.appId : undefined),
            baseUrl:
              (typeof options.targetUrl === 'string' ? options.targetUrl : undefined) ??
              (typeof filePayload?.baseUrl === 'string' ? filePayload.baseUrl : undefined),
            toolPath:
              (typeof options.toolPath === 'string' ? options.toolPath : undefined) ??
              (typeof filePayload?.toolPath === 'string' ? filePayload.toolPath : ''),
            method:
              (typeof options.method === 'string' ? options.method : undefined) ??
              (typeof filePayload?.method === 'string' ? filePayload.method : undefined),
            params: rawParams,
            apiSchemaStr:
              (typeof options.apiSchema === 'string' ? options.apiSchema : undefined) ??
              (typeof filePayload?.apiSchemaStr === 'string'
                ? filePayload.apiSchemaStr
                : undefined),
            customHeaders: rawCustomHeaders as
              | Record<string, string | number | boolean>
              | undefined,
            headerSecret,
            staticParams: filePayload?.staticParams,
            staticHeaders: filePayload?.staticHeaders,
            staticBody: filePayload?.staticBody
          },
          dryRun: options.dryRun === true
        });
      }
    },

    {
      path: ['tool', 'http', 'delete'],
      summary: 'Delete a FastGPT HTTP toolset',
      risk: 'destructive',
      authModes: ['token'],
      positionalArgs: [
        { name: 'appId', required: false, description: 'HTTP toolset ObjectId (or use --id)' }
      ],
      options: [
        {
          name: 'id',
          flags: '--id <appId>',
          takesValue: true,
          description: 'HTTP toolset ObjectId (alternative to positional argument)'
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
          description: 'Delete an HTTP toolset non-interactively',
          args: ['tool', 'http', 'delete', '68ad85a7463006c963799a05', '--yes']
        }
      ],
      execute: async (ctx) => {
        const activeClient = requireActiveClient(ctx.client, 'tool http delete');
        const appId = resolveIdArg({
          positional: ctx.positional[0],
          flagValue: ctx.options.id,
          label: 'HTTP toolset ID',
          usage: 'fastgpt tool http delete <appId> --yes'
        });

        await confirmDestructiveAction({
          ctx,
          message: `Delete HTTP toolset "${appId}"?`
        });

        return ctx.container.httpToolService.delete({
          client: activeClient,
          appId,
          dryRun: ctx.options.dryRun === true
        });
      }
    }
  ];
}
