import { DEFAULT_PROFILE_NAME, type ConfigRepository } from '../../infra/config/config-repository';
import { assertValidProfileName } from '../../shared/crypto';
import { createSuccessResult } from '../../shared/result';
import type { CommandOptionMeta, GlobalCliOptions } from '../../shared/types';
import { DEFAULT_FASTGPT_BASE_URL, normalizeBaseUrl } from '../../shared/url';
import type { CliCommandSpec, CommandExecutionContext } from '../pipeline';
import { requireActiveClient } from './dataset/shared';

const COMMON_API_CALL_OPTIONS: readonly CommandOptionMeta[] = [
  {
    name: 'query',
    flags: '--query <k=v>',
    takesValue: true,
    repeatable: true,
    description: 'Query parameter in key=value format (repeatable)'
  },
  {
    name: 'queryJson',
    flags: '--query-json <json>',
    takesValue: true,
    description: 'JSON object of URL query parameters'
  },
  {
    name: 'header',
    flags: '--header <k:v>',
    takesValue: true,
    repeatable: true,
    description: 'Custom HTTP header in "Name: Value" format (repeatable; auth headers blocked)'
  },
  {
    name: 'source',
    flags: '--source <source>',
    takesValue: true,
    description: 'OpenAPI schema source for request validation: system (default) or dev'
  },
  {
    name: 'validate',
    flags: '--no-validate',
    takesValue: false,
    description: 'Skip local OpenAPI schema validation before sending the request'
  },
  {
    name: 'refresh',
    flags: '--refresh',
    takesValue: false,
    description: 'Force refresh cached OpenAPI schema before validation'
  },
  {
    name: 'output',
    flags: '--output <path>',
    takesValue: true,
    description: 'Write raw response body to a local file atomically'
  },
  {
    name: 'overwrite',
    flags: '--overwrite',
    takesValue: false,
    description: 'Allow overwriting an existing --output file'
  },
  {
    name: 'dryRun',
    flags: '--dry-run',
    takesValue: false,
    description: 'Validate locally and preview normalized request without sending it'
  }
];

const MUTATION_API_CALL_OPTIONS: readonly CommandOptionMeta[] = [
  {
    name: 'body',
    flags: '--body <json>',
    takesValue: true,
    description: 'Inline JSON request body'
  },
  {
    name: 'file',
    flags: '--file <path>',
    takesValue: true,
    description: 'Read JSON request body from file ("-" for stdin)'
  },
  {
    name: 'stdin',
    flags: '--stdin',
    takesValue: false,
    description: 'Read JSON request body from stdin'
  },
  {
    name: 'yes',
    flags: '--yes',
    takesValue: false,
    description:
      'Confirm destructive API requests without prompting (required in non-TTY/JSON mode)'
  }
];

async function resolveOfflineBaseUrl({
  global,
  env,
  configRepo
}: {
  global: GlobalCliOptions;
  env: NodeJS.ProcessEnv;
  configRepo: ConfigRepository;
}): Promise<string> {
  const loaded = await configRepo.read();
  const profileName = assertValidProfileName(
    global.profile ?? env.FASTGPT_PROFILE ?? loaded.config.currentProfile ?? DEFAULT_PROFILE_NAME
  );
  const profile = loaded.config.profiles[profileName];
  const allowInsecureHttp = global.allowInsecureHttp || profile?.allowInsecureHttp === true;
  const rawBaseUrl =
    global.baseUrl ?? env.FASTGPT_BASE_URL ?? profile?.baseUrl ?? DEFAULT_FASTGPT_BASE_URL;
  return normalizeBaseUrl(rawBaseUrl, { allowInsecureHttp });
}

function toStringArrayOption(raw: unknown): string[] | undefined {
  if (!Array.isArray(raw)) {
    return undefined;
  }
  const values = raw.filter((item): item is string => typeof item === 'string');
  return values.length > 0 ? values : undefined;
}

function executeCallerCommand({
  ctx,
  commandName,
  method,
  path
}: {
  ctx: CommandExecutionContext;
  commandName: string;
  method: string;
  path: string;
}) {
  const activeClient = requireActiveClient(ctx.client, commandName);
  const { options, global, resolvedAuth, container } = ctx;

  return container.apiCallerService.execute({
    client: activeClient,
    baseUrl: resolvedAuth?.baseUrl ?? activeClient.baseUrl,
    input: {
      method,
      path,
      queryPairs: toStringArrayOption(options.query),
      queryJson: typeof options.queryJson === 'string' ? options.queryJson : undefined,
      body: typeof options.body === 'string' ? options.body : undefined,
      file: typeof options.file === 'string' ? options.file : undefined,
      stdin: options.stdin === true,
      headerPairs: toStringArrayOption(options.header),
      source: typeof options.source === 'string' ? options.source : undefined,
      validate: options.validate !== false,
      refresh: options.refresh === true,
      raw: global.raw,
      output: typeof options.output === 'string' ? options.output : undefined,
      overwrite: options.overwrite === true,
      dryRun: options.dryRun === true,
      yes: options.yes === true,
      format: global.format
    }
  });
}

