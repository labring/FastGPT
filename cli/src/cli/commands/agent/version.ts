import { CliArgumentError } from '../../../shared/errors';
import type { CliCommandSpec } from '../../pipeline';
import { parseOptionalNumber, requireActiveClient, resolveIdArg } from '../shared/helpers';

/** 注册 FastGPT Agent 版本历史命令：list / get / update。 */
export function createAgentVersionCommandSpecs(): CliCommandSpec[] {
  return [
    {
      path: ['agent', 'version', 'list'],
      summary: 'List historical versions of a FastGPT agent',
      risk: 'read',
      authModes: ['token'],
      positionalArgs: [
        { name: 'agentId', required: false, description: 'Agent ObjectId (or use --id)' }
      ],
      options: [
        {
          name: 'id',
          flags: '--id <agentId>',
          takesValue: true,
          description: 'Agent ObjectId (alternative to positional argument)'
        },
        {
          name: 'published',
          flags: '--published',
          takesValue: false,
          description: 'Show only published versions'
        },
        {
          name: 'draft',
          flags: '--draft',
          takesValue: false,
          description: 'Show only unpublished draft versions'
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
          description: 'List versions of an agent',
          args: ['agent', 'version', 'list', '68ad85a7463006c963799a05']
        },
        {
          description: 'List only published versions',
          args: ['agent', 'version', 'list', '68ad85a7463006c963799a05', '--published']
        }
      ],
      execute: ({ positional, options, client, container }) => {
        const activeClient = requireActiveClient(client, 'agent version list');
        const appId = resolveIdArg({
          positional: positional[0],
          flagValue: options.id,
          label: 'Agent ID',
          usage: 'fastgpt agent version list <agentId>'
        });

        if (options.published === true && options.draft === true) {
          throw new CliArgumentError('--published and --draft are mutually exclusive.');
        }

        const isPublish =
          options.published === true ? true : options.draft === true ? false : undefined;

        return container.agentVersionService.list({
          client: activeClient,
          input: {
            appId,
            isPublish,
            page: parseOptionalNumber(options.page),
            pageSize: parseOptionalNumber(options.pageSize)
          }
        });
      }
    },

    {
      path: ['agent', 'version', 'get'],
      summary: 'Get a specific version detail or the latest published version of a FastGPT agent',
      risk: 'read',
      authModes: ['token'],
      positionalArgs: [
        { name: 'agentId', required: false, description: 'Agent ObjectId (or use --id)' },
        {
          name: 'versionId',
          required: false,
          description: 'Optional version ObjectId (omit to fetch latest version)'
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
          name: 'versionId',
          flags: '--version-id <versionId>',
          takesValue: true,
          description: 'Specific version ObjectId (omit to fetch latest version)'
        }
      ],
      examples: [
        {
          description: 'Get the latest version of an agent',
          args: ['agent', 'version', 'get', '68ad85a7463006c963799a05']
        },
        {
          description: 'Get a specific historical version',
          args: ['agent', 'version', 'get', '68ad85a7463006c963799a05', '68ad85a7463006c963799a09']
        }
      ],
      execute: ({ positional, options, client, container }) => {
        const activeClient = requireActiveClient(client, 'agent version get');
        const appId = resolveIdArg({
          positional: positional[0],
          flagValue: options.id,
          label: 'Agent ID',
          usage: 'fastgpt agent version get <agentId> [versionId]'
        });
        const versionId =
          positional[1] ?? (typeof options.versionId === 'string' ? options.versionId : undefined);

        return container.agentVersionService.getDetail({
          client: activeClient,
          appId,
          versionId
        });
      }
    },

    {
      path: ['agent', 'version', 'update'],
      summary: 'Rename a historical version of a FastGPT agent',
      risk: 'write',
      authModes: ['token'],
      positionalArgs: [
        { name: 'agentId', required: false, description: 'Agent ObjectId (or use --id)' },
        {
          name: 'versionId',
          required: false,
          description: 'Version ObjectId (or use --version-id)'
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
          name: 'versionId',
          flags: '--version-id <versionId>',
          takesValue: true,
          description: 'Version ObjectId (alternative to positional argument)'
        },
        {
          name: 'name',
          flags: '--name <versionName>',
          takesValue: true,
          description: 'New version label'
        },
        {
          name: 'dryRun',
          flags: '--dry-run',
          takesValue: false,
          description: 'Validate and preview version rename without applying'
        }
      ],
      examples: [
        {
          description: 'Rename an agent version',
          args: [
            'agent',
            'version',
            'update',
            '68ad85a7463006c963799a05',
            '68ad85a7463006c963799a09',
            '--name',
            'v1.2.0-stable'
          ]
        }
      ],
      execute: ({ positional, options, client, container }) => {
        const activeClient = requireActiveClient(client, 'agent version update');
        const appId = resolveIdArg({
          positional: positional[0],
          flagValue: options.id,
          label: 'Agent ID',
          usage: 'fastgpt agent version update <agentId> <versionId> --name "<versionName>"'
        });
        const versionId = resolveIdArg({
          positional: positional[1],
          flagValue: options.versionId,
          label: 'Version ID',
          usage: 'fastgpt agent version update <agentId> <versionId> --name "<versionName>"'
        });
        const versionName = typeof options.name === 'string' ? options.name.trim() : '';
        if (!versionName) {
          throw new CliArgumentError(
            'Version name is required.',
            undefined,
            'Pass --name "<versionName>".'
          );
        }

        return container.agentVersionService.update({
          client: activeClient,
          input: {
            appId,
            versionId,
            versionName
          },
          dryRun: options.dryRun === true
        });
      }
    }
  ];
}
