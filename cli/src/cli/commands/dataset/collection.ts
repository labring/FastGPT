import {
  DatasetCollectionDataProcessModeEnum,
  DatasetCollectionTypeEnum
} from '@fastgpt/global/core/dataset/constants';
import { CollectionListSortByEnum } from '@fastgpt/global/openapi/core/dataset/collection/api';
import z from 'zod';
import { CliArgumentError } from '../../../shared/errors';
import {
  parseIdListOption,
  parseParentIdOption,
  resolveJsonObjectPayload,
  resolveTextInput
} from '../../../shared/input';
import type { CliCommandSpec } from '../../pipeline';
import {
  confirmDestructiveAction,
  parseOptionalBooleanFlag,
  parseOptionalNumber,
  requireActiveClient,
  resolveIdArg
} from './shared';

/**
 * 知识库集合命令组（System OpenAPI）：list / get / create / create-text / create-link / create-file / update / delete。
 */
export function createDatasetCollectionCommandSpecs(): CliCommandSpec[] {
  return [
    {
      path: ['dataset', 'collection', 'list'],
      summary: 'List collections inside a dataset with filtering and pagination',
      risk: 'read',
      authModes: ['token', 'personalKey'],
      positionalArgs: [
        {
          name: 'datasetId',
          required: false,
          description: 'Dataset ObjectId (or use --dataset-id)'
        }
      ],
      options: [
        {
          name: 'datasetId',
          flags: '--dataset-id <id>',
          takesValue: true,
          description: 'Dataset ObjectId'
        },
        {
          name: 'parentId',
          flags: '--parent-id <id>',
          takesValue: true,
          description: 'Parent folder collection ID (null for root)'
        },
        {
          name: 'search',
          flags: '--search <keyword>',
          takesValue: true,
          description: 'Search text'
        },
        {
          name: 'selectFolder',
          flags: '--select-folder',
          takesValue: false,
          description: 'Only return folders'
        },
        {
          name: 'sortBy',
          flags: '--sort-by <field>',
          takesValue: true,
          description: 'Sort field: name, createTime, or updateTime'
        },
        {
          name: 'sortOrder',
          flags: '--sort-order <dir>',
          takesValue: true,
          description: 'Sort order: asc or desc'
        },
        {
          name: 'simple',
          flags: '--simple',
          takesValue: false,
          description: 'Simple mode (skip data count)'
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
          description: 'Items per page'
        },
        { name: 'offset', flags: '--offset <n>', takesValue: true, description: 'Offset start' }
      ],
      examples: [
        {
          description: 'List collections in a dataset',
          args: ['dataset', 'collection', 'list', '68ad85a7463006c963799a05']
        }
      ],
      execute: async ({ positional, options, client, container }) => {
        const activeClient = requireActiveClient(client, 'dataset collection list');
        const datasetId = resolveIdArg({
          positional: positional[0],
          flagValue: options.datasetId,
          label: 'Dataset ID',
          usage: 'fastgpt dataset collection list <datasetId>'
        });

        const sortBy =
          typeof options.sortBy === 'string'
            ? CollectionListSortByEnum.parse(options.sortBy)
            : undefined;
        const sortOrder =
          typeof options.sortOrder === 'string'
            ? z.enum(['asc', 'desc']).parse(options.sortOrder)
            : undefined;

        return container.datasetCollectionService.list({
          client: activeClient,
          input: {
            datasetId,
            parentId: parseParentIdOption(options.parentId),
            searchText: typeof options.search === 'string' ? options.search : undefined,
            selectFolder: options.selectFolder === true ? true : undefined,
            sortBy,
            sortOrder,
            simple: options.simple === true ? true : undefined,
            page: parseOptionalNumber(options.page),
            pageSize: parseOptionalNumber(options.pageSize),
            offset: parseOptionalNumber(options.offset)
          }
        });
      }
    },

    {
      path: ['dataset', 'collection', 'get'],
      summary: 'Get details, chunk settings, training status, and metadata of a collection',
      risk: 'read',
      authModes: ['token', 'personalKey'],
      positionalArgs: [
        { name: 'collectionId', required: false, description: 'Collection ObjectId' }
      ],
      options: [
        {
          name: 'id',
          flags: '--id <collectionId>',
          takesValue: true,
          description: 'Collection ObjectId'
        }
      ],
      examples: [
        {
          description: 'Inspect collection details',
          args: ['dataset', 'collection', 'get', '68ad85a7463006c963799a06']
        }
      ],
      execute: async ({ positional, options, client, container }) => {
        const activeClient = requireActiveClient(client, 'dataset collection get');
        const collectionId = resolveIdArg({
          positional: positional[0],
          flagValue: options.id,
          label: 'Collection ID',
          usage: 'fastgpt dataset collection get <collectionId>'
        });

        return container.datasetCollectionService.getDetail({
          client: activeClient,
          collectionId
        });
      }
    },

    {
      path: ['dataset', 'collection', 'create'],
      summary: 'Create a folder or virtual manual collection in a dataset',
      risk: 'write',
      authModes: ['token', 'personalKey'],
      positionalArgs: [{ name: 'datasetId', required: false, description: 'Dataset ObjectId' }],
      options: [
        {
          name: 'datasetId',
          flags: '--dataset-id <id>',
          takesValue: true,
          description: 'Dataset ObjectId'
        },
        {
          name: 'name',
          flags: '--name <name>',
          takesValue: true,
          description: 'Collection or folder name'
        },
        {
          name: 'type',
          flags: '--type <type>',
          takesValue: true,
          description: 'Type: folder or virtual (default virtual)'
        },
        {
          name: 'parentId',
          flags: '--parent-id <id>',
          takesValue: true,
          description: 'Parent folder ID'
        },
        {
          name: 'dryRun',
          flags: '--dry-run',
          takesValue: false,
          description: 'Preview without creating'
        }
      ],
      examples: [
        {
          description: 'Create a virtual manual collection',
          args: [
            'dataset',
            'collection',
            'create',
            '68ad85a7463006c963799a05',
            '--name',
            'Manual FAQ',
            '--type',
            'virtual'
          ]
        }
      ],
      execute: async ({ positional, options, client, container }) => {
        const activeClient = requireActiveClient(client, 'dataset collection create');
        const datasetId = resolveIdArg({
          positional: positional[0],
          flagValue: options.datasetId,
          label: 'Dataset ID',
          usage: 'fastgpt dataset collection create <datasetId> --name <name>'
        });
        const name = typeof options.name === 'string' ? options.name.trim() : '';
        if (!name) {
          throw new CliArgumentError('Collection --name is required.');
        }

        const colType = z
          .enum([DatasetCollectionTypeEnum.folder, DatasetCollectionTypeEnum.virtual])
          .parse(
            typeof options.type === 'string' ? options.type : DatasetCollectionTypeEnum.virtual
          );

        return container.datasetCollectionService.create({
          client: activeClient,
          input: {
            datasetId,
            name,
            type: colType,
            parentId: parseParentIdOption(options.parentId)
          },
          dryRun: options.dryRun === true
        });
      }
    },

    {
      path: ['dataset', 'collection', 'create-text'],
      summary: 'Create a collection by importing text from flag, file, or stdin',
      risk: 'write',
      authModes: ['token', 'personalKey'],
      positionalArgs: [{ name: 'datasetId', required: false, description: 'Dataset ObjectId' }],
      options: [
        {
          name: 'datasetId',
          flags: '--dataset-id <id>',
          takesValue: true,
          description: 'Dataset ObjectId'
        },
        { name: 'name', flags: '--name <name>', takesValue: true, description: 'Collection name' },
        {
          name: 'text',
          flags: '--text <content>',
          takesValue: true,
          description: 'Inline text content'
        },
        {
          name: 'file',
          flags: '--file <path>',
          takesValue: true,
          description: 'Read text from file ("-" for stdin)'
        },
        { name: 'stdin', flags: '--stdin', takesValue: false, description: 'Read text from stdin' },
        {
          name: 'parentId',
          flags: '--parent-id <id>',
          takesValue: true,
          description: 'Parent folder ID'
        },
        {
          name: 'trainingType',
          flags: '--training-type <mode>',
          takesValue: true,
          description: 'Training mode: chunk, qa, imageParse, etc.'
        },
        {
          name: 'chunkSize',
          flags: '--chunk-size <n>',
          takesValue: true,
          description: 'Chunk token size'
        },
        {
          name: 'configFile',
          flags: '--config-file <path>',
          takesValue: true,
          description: 'Optional JSON file with full chunk/training settings'
        },
        {
          name: 'dryRun',
          flags: '--dry-run',
          takesValue: false,
          description: 'Preview without creating'
        }
      ],
      examples: [
        {
          description: 'Create text collection from local markdown file',
          args: [
            'dataset',
            'collection',
            'create-text',
            '68ad85a7463006c963799a05',
            '--name',
            'Architecture Notes',
            '--file',
            './README.md'
          ]
        }
      ],
      execute: async ({ positional, options, client, container }) => {
        const activeClient = requireActiveClient(client, 'dataset collection create-text');
        const datasetId = resolveIdArg({
          positional: positional[0],
          flagValue: options.datasetId,
          label: 'Dataset ID',
          usage: 'fastgpt dataset collection create-text <datasetId> --name <name> --text <text>'
        });

        const name = typeof options.name === 'string' ? options.name.trim() : '';
        if (!name) {
          throw new CliArgumentError('Collection --name is required.');
        }

        const text = await resolveTextInput({
          directText: typeof options.text === 'string' ? options.text : undefined,
          filePath: typeof options.file === 'string' ? options.file : undefined,
          useStdin: options.stdin === true,
          readTextFile: container.fileIo.readTextFile,
          readStdin: container.readStdin,
          fieldLabel: 'collection text'
        });

        if (!text || !text.trim()) {
          throw new CliArgumentError(
            'Text content is required.',
            undefined,
            'Provide --text "...", --file <path>, or --stdin.'
          );
        }

        const extraConfig = await resolveJsonObjectPayload({
          filePath: typeof options.configFile === 'string' ? options.configFile : undefined,
          readTextFile: container.fileIo.readTextFile,
          readStdin: container.readStdin,
          fieldLabel: 'collection config JSON'
        });

        const trainingType =
          typeof options.trainingType === 'string'
            ? z.enum(DatasetCollectionDataProcessModeEnum).parse(options.trainingType)
            : undefined;

        return container.datasetCollectionService.createText({
          client: activeClient,
          input: {
            ...(extraConfig ?? {}),
            datasetId,
            name,
            text,
            ...(options.parentId !== undefined
              ? { parentId: parseParentIdOption(options.parentId) }
              : {}),
            ...(trainingType !== undefined ? { trainingType } : {}),
            ...(options.chunkSize !== undefined
              ? { chunkSize: parseOptionalNumber(options.chunkSize) }
              : {})
          },
          dryRun: options.dryRun === true
        });
      }
    },

    {
      path: ['dataset', 'collection', 'create-link'],
      summary: 'Create a collection by fetching a web URL',
      risk: 'write',
      authModes: ['token', 'personalKey'],
      positionalArgs: [
        { name: 'datasetId', required: false, description: 'Dataset ObjectId' },
        { name: 'link', required: false, description: 'Web page URL (or use --link)' }
      ],
      options: [
        {
          name: 'datasetId',
          flags: '--dataset-id <id>',
          takesValue: true,
          description: 'Dataset ObjectId'
        },
        { name: 'link', flags: '--link <url>', takesValue: true, description: 'Web page URL' },
        {
          name: 'parentId',
          flags: '--parent-id <id>',
          takesValue: true,
          description: 'Parent folder ID'
        },
        {
          name: 'trainingType',
          flags: '--training-type <mode>',
          takesValue: true,
          description: 'Training mode: chunk, qa, etc.'
        },
        {
          name: 'chunkSize',
          flags: '--chunk-size <n>',
          takesValue: true,
          description: 'Chunk token size'
        },
        {
          name: 'dryRun',
          flags: '--dry-run',
          takesValue: false,
          description: 'Preview without creating'
        }
      ],
      examples: [
        {
          description: 'Create collection from web URL',
          args: [
            'dataset',
            'collection',
            'create-link',
            '68ad85a7463006c963799a05',
            'https://doc.fastgpt.cn'
          ]
        }
      ],
      execute: async ({ positional, options, client, container }) => {
        const activeClient = requireActiveClient(client, 'dataset collection create-link');
        const datasetId = resolveIdArg({
          positional: positional[0],
          flagValue: options.datasetId,
          label: 'Dataset ID',
          usage: 'fastgpt dataset collection create-link <datasetId> <url>'
        });
        const link = resolveIdArg({
          positional: positional[1],
          flagValue: options.link,
          label: 'Link URL',
          usage: 'fastgpt dataset collection create-link <datasetId> --link <url>'
        });

        const trainingType =
          typeof options.trainingType === 'string'
            ? z.enum(DatasetCollectionDataProcessModeEnum).parse(options.trainingType)
            : undefined;

        return container.datasetCollectionService.createLink({
          client: activeClient,
          input: {
            datasetId,
            link,
            ...(options.parentId !== undefined
              ? { parentId: parseParentIdOption(options.parentId) }
              : {}),
            ...(trainingType !== undefined ? { trainingType } : {}),
            ...(options.chunkSize !== undefined
              ? { chunkSize: parseOptionalNumber(options.chunkSize) }
              : {})
          },
          dryRun: options.dryRun === true
        });
      }
    },

    {
      path: ['dataset', 'collection', 'create-file'],
      summary: 'Upload a local file via multipart/form-data to create a collection',
      risk: 'write',
      authModes: ['token', 'personalKey'],
      positionalArgs: [
        { name: 'datasetId', required: false, description: 'Dataset ObjectId' },
        { name: 'filePath', required: false, description: 'Local file path (or use --file)' }
      ],
      options: [
        {
          name: 'datasetId',
          flags: '--dataset-id <id>',
          takesValue: true,
          description: 'Dataset ObjectId'
        },
        {
          name: 'file',
          flags: '--file <path>',
          takesValue: true,
          description: 'Local file path to upload'
        },
        {
          name: 'parentId',
          flags: '--parent-id <id>',
          takesValue: true,
          description: 'Parent folder ID'
        },
        {
          name: 'trainingType',
          flags: '--training-type <mode>',
          takesValue: true,
          description: 'Training mode: chunk, qa, etc.'
        },
        {
          name: 'chunkSize',
          flags: '--chunk-size <n>',
          takesValue: true,
          description: 'Chunk token size'
        },
        {
          name: 'customPdfParse',
          flags: '--custom-pdf-parse',
          takesValue: false,
          description: 'Enable custom PDF parsing'
        },
        {
          name: 'configFile',
          flags: '--config-file <path>',
          takesValue: true,
          description: 'Optional JSON file with full chunk/training settings'
        },
        {
          name: 'dryRun',
          flags: '--dry-run',
          takesValue: false,
          description: 'Preview upload without sending'
        }
      ],
      examples: [
        {
          description: 'Upload local PDF to dataset',
          args: ['dataset', 'collection', 'create-file', '68ad85a7463006c963799a05', './manual.pdf']
        }
      ],
      execute: async ({ positional, options, client, container }) => {
        const activeClient = requireActiveClient(client, 'dataset collection create-file');
        const datasetId = resolveIdArg({
          positional: positional[0],
          flagValue: options.datasetId,
          label: 'Dataset ID',
          usage: 'fastgpt dataset collection create-file <datasetId> <filePath>'
        });
        const filePath = resolveIdArg({
          positional: positional[1],
          flagValue: options.file,
          label: 'File path',
          usage: 'fastgpt dataset collection create-file <datasetId> --file <path>'
        });

        const file = await container.fileIo.readBinaryFile(filePath);
        const extraConfig = await resolveJsonObjectPayload({
          filePath: typeof options.configFile === 'string' ? options.configFile : undefined,
          readTextFile: container.fileIo.readTextFile,
          readStdin: container.readStdin,
          fieldLabel: 'collection config JSON'
        });

        const trainingType =
          typeof options.trainingType === 'string'
            ? z.enum(DatasetCollectionDataProcessModeEnum).parse(options.trainingType)
            : undefined;

        const input = {
          ...(extraConfig ?? {}),
          datasetId,
          ...(options.parentId !== undefined
            ? { parentId: parseParentIdOption(options.parentId) }
            : {}),
          ...(trainingType !== undefined ? { trainingType } : {}),
          ...(options.chunkSize !== undefined
            ? { chunkSize: parseOptionalNumber(options.chunkSize) }
            : {}),
          ...(options.customPdfParse === true ? { customPdfParse: true } : {})
        };

        return container.datasetCollectionService.createLocalFile({
          client: activeClient,
          file,
          input,
          dryRun: options.dryRun === true
        });
      }
    },

    {
      path: ['dataset', 'collection', 'update'],
      summary: 'Update collection name, parent folder, tags, or forbid status',
      risk: 'write',
      authModes: ['token', 'personalKey'],
      positionalArgs: [
        { name: 'collectionId', required: false, description: 'Collection ObjectId' }
      ],
      options: [
        {
          name: 'id',
          flags: '--id <collectionId>',
          takesValue: true,
          description: 'Collection ObjectId'
        },
        {
          name: 'name',
          flags: '--name <name>',
          takesValue: true,
          description: 'New collection name'
        },
        {
          name: 'parentId',
          flags: '--parent-id <id>',
          takesValue: true,
          description: 'New parent folder ID (null for root)'
        },
        {
          name: 'forbid',
          flags: '--forbid',
          takesValue: false,
          description: 'Disable/forbid this collection'
        },
        {
          name: 'noForbid',
          flags: '--no-forbid',
          takesValue: false,
          description: 'Enable/unforbid this collection'
        },
        {
          name: 'file',
          flags: '--file <path>',
          takesValue: true,
          description: 'Read update JSON payload from file'
        },
        {
          name: 'dryRun',
          flags: '--dry-run',
          takesValue: false,
          description: 'Preview without applying'
        }
      ],
      examples: [
        {
          description: 'Rename a collection',
          args: [
            'dataset',
            'collection',
            'update',
            '68ad85a7463006c963799a06',
            '--name',
            'Updated Title'
          ]
        }
      ],
      execute: async ({ positional, options, client, container }) => {
        const activeClient = requireActiveClient(client, 'dataset collection update');
        const id = positional[0] ?? (typeof options.id === 'string' ? options.id : undefined);
        const filePayload = await resolveJsonObjectPayload({
          filePath: typeof options.file === 'string' ? options.file : undefined,
          readTextFile: container.fileIo.readTextFile,
          readStdin: container.readStdin,
          fieldLabel: 'collection update payload'
        });

        const forbid = parseOptionalBooleanFlag({
          positive: options.forbid,
          negative: options.noForbid
        });

        const mergedInput: Record<string, unknown> = {
          ...(filePayload ?? {}),
          ...(id ? { id: id.trim() } : {}),
          ...(typeof options.name === 'string' ? { name: options.name } : {}),
          ...(options.parentId !== undefined
            ? { parentId: parseParentIdOption(options.parentId) }
            : {}),
          ...(forbid !== undefined ? { forbid } : {})
        };

        const hasTargetId =
          (typeof mergedInput.id === 'string' && mergedInput.id.trim().length > 0) ||
          (typeof mergedInput.datasetId === 'string' &&
            mergedInput.datasetId.trim().length > 0 &&
            typeof mergedInput.externalFileId === 'string' &&
            mergedInput.externalFileId.trim().length > 0);
        if (!hasTargetId) {
          throw new CliArgumentError(
            'Collection ID (or datasetId + externalFileId) is required.',
            undefined,
            'Usage: fastgpt dataset collection update <collectionId> --name "New Name"'
          );
        }

        return container.datasetCollectionService.update({
          client: activeClient,
          input: mergedInput,
          dryRun: options.dryRun === true
        });
      }
    },

    {
      path: ['dataset', 'collection', 'delete'],
      summary: 'Delete one or more collections (and child collections) from a dataset',
      risk: 'destructive',
      authModes: ['token', 'personalKey'],
      positionalArgs: [
        { name: 'collectionId', required: false, description: 'Collection ObjectId' }
      ],
      options: [
        {
          name: 'id',
          flags: '--id <collectionId>',
          takesValue: true,
          description: 'Single collection ObjectId'
        },
        {
          name: 'ids',
          flags: '--ids <ids>',
          takesValue: true,
          description: 'Comma-separated collection ObjectIds'
        },
        {
          name: 'dryRun',
          flags: '--dry-run',
          takesValue: false,
          description: 'Preview deletion without executing'
        },
        {
          name: 'yes',
          flags: '--yes',
          takesValue: false,
          description: 'Confirm deletion in non-interactive mode'
        }
      ],
      examples: [
        {
          description: 'Delete a collection non-interactively',
          args: ['dataset', 'collection', 'delete', '68ad85a7463006c963799a06', '--yes']
        }
      ],
      execute: async (ctx) => {
        const activeClient = requireActiveClient(ctx.client, 'dataset collection delete');
        const batchIds = parseIdListOption(ctx.options.ids);
        const singleId =
          ctx.positional[0] ?? (typeof ctx.options.id === 'string' ? ctx.options.id.trim() : '');

        if (!batchIds && !singleId) {
          throw new CliArgumentError(
            'Collection ID or --ids is required.',
            undefined,
            'Usage: fastgpt dataset collection delete <collectionId> --yes'
          );
        }

        const target = batchIds ? { collectionIds: batchIds } : { id: singleId };

        await confirmDestructiveAction({
          ctx,
          message: batchIds
            ? `Permanently delete ${batchIds.length} collection(s)?`
            : `Permanently delete collection "${singleId}"?`
        });

        return ctx.container.datasetCollectionService.delete({
          client: activeClient,
          target,
          dryRun: ctx.options.dryRun === true
        });
      }
    }
  ];
}
