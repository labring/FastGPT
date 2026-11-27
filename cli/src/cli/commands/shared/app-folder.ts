import type { AppFolderService } from '../../../domain/shared/app-folder-service';
import { CliArgumentError } from '../../../shared/errors';
import {
  parseOptionalNumber,
  parseParentIdOption,
  resolveJsonObjectPayload
} from '../../../shared/input';
import type { CliContainer } from '../../container';
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
  resolveIdArg
} from './helpers';

/**
 * 统一的 App 目录命令规范工厂：由 `agent folder` 与 `tool folder` 共用同一组参数解析、确认与执行契约。
 */
export function createAppFolderCommandSpecs({
  domain,
  folderTypeTag,
  label,
  capitalizedLabel,
  exampleName,
  exampleSearch,
  childNoun,
  getService
}: {
  domain: 'agent' | 'tool';
  folderTypeTag: 'folder' | 'toolFolder';
  label: string;
  capitalizedLabel: string;
  exampleName: string;
  exampleSearch: string;
  childNoun: string;
  getService: (container: CliContainer) => AppFolderService;
}): CliCommandSpec[] {
  const prefix = `${domain} folder`;

  return [
    {
      path: [domain, 'folder', 'list'],
      summary: `List FastGPT ${label}s`,
      risk: 'read',
      authModes: ['token', 'personalKey'],
      options: [
        createSearchOption(`Search ${label}s by name or intro`),
        createParentIdOption(`Filter by parent ${label} ID ("null" for root)`),
        ...createPaginationOptions()
      ],
      examples: [
        { description: `List root ${label}s`, args: [domain, 'folder', 'list'] },
        {
          description: `Search ${label}s by keyword`,
          args: [domain, 'folder', 'list', '--search', exampleSearch]
        }
      ],
      execute: ({ options, client, container }) =>
        getService(container).list({
          client: requireActiveClient(client, `${prefix} list`),
          input: {
            searchKey: typeof options.search === 'string' ? options.search : undefined,
            parentId: parseParentIdOption(options.parentId),
            page: parseOptionalNumber(options.page),
            pageSize: parseOptionalNumber(options.pageSize)
          }
        })
    },

    {
      path: [domain, 'folder', 'create'],
      summary: `Create a new FastGPT ${label} (${folderTypeTag})`,
      risk: 'write',
      authModes: ['token', 'personalKey'],
      options: [
        {
          name: 'name',
          flags: '--name <name>',
          takesValue: true,
          description: `${capitalizedLabel} name`
        },
        {
          name: 'intro',
          flags: '--intro <text>',
          takesValue: true,
          description: `${capitalizedLabel} description`
        },
        {
          name: 'avatar',
          flags: '--avatar <path>',
          takesValue: true,
          description: 'Optional custom folder avatar path'
        },
        createParentIdOption(`Parent ${label} ID ("null" for root)`),
        ...createJsonInputOptions('create'),
        createDryRunOption('Validate and preview creation without executing')
      ],
      examples: [
        {
          description: `Create a ${label}`,
          args: [domain, 'folder', 'create', '--name', exampleName]
        }
      ],
      execute: async ({ options, client, container }) => {
        const activeClient = requireActiveClient(client, `${prefix} create`);
        const filePayload = await resolveJsonObjectPayload({
          filePath: typeof options.file === 'string' ? options.file : undefined,
          useStdin: options.stdin === true,
          readTextFile: container.fileIo.readTextFile,
          readStdin: container.readStdin,
          fieldLabel: `${prefix} create payload`
        });
        const metadata = resolveCommonAppMetadata(options, filePayload);

        return getService(container).create({
          client: activeClient,
          input: {
            name: metadata.name ?? '',
            intro: metadata.intro,
            avatar: metadata.avatar,
            parentId: metadata.parentId,
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
      path: [domain, 'folder', 'update'],
      summary: `Update a FastGPT ${label} (name, intro, avatar, or parent folder)`,
      risk: 'write',
      authModes: ['token', 'personalKey'],
      positionalArgs: [createIdPositionalArg('folderId', capitalizedLabel)],
      options: [
        createIdOption('folderId', capitalizedLabel),
        {
          name: 'name',
          flags: '--name <name>',
          takesValue: true,
          description: `New ${label} name`
        },
        {
          name: 'intro',
          flags: '--intro <text>',
          takesValue: true,
          description: `New ${label} description`
        },
        {
          name: 'avatar',
          flags: '--avatar <path>',
          takesValue: true,
          description: `New ${label} avatar path`
        },
        createParentIdOption(`Move to parent ${label} ID ("null" for root)`),
        createDryRunOption('Validate and preview update without executing')
      ],
      examples: [
        {
          description: `Rename a ${label}`,
          args: [domain, 'folder', 'update', '68ad85a7463006c963799a05', '--name', 'Renamed']
        }
      ],
      execute: ({ positional, options, client, container }) => {
        const activeClient = requireActiveClient(client, `${prefix} update`);
        const folderId = resolveIdArg({
          positional: positional[0],
          flagValue: options.id,
          label: `${capitalizedLabel} ID`,
          usage: `fastgpt ${prefix} update <folderId> --name <newName>`
        });
        const metadata = resolveCommonAppMetadata(options);

        if (
          metadata.name === undefined &&
          metadata.intro === undefined &&
          metadata.avatar === undefined &&
          metadata.parentId === undefined
        ) {
          throw new CliArgumentError(
            'At least one field to update is required.',
            undefined,
            'Provide --name, --intro, --avatar, or --parent-id.'
          );
        }

        return getService(container).update({
          client: activeClient,
          folderId,
          input: metadata,
          dryRun: options.dryRun === true
        });
      }
    },

    {
      path: [domain, 'folder', 'delete'],
      summary: `Recursively delete a FastGPT ${label} and all nested ${childNoun}`,
      risk: 'destructive',
      authModes: ['token', 'personalKey'],
      positionalArgs: [createIdPositionalArg('folderId', capitalizedLabel)],
      options: [
        createIdOption('folderId', capitalizedLabel),
        createYesOption(),
        createDryRunOption('Preview deletion without executing')
      ],
      examples: [
        {
          description: `Delete a ${label} non-interactively`,
          args: [domain, 'folder', 'delete', '68ad85a7463006c963799a05', '--yes']
        }
      ],
      execute: async (ctx) => {
        const activeClient = requireActiveClient(ctx.client, `${prefix} delete`);
        const folderId = resolveIdArg({
          positional: ctx.positional[0],
          flagValue: ctx.options.id,
          label: `${capitalizedLabel} ID`,
          usage: `fastgpt ${prefix} delete <folderId> --yes`
        });

        await confirmDestructiveAction({
          ctx,
          message: `Delete ${label} "${folderId}" and recursively delete all nested ${childNoun} and subfolders?`
        });

        return getService(ctx.container).delete({
          client: activeClient,
          folderId,
          dryRun: ctx.options.dryRun === true
        });
      }
    }
  ];
}
