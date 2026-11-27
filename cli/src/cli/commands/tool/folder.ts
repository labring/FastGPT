import { CliArgumentError } from '../../../shared/errors';
import { parseParentIdOption, resolveJsonObjectPayload } from '../../../shared/input';
import type { CliCommandSpec } from '../../pipeline';
import {
  confirmDestructiveAction,
  parseOptionalNumber,
  requireActiveClient,
  resolveIdArg
} from '../dataset/shared';

/** 注册 FastGPT 工具目录（`toolFolder`）管理命令：list / create / update / delete。 */
export function createToolFolderCommandSpecs(): CliCommandSpec[] {
  return [
    {
      path: ['tool', 'folder', 'list'],
      summary: 'List FastGPT tool folders',
      risk: 'read',
      authModes: ['token', 'personalKey'],
      options: [
        {
          name: 'search',
          flags: '--search <keyword>',
          takesValue: true,
          description: 'Search tool folders by name or intro'
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
        { description: 'List root tool folders', args: ['tool', 'folder', 'list'] },
        {
          description: 'Search tool folders by keyword',
          args: ['tool', 'folder', 'list', '--search', 'Coze']
        }
      ],
      execute: ({ options, client, container }) =>
        container.toolFolderService.list({
          client: requireActiveClient(client, 'tool folder list'),
          input: {
            searchKey: typeof options.search === 'string' ? options.search : undefined,
            parentId: parseParentIdOption(options.parentId),
            page: parseOptionalNumber(options.page),
            pageSize: parseOptionalNumber(options.pageSize)
          }
        })
    },

    {
      path: ['tool', 'folder', 'create'],
      summary: 'Create a new FastGPT tool folder (toolFolder)',
      risk: 'write',
      authModes: ['token', 'personalKey'],
      options: [
        {
          name: 'name',
          flags: '--name <name>',
          takesValue: true,
          description: 'Tool folder name'
        },
        {
          name: 'intro',
          flags: '--intro <text>',
          takesValue: true,
          description: 'Tool folder description'
        },
        {
          name: 'avatar',
          flags: '--avatar <path>',
          takesValue: true,
          description: 'Optional custom folder avatar path'
        },
        {
          name: 'parentId',
          flags: '--parent-id <id>',
          takesValue: true,
          description: 'Parent tool folder ID ("null" for root)'
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
          description: 'Create a tool folder',
          args: ['tool', 'folder', 'create', '--name', 'External Tools']
        }
      ],
      execute: async ({ options, client, container }) => {
        const activeClient = requireActiveClient(client, 'tool folder create');
        const filePayload = await resolveJsonObjectPayload({
          filePath: typeof options.file === 'string' ? options.file : undefined,
          useStdin: options.stdin === true,
          readTextFile: container.fileIo.readTextFile,
          readStdin: container.readStdin,
          fieldLabel: 'tool folder create payload'
        });

        const name =
          (typeof options.name === 'string' ? options.name.trim() : '') ||
          (typeof filePayload?.name === 'string' ? filePayload.name.trim() : '');
        if (!name) {
          throw new CliArgumentError(
            'Tool folder name is required.',
            undefined,
            'Pass --name "<folderName>" or provide "name" in --file / --stdin JSON.'
          );
        }

        return container.toolFolderService.create({
          client: activeClient,
          input: {
            name,
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
          dryRun: options.dryRun === true
        });
      }
    },

    {
      path: ['tool', 'folder', 'update'],
      summary: 'Rename, update intro/avatar, or move a FastGPT tool folder',
      risk: 'write',
      authModes: ['token'],
      positionalArgs: [
        { name: 'folderId', required: false, description: 'Tool folder ObjectId (or use --id)' }
      ],
      options: [
        {
          name: 'id',
          flags: '--id <folderId>',
          takesValue: true,
          description: 'Tool folder ObjectId (alternative to positional argument)'
        },
        {
          name: 'name',
          flags: '--name <name>',
          takesValue: true,
          description: 'New folder name'
        },
        {
          name: 'intro',
          flags: '--intro <text>',
          takesValue: true,
          description: 'New folder description'
        },
        {
          name: 'avatar',
          flags: '--avatar <path>',
          takesValue: true,
          description: 'New folder avatar path'
        },
        {
          name: 'parentId',
          flags: '--parent-id <id>',
          takesValue: true,
          description: 'Move to target tool folder ID ("null" for root)'
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
          description: 'Rename a tool folder',
          args: ['tool', 'folder', 'update', '68ad85a7463006c963799a05', '--name', 'MCP & HTTP']
        }
      ],
      execute: ({ positional, options, client, container }) => {
        const activeClient = requireActiveClient(client, 'tool folder update');
        const folderId = resolveIdArg({
          positional: positional[0],
          flagValue: options.id,
          label: 'Tool folder ID',
          usage: 'fastgpt tool folder update <folderId> --name "<newName>"'
        });

        return container.toolFolderService.update({
          client: activeClient,
          folderId,
          input: {
            name: typeof options.name === 'string' ? options.name : undefined,
            intro: typeof options.intro === 'string' ? options.intro : undefined,
            avatar: typeof options.avatar === 'string' ? options.avatar : undefined,
            parentId:
              options.parentId !== undefined ? parseParentIdOption(options.parentId) : undefined
          },
          dryRun: options.dryRun === true
        });
      }
    },

    {
      path: ['tool', 'folder', 'delete'],
      summary: 'Delete a FastGPT tool folder and all tools inside it',
      risk: 'destructive',
      authModes: ['token'],
      positionalArgs: [
        { name: 'folderId', required: false, description: 'Tool folder ObjectId (or use --id)' }
      ],
      options: [
        {
          name: 'id',
          flags: '--id <folderId>',
          takesValue: true,
          description: 'Tool folder ObjectId (alternative to positional argument)'
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
          description: 'Delete a tool folder non-interactively',
          args: ['tool', 'folder', 'delete', '68ad85a7463006c963799a05', '--yes']
        }
      ],
      execute: async (ctx) => {
        const activeClient = requireActiveClient(ctx.client, 'tool folder delete');
        const folderId = resolveIdArg({
          positional: ctx.positional[0],
          flagValue: ctx.options.id,
          label: 'Tool folder ID',
          usage: 'fastgpt tool folder delete <folderId> --yes'
        });

        await confirmDestructiveAction({
          ctx,
          message: `Delete tool folder "${folderId}" and all tools inside it?`
        });

        return ctx.container.toolFolderService.delete({
          client: activeClient,
          folderId,
          dryRun: ctx.options.dryRun === true
        });
      }
    }
  ];
}