/**
 * 注册通用 OpenAPI 自省与安全 REST 调用命令族（`api schema|get|post|put|delete|call`）。
 */
export function createApiCommandSpecs(): CliCommandSpec[] {
  const schemaSpec: CliCommandSpec = {
    path: ['api', 'schema'],
    summary: 'Inspect FastGPT OpenAPI endpoints, parameters, and request/response schemas',
    risk: 'read',
    authModes: ['token', 'personalKey', 'appKey'],
    skipAuth: (opts) => opts.offline === true,
    positionalArgs: [
      {
        name: 'path',
        required: false,
        description: 'Target API path to inspect in detail (omit to list matching endpoints)'
      }
    ],
    options: [
      {
        name: 'source',
        flags: '--source <source>',
        takesValue: true,
        description: 'OpenAPI source: system (default) or dev'
      },
      {
        name: 'tag',
        flags: '--tag <tag>',
        takesValue: true,
        description: 'Filter endpoints by OpenAPI tag'
      },
      {
        name: 'search',
        flags: '--search <keyword>',
        takesValue: true,
        description: 'Search endpoints by keyword across path, summary, description, and tags'
      },
      {
        name: 'method',
        flags: '--method <method>',
        takesValue: true,
        description: 'Filter endpoints or operations by HTTP method (GET, POST, PUT, DELETE)'
      },
      {
        name: 'refresh',
        flags: '--refresh',
        takesValue: false,
        description: 'Bypass cache and fetch the latest OpenAPI schema from the server'
      },
      {
        name: 'offline',
        flags: '--offline',
        takesValue: false,
        description: 'Read only from local cached OpenAPI schema without network access'
      }
    ],
    examples: [
      {
        description: 'Search System OpenAPI endpoints matching "dataset"',
        args: ['api', 'schema', '--search', 'dataset']
      },
      {
        description: 'Inspect request/response schema for /core/dataset/detail',
        args: ['api', 'schema', '/core/dataset/detail', '--source', 'system']
      },
      {
        description: 'Inspect cached Dev OpenAPI schema offline',
        args: ['api', 'schema', '--source', 'dev', '--offline']
      }
    ],
    execute: async ({ positional, options, client, resolvedAuth, global, container }) => {
      const offline = options.offline === true;
      const baseUrl = await (async () => {
        if (!offline) {
          const activeClient = requireActiveClient(client, 'api schema');
          return resolvedAuth?.baseUrl ?? activeClient.baseUrl;
        }
        return resolveOfflineBaseUrl({
          global,
          env: container.env,
          configRepo: container.configRepo
        });
      })();

      const inspected = await container.openapiCacheService.inspectSchema({
        client,
        baseUrl,
        source: typeof options.source === 'string' ? options.source : undefined,
        path: positional[0],
        tag: typeof options.tag === 'string' ? options.tag : undefined,
        search: typeof options.search === 'string' ? options.search : undefined,
        method: typeof options.method === 'string' ? options.method : undefined,
        refresh: options.refresh === true,
        offline
      });

      return createSuccessResult({
        data: inspected,
        meta: {
          source: inspected.source,
          fromCache: inspected.fromCache,
          ...(inspected.mode === 'list' ? { total: inspected.total } : {})
        },
        ...(inspected.warnings.length > 0 ? { warnings: inspected.warnings } : {})
      });
    }
  };

  const getSpec: CliCommandSpec = {
    path: ['api', 'get'],
    summary: 'Send a validated GET request to any FastGPT API path',
    risk: 'read',
    authModes: ['token', 'personalKey', 'appKey'],
    positionalArgs: [
      {
        name: 'path',
        required: true,
        description: 'FastGPT API path (e.g. /core/dataset/detail)'
      }
    ],
    options: [...COMMON_API_CALL_OPTIONS],
    examples: [
      {
        description: 'Call a GET endpoint with query parameter',
        args: ['api', 'get', '/core/dataset/detail', '--query', 'id=68ad85a7463006c963799a05']
      },
      {
        description: 'Download raw response to a local file',
        args: [
          'api',
          'get',
          '/core/dataset/exportAll',
          '--source',
          'dev',
          '--query',
          'datasetId=68ad85a7463006c963799a05',
          '--raw',
          '--output',
          './export.csv'
        ]
      }
    ],
    execute: (ctx) =>
      executeCallerCommand({
        ctx,
        commandName: 'api get',
        method: 'GET',
        path: ctx.positional[0] ?? ''
      })
  };

  const postSpec: CliCommandSpec = {
    path: ['api', 'post'],
    summary: 'Send a validated POST request to any FastGPT API path',
    risk: 'write',
    authModes: ['token', 'personalKey', 'appKey'],
    positionalArgs: [
      {
        name: 'path',
        required: true,
        description: 'FastGPT API path (e.g. /core/dataset/listV2)'
      }
    ],
    options: [...COMMON_API_CALL_OPTIONS, ...MUTATION_API_CALL_OPTIONS],
    examples: [
      {
        description: 'Preview a POST request without sending it',
        args: [
          'api',
          'post',
          '/core/dataset/create',
          '--body',
          '{"name":"My Dataset","type":"dataset","intro":"Knowledge base"}',
          '--dry-run'
        ]
      },
      {
        description: 'Invoke a destructive POST endpoint non-interactively',
        args: [
          'api',
          'post',
          '/core/chat/history/batchDelete',
          '--body',
          '{"appId":"68ad85a7463006c963799a05","chatIds":["chat_123456"]}',
          '--yes'
        ]
      }
    ],
    execute: (ctx) =>
      executeCallerCommand({
        ctx,
        commandName: 'api post',
        method: 'POST',
        path: ctx.positional[0] ?? ''
      })
  };

  const putSpec: CliCommandSpec = {
    path: ['api', 'put'],
    summary: 'Send a validated PUT request to any FastGPT API path',
    risk: 'write',
    authModes: ['token', 'personalKey', 'appKey'],
    positionalArgs: [
      {
        name: 'path',
        required: true,
        description: 'FastGPT API path (e.g. /core/dataset/update)'
      }
    ],
    options: [...COMMON_API_CALL_OPTIONS, ...MUTATION_API_CALL_OPTIONS],
    examples: [
      {
        description: 'Update a resource with inline JSON body',
        args: [
          'api',
          'put',
          '/core/dataset/update',
          '--body',
          '{"id":"68ad85a7463006c963799a05","name":"Updated"}'
        ]
      }
    ],
    execute: (ctx) =>
      executeCallerCommand({
        ctx,
        commandName: 'api put',
        method: 'PUT',
        path: ctx.positional[0] ?? ''
      })
  };

  const deleteSpec: CliCommandSpec = {
    path: ['api', 'delete'],
    summary: 'Send a validated DELETE request to any FastGPT API path',
    risk: 'destructive',
    authModes: ['token', 'personalKey', 'appKey'],
    positionalArgs: [
      {
        name: 'path',
        required: true,
        description: 'FastGPT API path (e.g. /core/dataset/delete)'
      }
    ],
    options: [...COMMON_API_CALL_OPTIONS, ...MUTATION_API_CALL_OPTIONS],
    examples: [
      {
        description: 'Preview a DELETE request without executing it',
        args: [
          'api',
          'delete',
          '/core/dataset/delete',
          '--query',
          'id=68ad85a7463006c963799a05',
          '--dry-run'
        ]
      },
      {
        description: 'Execute a DELETE request non-interactively',
        args: [
          'api',
          'delete',
          '/core/dataset/delete',
          '--query',
          'id=68ad85a7463006c963799a05',
          '--yes'
        ]
      }
    ],
    execute: (ctx) =>
      executeCallerCommand({
        ctx,
        commandName: 'api delete',
        method: 'DELETE',
        path: ctx.positional[0] ?? ''
      })
  };

  const callSpec: CliCommandSpec = {
    path: ['api', 'call'],
    summary: 'Invoke any FastGPT REST endpoint by explicit HTTP method and path',
    risk: 'write',
    authModes: ['token', 'personalKey', 'appKey'],
    positionalArgs: [
      {
        name: 'method',
        required: true,
        description: 'HTTP method (GET, POST, PUT, DELETE)'
      },
      {
        name: 'path',
        required: true,
        description: 'FastGPT API path (e.g. /core/dataset/detail)'
      }
    ],
    options: [...COMMON_API_CALL_OPTIONS, ...MUTATION_API_CALL_OPTIONS],
    examples: [
      {
        description: 'Invoke an arbitrary endpoint explicitly',
        args: [
          'api',
          'call',
          'POST',
          '/core/dataset/listV2',
          '--body',
          '{"parentId":null}',
          '--source',
          'system'
        ]
      }
    ],
    execute: (ctx) =>
      executeCallerCommand({
        ctx,
        commandName: 'api call',
        method: ctx.positional[0] ?? '',
        path: ctx.positional[1] ?? ''
      })
  };

  return [schemaSpec, getSpec, postSpec, putSpec, deleteSpec, callSpec];
}
