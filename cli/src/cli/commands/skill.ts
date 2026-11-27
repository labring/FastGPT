import { AgentSkillCategoryEnum } from '@fastgpt/global/core/ai/skill/constants';
import { CliArgumentError } from '../../shared/errors';
import {
  parseIdListOption,
  parseParentIdOption,
  resolveJsonObjectPayload
} from '../../shared/input';
import type { CliCommandSpec } from '../pipeline';
import {
  confirmDestructiveAction,
  parseOptionalNumber,
  requireActiveClient,
  resolveIdArg
} from './dataset/shared';

function parseSkillCategories(raw: unknown): AgentSkillCategoryEnum[] | undefined {
  const list = parseIdListOption(raw);
  if (!list) return undefined;
  const valid = new Set<string>(Object.values(AgentSkillCategoryEnum));
  for (const item of list) {
    if (!valid.has(item)) {
      throw new CliArgumentError(
        `Invalid skill category "${item}".`,
        undefined,
        `Valid categories: ${[...valid].join(', ')}`
      );
    }
  }
  return list as AgentSkillCategoryEnum[];
}

/** 注册 FastGPT 平台 AI Skill 管理命令（列表、详情、创建、ZIP 导入、删除）。 */
export function createSkillCommandSpecs(): CliCommandSpec[] {
  return [
    {
      path: ['skill', 'list'],
      summary: 'List FastGPT platform AI Skills accessible to the current team',
      risk: 'read',
      authModes: ['token', 'personalKey'],
      options: [
        {
          name: 'source',
          flags: '--source <source>',
          takesValue: true,
          description: 'Filter by skill source: mine (default) or store'
        },
        {
          name: 'search',
          flags: '--search <keyword>',
          takesValue: true,
          description: 'Search skill names and descriptions'
        },
        {
          name: 'category',
          flags: '--category <category>',
          takesValue: true,
          description:
            'Filter by category (search, tool, coding, data, analysis, communication, other)'
        },
        {
          name: 'type',
          flags: '--type <type>',
          takesValue: true,
          description: 'Filter by type: skill or folder'
        },
        {
          name: 'parentId',
          flags: '--parent-id <id>',
          takesValue: true,
          description: 'Parent folder ID ("null" for root)'
        },
        {
          name: 'ids',
          flags: '--ids <skillIds>',
          takesValue: true,
          description: 'Comma-separated skill IDs to fetch directly'
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
          description: 'List personal platform skills',
          args: ['skill', 'list', '--source', 'mine']
        },
        {
          description: 'Search skills by keyword',
          args: ['skill', 'list', '--search', 'migration']
        }
      ],
      execute: ({ options, client, container }) =>
        container.platformSkillService.list({
          client: requireActiveClient(client, 'skill list'),
          input: {
            source: typeof options.source === 'string' ? options.source.trim() : undefined,
            searchKey: typeof options.search === 'string' ? options.search : undefined,
            category: typeof options.category === 'string' ? options.category.trim() : undefined,
            type: typeof options.type === 'string' ? options.type.trim() : undefined,
            parentId: parseParentIdOption(options.parentId),
            skillIds: parseIdListOption(options.ids),
            page: parseOptionalNumber(options.page),
            pageSize: parseOptionalNumber(options.pageSize)
          }
        })
    },

    {
      path: ['skill', 'get'],
      summary: 'Get details of a FastGPT platform AI Skill',
      risk: 'read',
      authModes: ['token', 'personalKey'],
      positionalArgs: [
        { name: 'skillId', required: false, description: 'Skill ObjectId (or use --id)' }
      ],
      options: [
        {
          name: 'id',
          flags: '--id <skillId>',
          takesValue: true,
          description: 'Skill ObjectId (alternative to positional argument)'
        }
      ],
      examples: [
        {
          description: 'Inspect platform skill details',
          args: ['skill', 'get', '68ad85a7463006c963799a05']
        }
      ],
      execute: ({ positional, options, client, container }) => {
        const activeClient = requireActiveClient(client, 'skill get');
        const skillId = resolveIdArg({
          positional: positional[0],
          flagValue: options.id,
          label: 'Skill ID',
          usage: 'fastgpt skill get <skillId> or fastgpt skill get --id <skillId>'
        });

        return container.platformSkillService.getDetail({
          client: activeClient,
          skillId
        });
      }
    },

    {
      path: ['skill', 'create'],
      summary: 'Create a new FastGPT platform AI Skill workspace',
      risk: 'write',
      authModes: ['token', 'personalKey'],
      options: [
        {
          name: 'name',
          flags: '--name <name>',
          takesValue: true,
          description: 'Skill display name'
        },
        {
          name: 'description',
          flags: '--description <text>',
          takesValue: true,
          description: 'Skill description'
        },
        {
          name: 'category',
          flags: '--category <categories>',
          takesValue: true,
          description: 'Comma-separated categories (e.g. tool,coding)'
        },
        {
          name: 'avatar',
          flags: '--avatar <url>',
          takesValue: true,
          description: 'Skill avatar path or URL'
        },
        {
          name: 'parentId',
          flags: '--parent-id <id>',
          takesValue: true,
          description: 'Parent skill folder ID ("null" for root)'
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
          description: 'Validate parameters and preview payload without creating'
        }
      ],
      examples: [
        {
          description: 'Create a new platform AI Skill',
          args: [
            'skill',
            'create',
            '--name',
            'Code Reviewer',
            '--description',
            'Reviews PR diffs',
            '--category',
            'coding'
          ]
        }
      ],
      execute: async ({ options, client, container }) => {
        const activeClient = requireActiveClient(client, 'skill create');
        const filePayload = await resolveJsonObjectPayload({
          filePath: typeof options.file === 'string' ? options.file : undefined,
          useStdin: options.stdin === true,
          readTextFile: container.fileIo.readTextFile,
          readStdin: container.readStdin,
          fieldLabel: 'skill create payload'
        });

        const name = await (async () => {
          const flagName = typeof options.name === 'string' ? options.name.trim() : '';
          const payloadName = typeof filePayload?.name === 'string' ? filePayload.name.trim() : '';
          const direct = flagName || payloadName;
          if (direct) return direct;
          if (container.prompter.isInteractive && options.format !== 'json') {
            return (await container.prompter.text({ message: 'Enter skill name:' })).trim();
          }
          return '';
        })();

        if (!name) {
          throw new CliArgumentError(
            'Skill name is required.',
            undefined,
            'Pass --name "<name>" or include "name" in --file / --stdin JSON.'
          );
        }

        const category = parseSkillCategories(options.category);
        const body: Record<string, unknown> = {
          ...(filePayload ?? {}),
          parentId:
            options.parentId !== undefined
              ? parseParentIdOption(options.parentId)
              : (filePayload?.parentId ?? null),
          name,
          ...(typeof options.description === 'string' ? { description: options.description } : {}),
          ...(category ? { category } : {}),
          ...(typeof options.avatar === 'string' ? { avatar: options.avatar } : {})
        };

        return container.platformSkillService.create({
          client: activeClient,
          input: body,
          dryRun: options.dryRun === true
        });
      }
    },

    {
      path: ['skill', 'import'],
      summary: 'Import a local .zip package as a FastGPT platform AI Skill',
      risk: 'write',
      authModes: ['token', 'personalKey'],
      positionalArgs: [
        { name: 'filePath', required: false, description: 'Local .zip file path (or use --file)' }
      ],
      options: [
        {
          name: 'file',
          flags: '--file <path>',
          takesValue: true,
          description: 'Local .zip skill archive path'
        },
        {
          name: 'name',
          flags: '--name <name>',
          takesValue: true,
          description: 'Override imported skill name'
        },
        {
          name: 'description',
          flags: '--description <text>',
          takesValue: true,
          description: 'Skill description'
        },
        {
          name: 'avatar',
          flags: '--avatar <url>',
          takesValue: true,
          description: 'Skill avatar path or URL'
        },
        {
          name: 'parentId',
          flags: '--parent-id <id>',
          takesValue: true,
          description: 'Target parent skill folder ID'
        },
        {
          name: 'dryRun',
          flags: '--dry-run',
          takesValue: false,
          description: 'Validate archive and preview import without uploading'
        }
      ],
      examples: [
        {
          description: 'Import a skill package into FastGPT',
          args: ['skill', 'import', './my-skill.zip', '--name', 'my-skill']
        }
      ],
      execute: async ({ positional, options, client, container }) => {
        const activeClient = requireActiveClient(client, 'skill import');
        const filePath = resolveIdArg({
          positional: positional[0],
          flagValue: options.file,
          label: 'Skill ZIP file path',
          usage: 'fastgpt skill import <file.zip> or fastgpt skill import --file <file.zip>'
        });

        const file = await container.fileIo.readBinaryFile(filePath);

        return container.platformSkillService.importPackage({
          client: activeClient,
          file,
          input: {
            parentId: parseParentIdOption(options.parentId),
            name: typeof options.name === 'string' ? options.name : undefined,
            description: typeof options.description === 'string' ? options.description : undefined,
            avatar: typeof options.avatar === 'string' ? options.avatar : undefined
          },
          dryRun: options.dryRun === true
        });
      }
    },

    {
      path: ['skill', 'update'],
      summary:
        'Update metadata (name, description, category, avatar) or folder of a platform AI Skill',
      risk: 'write',
      authModes: ['token', 'personalKey'],
      positionalArgs: [
        { name: 'skillId', required: false, description: 'Skill ObjectId (or use --id)' }
      ],
      options: [
        {
          name: 'id',
          flags: '--id <skillId>',
          takesValue: true,
          description: 'Skill ObjectId (alternative to positional argument)'
        },
        {
          name: 'name',
          flags: '--name <name>',
          takesValue: true,
          description: 'New skill display name'
        },
        {
          name: 'description',
          flags: '--description <text>',
          takesValue: true,
          description: 'New skill description'
        },
        {
          name: 'category',
          flags: '--category <categories>',
          takesValue: true,
          description: 'Comma-separated categories (e.g. tool,coding)'
        },
        {
          name: 'avatar',
          flags: '--avatar <path>',
          takesValue: true,
          description: 'New skill avatar path (e.g. from "fastgpt file upload-avatar")'
        },
        {
          name: 'parentId',
          flags: '--parent-id <id>',
          takesValue: true,
          description: 'Move to target skill folder ID ("null" for root)'
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
          description: 'Validate parameters and preview update without applying'
        }
      ],
      examples: [
        {
          description: 'Update a platform skill avatar',
          args: [
            'skill',
            'update',
            '68ad85a7463006c963799a05',
            '--avatar',
            '/api/system/img/avatar/team/file/skill.png'
          ]
        }
      ],
      execute: async ({ positional, options, client, container }) => {
        const activeClient = requireActiveClient(client, 'skill update');
        const filePayload = await resolveJsonObjectPayload({
          filePath: typeof options.file === 'string' ? options.file : undefined,
          useStdin: options.stdin === true,
          readTextFile: container.fileIo.readTextFile,
          readStdin: container.readStdin,
          fieldLabel: 'skill update payload'
        });

        const skillId = resolveIdArg({
          positional: positional[0],
          flagValue:
            options.id ?? (typeof filePayload?.skillId === 'string' ? filePayload.skillId : ''),
          label: 'Skill ID',
          usage: 'fastgpt skill update <skillId> --avatar <path>'
        });

        const category = parseSkillCategories(options.category);
        const body: Record<string, unknown> = {
          ...(filePayload ?? {}),
          skillId,
          ...(typeof options.name === 'string' ? { name: options.name } : {}),
          ...(typeof options.description === 'string' ? { description: options.description } : {}),
          ...(category ? { category } : {}),
          ...(typeof options.avatar === 'string' ? { avatar: options.avatar } : {}),
          ...(options.parentId !== undefined
            ? { parentId: parseParentIdOption(options.parentId) }
            : {})
        };

        return container.platformSkillService.update({
          client: activeClient,
          input: body,
          dryRun: options.dryRun === true
        });
      }
    },

    {
      path: ['skill', 'delete'],
      summary: 'Delete a FastGPT platform AI Skill or folder',
      risk: 'destructive',
      authModes: ['token', 'personalKey'],
      positionalArgs: [
        { name: 'skillId', required: false, description: 'Skill ObjectId (or use --id)' }
      ],
      options: [
        {
          name: 'id',
          flags: '--id <skillId>',
          takesValue: true,
          description: 'Skill ObjectId (alternative to positional argument)'
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
          description: 'Delete a platform skill non-interactively',
          args: ['skill', 'delete', '68ad85a7463006c963799a05', '--yes']
        }
      ],
      execute: async (ctx) => {
        const activeClient = requireActiveClient(ctx.client, 'skill delete');
        const skillId = resolveIdArg({
          positional: ctx.positional[0],
          flagValue: ctx.options.id,
          label: 'Skill ID',
          usage: 'fastgpt skill delete <skillId> --yes'
        });

        await confirmDestructiveAction({
          ctx,
          message: `Delete Skill "${skillId}"?`
        });

        return ctx.container.platformSkillService.delete({
          client: activeClient,
          skillId,
          dryRun: ctx.options.dryRun === true
        });
      }
    },

    {
      path: ['skill', 'folder', 'list'],
      summary: 'List FastGPT platform skill folders',
      risk: 'read',
      authModes: ['token', 'personalKey'],
      options: [
        {
          name: 'search',
          flags: '--search <keyword>',
          takesValue: true,
          description: 'Search skill folders by name or description'
        },
        {
          name: 'parentId',
          flags: '--parent-id <id>',
          takesValue: true,
          description: 'Parent skill folder ID ("null" for root)'
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
          description: 'List personal skill folders',
          args: ['skill', 'folder', 'list']
        }
      ],
      execute: ({ options, client, container }) =>
        container.platformSkillService.listFolders({
          client: requireActiveClient(client, 'skill folder list'),
          input: {
            searchKey: typeof options.search === 'string' ? options.search : undefined,
            parentId: parseParentIdOption(options.parentId),
            page: parseOptionalNumber(options.page),
            pageSize: parseOptionalNumber(options.pageSize)
          }
        })
    },

    {
      path: ['skill', 'folder', 'create'],
      summary: 'Create a new FastGPT platform skill folder',
      risk: 'write',
      authModes: ['token', 'personalKey'],
      options: [
        {
          name: 'name',
          flags: '--name <name>',
          takesValue: true,
          description: 'Skill folder display name'
        },
        {
          name: 'description',
          flags: '--description <text>',
          takesValue: true,
          description: 'Skill folder description'
        },
        {
          name: 'parentId',
          flags: '--parent-id <id>',
          takesValue: true,
          description: 'Parent skill folder ID ("null" for root)'
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
          description: 'Create a skill folder',
          args: ['skill', 'folder', 'create', '--name', 'Migration Skills']
        }
      ],
      execute: async ({ options, client, container }) => {
        const activeClient = requireActiveClient(client, 'skill folder create');
        const filePayload = await resolveJsonObjectPayload({
          filePath: typeof options.file === 'string' ? options.file : undefined,
          useStdin: options.stdin === true,
          readTextFile: container.fileIo.readTextFile,
          readStdin: container.readStdin,
          fieldLabel: 'skill folder create payload'
        });

        const name =
          (typeof options.name === 'string' ? options.name.trim() : '') ||
          (typeof filePayload?.name === 'string' ? filePayload.name.trim() : '');
        if (!name) {
          throw new CliArgumentError(
            'Skill folder name is required.',
            undefined,
            'Pass --name "<folderName>" or provide "name" in --file / --stdin JSON.'
          );
        }

        return container.platformSkillService.createFolder({
          client: activeClient,
          input: {
            name,
            description:
              typeof options.description === 'string'
                ? options.description
                : typeof filePayload?.description === 'string'
                  ? filePayload.description
                  : undefined,
            parentId:
              options.parentId !== undefined
                ? parseParentIdOption(options.parentId)
                : filePayload?.parentId !== undefined
                  ? parseParentIdOption(filePayload.parentId)
                  : null,
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
      path: ['skill', 'folder', 'update'],
      summary: 'Rename, update description, or move a FastGPT platform skill folder',
      risk: 'write',
      authModes: ['token', 'personalKey'],
      positionalArgs: [
        { name: 'folderId', required: false, description: 'Skill folder ObjectId (or use --id)' }
      ],
      options: [
        {
          name: 'id',
          flags: '--id <folderId>',
          takesValue: true,
          description: 'Skill folder ObjectId (alternative to positional argument)'
        },
        {
          name: 'name',
          flags: '--name <name>',
          takesValue: true,
          description: 'New folder name'
        },
        {
          name: 'description',
          flags: '--description <text>',
          takesValue: true,
          description: 'New folder description'
        },
        {
          name: 'parentId',
          flags: '--parent-id <id>',
          takesValue: true,
          description: 'Move to target skill folder ID ("null" for root)'
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
          description: 'Rename a skill folder',
          args: ['skill', 'folder', 'update', '68ad85a7463006c963799a05', '--name', 'Core Skills']
        }
      ],
      execute: ({ positional, options, client, container }) => {
        const activeClient = requireActiveClient(client, 'skill folder update');
        const folderId = resolveIdArg({
          positional: positional[0],
          flagValue: options.id,
          label: 'Skill folder ID',
          usage: 'fastgpt skill folder update <folderId> --name "<newName>"'
        });

        return container.platformSkillService.updateFolder({
          client: activeClient,
          input: {
            folderId,
            name: typeof options.name === 'string' ? options.name : undefined,
            description: typeof options.description === 'string' ? options.description : undefined,
            parentId:
              options.parentId !== undefined ? parseParentIdOption(options.parentId) : undefined
          },
          dryRun: options.dryRun === true
        });
      }
    },

    {
      path: ['skill', 'folder', 'delete'],
      summary:
        'Recursively delete a FastGPT platform skill folder and all nested skills and subfolders',
      risk: 'destructive',
      authModes: ['token', 'personalKey'],
      positionalArgs: [
        { name: 'folderId', required: false, description: 'Skill folder ObjectId (or use --id)' }
      ],
      options: [
        {
          name: 'id',
          flags: '--id <folderId>',
          takesValue: true,
          description: 'Skill folder ObjectId (alternative to positional argument)'
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
          description: 'Delete a skill folder non-interactively',
          args: ['skill', 'folder', 'delete', '68ad85a7463006c963799a05', '--yes']
        }
      ],
      execute: async (ctx) => {
        const activeClient = requireActiveClient(ctx.client, 'skill folder delete');
        const folderId = resolveIdArg({
          positional: ctx.positional[0],
          flagValue: ctx.options.id,
          label: 'Skill folder ID',
          usage: 'fastgpt skill folder delete <folderId> --yes'
        });

        await confirmDestructiveAction({
          ctx,
          message: `Delete skill folder "${folderId}" and recursively delete all nested skills and subfolders?`
        });

        return ctx.container.platformSkillService.deleteFolder({
          client: activeClient,
          folderId,
          dryRun: ctx.options.dryRun === true
        });
      }
    }
  ];
}
