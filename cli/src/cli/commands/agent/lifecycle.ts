import {
  parseIdListOption,
  parseParentIdOption,
  resolveJsonObjectPayload
} from '../../../shared/input';
import type { CliCommandSpec } from '../../pipeline';
import {
  confirmDestructiveAction,
  createDryRunOption,
  createIdOption,
  createIdPositionalArg,
  createPaginationOptions,
  createParentIdOption,
  createSearchOption,
  createYesOption,
  parseOptionalNumber,
  requireActiveClient,
  resolveCommonAppMetadata,
  resolveIdArg
} from '../shared/helpers';

/** 注册 FastGPT Agent 核心生命周期命令：list / get / create / update / delete。 */
export function createAgentLifecycleCommandSpecs(): CliCommandSpec[] {
  return [
    {
      path: ['agent', 'list'],
      summary: 'List accessible FastGPT agents and agent folders with pagination and search',
      risk: 'read',
      authModes: ['token', 'personalKey'],
      options: [
        createSearchOption('Search names and descriptions'),
        {
          name: 'type',
          flags: '--type <types>',
          takesValue: true,
          description: 'Comma-separated agent tree types: chatAgent, simple, advanced, folder'
        },
        createParentIdOption(
          'Browse an agent folder or restrict search to its subtree ("null" for root)'
        ),
        ...createPaginationOptions('Items per page (default 20, max 500)')
      ],
      examples: [
        { description: 'List accessible root agents and folders', args: ['agent', 'list'] },
        {
          description: 'Search for chat agents and workflows',
          args: ['agent', 'list', '--type', 'chatAgent,advanced', '--search', 'support']
        }
      ],
      execute: ({ options, client, container }) =>
        container.agentService.list({
          client: requireActiveClient(client, 'agent list'),
          input: {
            searchKey: typeof options.search === 'string' ? options.search : undefined,
            type: parseIdListOption(options.type),
            parentId: parseParentIdOption(options.parentId),
            page: parseOptionalNumber(options.page),
            pageSize: parseOptionalNumber(options.pageSize)
          }
        })
    },

    {
      path: ['agent', 'get'],
      summary: 'Get full details of a FastGPT agent (chatAgent, simple, or advanced)',
      risk: 'read',
      authModes: ['token'],
      positionalArgs: [createIdPositionalArg('agentId', 'Agent')],
      options: [createIdOption('agentId', 'Agent')],
      examples: [
        {
          description: 'Inspect an agent detail',
          args: ['agent', 'get', '68ad85a7463006c963799a05']
        }
      ],
      execute: ({ positional, options, client, container }) => {
        const activeClient = requireActiveClient(client, 'agent get');
        const agentId = resolveIdArg({
          positional: positional[0],
          flagValue: options.id,
          label: 'Agent ID',
          usage: 'fastgpt agent get <agentId>'
        });
        return container.agentService.getDetail({
          client: activeClient,
          agentId
        });
      }
    },

    {
      path: ['agent', 'create'],
      summary: 'Create a new FastGPT agent (chatAgent, simple, or advanced)',
      risk: 'write',
      authModes: ['token', 'personalKey'],
      options: [
        {
          name: 'name',
          flags: '--name <name>',
          takesValue: true,
          description: 'Agent name'
        },
        {
          name: 'type',
          flags: '--type <type>',
          takesValue: true,
          description:
            'Agent type: chatAgent (default), simple, or advanced (auto-inferred when --file includes nodes)'
        },
        {
          name: 'intro',
          flags: '--intro <text>',
          takesValue: true,
          description: 'Agent description'
        },
        {
          name: 'avatar',
          flags: '--avatar <path>',
          takesValue: true,
          description: 'Agent avatar path (e.g. from "fastgpt file upload-avatar")'
        },
        createParentIdOption('Parent agent folder ID ("null" for root)'),
        {
          name: 'file',
          flags: '--file <path>',
          takesValue: true,
          description:
            'Read create JSON payload (including compiled nodes/edges/chatConfig) from file ("-" for stdin)'
        },
        {
          name: 'stdin',
          flags: '--stdin',
          takesValue: false,
          description: 'Read create JSON payload from stdin'
        },
        createDryRunOption('Validate and preview creation without executing')
      ],
      examples: [
        {
          description: 'Create an empty chatAgent',
          args: ['agent', 'create', '--name', 'Support Bot', '--type', 'chatAgent']
        },
        {
          description: 'Create an advanced workflow agent from a compiled StoreWorkflow file',
          args: [
            'agent',
            'create',
            '--name',
            'Order Flow',
            '--type',
            'advanced',
            '--file',
            './store-workflow.json'
          ]
        }
      ],
      execute: async ({ options, client, container }) => {
        const activeClient = requireActiveClient(client, 'agent create');
        const filePayload = await resolveJsonObjectPayload({
          filePath: typeof options.file === 'string' ? options.file : undefined,
          useStdin: options.stdin === true,
          readTextFile: container.fileIo.readTextFile,
          readStdin: container.readStdin,
          fieldLabel: 'agent create payload'
        });
        const metadata = resolveCommonAppMetadata(options, filePayload);

        const mergedInput: Record<string, unknown> = {
          ...(filePayload ?? {}),
          ...(metadata.name !== undefined ? { name: metadata.name } : {}),
          ...(typeof options.type === 'string' ? { type: options.type } : {}),
          ...(metadata.intro !== undefined ? { intro: metadata.intro } : {}),
          ...(metadata.avatar !== undefined ? { avatar: metadata.avatar } : {}),
          ...(metadata.parentId !== undefined ? { parentId: metadata.parentId } : {})
        };

        return container.agentService.create({
          client: activeClient,
          input: mergedInput,
          dryRun: options.dryRun === true
        });
      }
    },

    {
      path: ['agent', 'update'],
      summary: 'Update name, intro, avatar, or parent folder of a FastGPT agent',
      risk: 'write',
      authModes: ['token'],
      positionalArgs: [createIdPositionalArg('agentId', 'Agent')],
      options: [
        createIdOption('agentId', 'Agent'),
        {
          name: 'name',
          flags: '--name <name>',
          takesValue: true,
          description: 'New agent name'
        },
        {
          name: 'intro',
          flags: '--intro <text>',
          takesValue: true,
          description: 'New agent description'
        },
        {
          name: 'avatar',
          flags: '--avatar <path>',
          takesValue: true,
          description: 'New agent avatar path'
        },
        createParentIdOption('Move to target agent folder ID ("null" for root)'),
        createDryRunOption('Validate and preview update without applying')
      ],
      examples: [
        {
          description: 'Rename an agent and update its avatar',
          args: [
            'agent',
            'update',
            '68ad85a7463006c963799a05',
            '--name',
            'Support Bot v2',
            '--avatar',
            '/api/system/img/avatar/demo.png'
          ]
        }
      ],
      execute: ({ positional, options, client, container }) => {
        const activeClient = requireActiveClient(client, 'agent update');
        const agentId = resolveIdArg({
          positional: positional[0],
          flagValue: options.id,
          label: 'Agent ID',
          usage: 'fastgpt agent update <agentId> --name "<newName>"'
        });

        return container.agentService.update({
          client: activeClient,
          agentId,
          input: resolveCommonAppMetadata(options),
          dryRun: options.dryRun === true
        });
      }
    },

    {
      path: ['agent', 'delete'],
      summary: 'Delete a FastGPT agent',
      risk: 'destructive',
      authModes: ['token'],
      positionalArgs: [createIdPositionalArg('agentId', 'Agent')],
      options: [
        createIdOption('agentId', 'Agent'),
        createYesOption(),
        createDryRunOption('Preview deletion without executing')
      ],
      examples: [
        {
          description: 'Delete an agent non-interactively',
          args: ['agent', 'delete', '68ad85a7463006c963799a05', '--yes']
        }
      ],
      execute: async (ctx) => {
        const activeClient = requireActiveClient(ctx.client, 'agent delete');
        const agentId = resolveIdArg({
          positional: ctx.positional[0],
          flagValue: ctx.options.id,
          label: 'Agent ID',
          usage: 'fastgpt agent delete <agentId> --yes'
        });

        await confirmDestructiveAction({
          ctx,
          message: `Delete agent "${agentId}"?`
        });

        return ctx.container.agentService.delete({
          client: activeClient,
          agentId,
          dryRun: ctx.options.dryRun === true
        });
      }
    }
  ];
}
