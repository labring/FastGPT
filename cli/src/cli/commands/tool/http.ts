import { CliArgumentError } from '../../../shared/errors';
import {
  isPlainObject,
  parseInlineJsonValue,
  parseOptionalNumber,
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
  requireActiveClient,
  resolveCommonAppMetadata,
  resolveIdArg,
  resolveStringOption
} from '../shared/helpers';

/** 注册 FastGPT HTTP 工具集命令：list / get / children / parse / create / update / run / delete。 */
export function createToolHttpCommandSpecs(): CliCommandSpec[] {
  return [
    {
      path: ['tool', 'http', 'list'],
      summary: 'List FastGPT HTTP toolsets accessible to the current team',
      risk: 'read',
      authModes: ['token', 'personalKey'],
      options: [
        createSearchOption('Search HTTP toolsets by name or intro'),
        createParentIdOption('Filter by parent tool folder ID ("null" for root)'),
        ...createPaginationOptions()
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
      positionalArgs: [createIdPositionalArg('appId', 'HTTP toolset')],
      options: [createIdOption('appId', 'HTTP toolset')],
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
      positionalArgs: [createIdPositionalArg('appId', 'HTTP toolset')],
      options: [
        createIdOption('appId', 'HTTP toolset'),
        createSearchOption('Filter child tools by name or description'),
        ...createPaginationOptions()
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
        createParentIdOption('Target parent tool folder ID ("null" for root)'),
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
        ...createJsonInputOptions('create'),
        createDryRunOption('Validate and preview creation without executing')
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
        const metadata = resolveCommonAppMetadata(options, filePayload);

        const headerSecret =
          options.headerSecret !== undefined
            ? parseInlineJsonValue(options.headerSecret, '--header-secret')
            : filePayload?.headerSecret;
        const toolList =
          options.toolList !== undefined
            ? parseInlineJsonValue(options.toolList, '--tool-list')
            : filePayload?.toolList;
        const targetBaseUrl = resolveStringOption(options, filePayload, 'targetUrl', 'baseUrl');
        const apiSchemaStr = resolveStringOption(options, filePayload, 'apiSchema', 'apiSchemaStr');
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
            name: (metadata.name ?? '').trim(),
            createType:
              typeof filePayload?.createType === 'string'
                ? filePayload.createType.trim()
                : undefined,
            intro: metadata.intro,
            avatar: metadata.avatar,
            parentId: metadata.parentId,
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
      positionalArgs: [createIdPositionalArg('appId', 'HTTP toolset')],
      options: [
        createIdOption('appId', 'HTTP toolset'),
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
        ...createJsonInputOptions('update'),
        createDryRunOption('Validate and preview update without applying')
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

        return container.httpToolService.update({
          client: activeClient,
          appId,
          metadata: resolveCommonAppMetadata(options, filePayload),
          config: {
            baseUrl: resolveStringOption(options, filePayload, 'targetUrl', 'baseUrl'),
            apiSchemaStr: resolveStringOption(options, filePayload, 'apiSchema', 'apiSchemaStr'),
            toolList:
              options.toolList !== undefined
                ? parseInlineJsonValue(options.toolList, '--tool-list')
                : filePayload?.toolList,
            headerSecret:
              options.headerSecret !== undefined
                ? parseInlineJsonValue(options.headerSecret, '--header-secret')
                : filePayload?.headerSecret,
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
        ...createJsonInputOptions('run'),
        createDryRunOption('Validate and preview HTTP tool call without executing')
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

        return container.httpToolService.run({
          client: activeClient,
          input: {
            appId: resolveStringOption(options, filePayload, 'id', 'appId'),
            baseUrl: resolveStringOption(options, filePayload, 'targetUrl', 'baseUrl'),
            toolPath: resolveStringOption(options, filePayload, 'toolPath') ?? '',
            method: resolveStringOption(options, filePayload, 'method'),
            params: rawParams,
            apiSchemaStr: resolveStringOption(options, filePayload, 'apiSchema', 'apiSchemaStr'),
            customHeaders: rawCustomHeaders as
              | Record<string, string | number | boolean>
              | undefined,
            headerSecret:
              options.headerSecret !== undefined
                ? parseInlineJsonValue(options.headerSecret, '--header-secret')
                : filePayload?.headerSecret,
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
      positionalArgs: [createIdPositionalArg('appId', 'HTTP toolset')],
      options: [
        createIdOption('appId', 'HTTP toolset'),
        createYesOption(),
        createDryRunOption('Preview deletion without executing')
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
