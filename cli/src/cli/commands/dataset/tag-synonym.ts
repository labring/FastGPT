import { DatasetCollectionTagTypeEnum } from '@fastgpt/global/core/dataset/type';
import {
  BatchSetCollectionTagsBodySchema,
  SetCollectionTagsBodySchema
} from '@fastgpt/global/openapi/core/dataset/collection/tagApi';
import {
  UpdateDatasetSynonymBodySchema,
  UploadDatasetSynonymBodySchema
} from '@fastgpt/global/openapi/core/dataset/synonym/api';
import z from 'zod';
import { CliArgumentError } from '../../../shared/errors';
import { parseIdListOption, resolveJsonPayload } from '../../../shared/input';
import type { CliCommandSpec } from '../../pipeline';
import {
  confirmDestructiveAction,
  parseOptionalNumber,
  requireActiveClient,
  resolveIdArg
} from './shared';

/**
 * 知识库标签（Pro）与同义词词表命令组（PRD-02.3）。
 */
export function createDatasetTagSynonymCommandSpecs(): CliCommandSpec[] {
  return [
    // ==================== dataset tag (Pro) ====================
    {
      path: ['dataset', 'tag', 'list'],
      summary: 'List all tags defined in a dataset (Pro edition)',
      risk: 'read',
      authModes: ['token'],
      positionalArgs: [{ name: 'datasetId', required: false, description: 'Dataset ObjectId' }],
      options: [
        {
          name: 'datasetId',
          flags: '--dataset-id <id>',
          takesValue: true,
          description: 'Dataset ObjectId'
        }
      ],
      examples: [
        {
          description: 'List all tags in a dataset',
          args: ['dataset', 'tag', 'list', '68ad85a7463006c963799a05']
        }
      ],
      execute: async ({ positional, options, client, container }) => {
        const activeClient = requireActiveClient(client, 'dataset tag list');
        const datasetId = resolveIdArg({
          positional: positional[0],
          flagValue: options.datasetId,
          label: 'Dataset ID',
          usage: 'fastgpt dataset tag list <datasetId>'
        });

        return container.datasetTagSynonymService.listTags({
          client: activeClient,
          datasetId
        });
      }
    },

    {
      path: ['dataset', 'tag', 'create'],
      summary: 'Create a collection tag in a dataset (Pro edition)',
      risk: 'write',
      authModes: ['token'],
      positionalArgs: [{ name: 'datasetId', required: false, description: 'Dataset ObjectId' }],
      options: [
        {
          name: 'datasetId',
          flags: '--dataset-id <id>',
          takesValue: true,
          description: 'Dataset ObjectId'
        },
        { name: 'tag', flags: '--tag <name>', takesValue: true, description: 'Tag name' },
        {
          name: 'tagType',
          flags: '--tag-type <type>',
          takesValue: true,
          description: 'Tag type: string (default), number, datetime, or array'
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
          description: 'Create a tag',
          args: ['dataset', 'tag', 'create', '68ad85a7463006c963799a05', '--tag', 'PRD']
        }
      ],
      execute: async ({ positional, options, client, container }) => {
        const activeClient = requireActiveClient(client, 'dataset tag create');
        const datasetId = resolveIdArg({
          positional: positional[0],
          flagValue: options.datasetId,
          label: 'Dataset ID',
          usage: 'fastgpt dataset tag create <datasetId> --tag <name>'
        });
        const tag = typeof options.tag === 'string' ? options.tag.trim() : '';
        if (!tag) {
          throw new CliArgumentError('--tag name is required.');
        }

        const tagType =
          typeof options.tagType === 'string'
            ? z.enum(DatasetCollectionTagTypeEnum).parse(options.tagType)
            : undefined;

        return container.datasetTagSynonymService.createTag({
          client: activeClient,
          input: {
            datasetId,
            tag,
            ...(tagType !== undefined ? { tagType } : {})
          },
          dryRun: options.dryRun === true
        });
      }
    },

    {
      path: ['dataset', 'tag', 'update'],
      summary: 'Rename or update options of a dataset tag (Pro edition)',
      risk: 'write',
      authModes: ['token'],
      options: [
        {
          name: 'datasetId',
          flags: '--dataset-id <id>',
          takesValue: true,
          description: 'Dataset ObjectId'
        },
        { name: 'tagId', flags: '--tag-id <id>', takesValue: true, description: 'Tag ObjectId' },
        { name: 'tag', flags: '--tag <name>', takesValue: true, description: 'New tag name' },
        {
          name: 'file',
          flags: '--file <path>',
          takesValue: true,
          description: 'Optional JSON file with options/renames'
        },
        {
          name: 'dryRun',
          flags: '--dry-run',
          takesValue: false,
          description: 'Preview without updating'
        }
      ],
      examples: [
        {
          description: 'Rename a dataset tag',
          args: [
            'dataset',
            'tag',
            'update',
            '--dataset-id',
            '68ad85a7463006c963799a05',
            '--tag-id',
            '68ad85a7463006c963799a08',
            '--tag',
            'Specs'
          ]
        }
      ],
      execute: async ({ options, client, container }) => {
        const activeClient = requireActiveClient(client, 'dataset tag update');
        const datasetId = typeof options.datasetId === 'string' ? options.datasetId.trim() : '';
        const tagId = typeof options.tagId === 'string' ? options.tagId.trim() : '';
        const tag = typeof options.tag === 'string' ? options.tag.trim() : '';
        if (!datasetId || !tagId || !tag) {
          throw new CliArgumentError('--dataset-id, --tag-id, and --tag are required.');
        }

        const filePayload = await resolveJsonPayload<Record<string, unknown>>({
          filePath: typeof options.file === 'string' ? options.file : undefined,
          readTextFile: container.fileIo.readTextFile,
          readStdin: container.readStdin,
          fieldLabel: 'tag update payload'
        });

        return container.datasetTagSynonymService.updateTag({
          client: activeClient,
          input: {
            ...(filePayload ?? {}),
            datasetId,
            tagId,
            tag
          } as any,
          dryRun: options.dryRun === true
        });
      }
    },

    {
      path: ['dataset', 'tag', 'delete'],
      summary: 'Delete a dataset tag permanently (Pro edition)',
      risk: 'destructive',
      authModes: ['token'],
      options: [
        {
          name: 'datasetId',
          flags: '--dataset-id <id>',
          takesValue: true,
          description: 'Dataset ObjectId'
        },
        { name: 'tagId', flags: '--tag-id <id>', takesValue: true, description: 'Tag ObjectId' },
        {
          name: 'dryRun',
          flags: '--dry-run',
          takesValue: false,
          description: 'Preview without deleting'
        },
        { name: 'yes', flags: '--yes', takesValue: false, description: 'Confirm deletion' }
      ],
      examples: [
        {
          description: 'Delete a dataset tag',
          args: [
            'dataset',
            'tag',
            'delete',
            '--dataset-id',
            '68ad85a7463006c963799a05',
            '--tag-id',
            '68ad85a7463006c963799a08',
            '--yes'
          ]
        }
      ],
      execute: async (ctx) => {
        const activeClient = requireActiveClient(ctx.client, 'dataset tag delete');
        const datasetId =
          typeof ctx.options.datasetId === 'string' ? ctx.options.datasetId.trim() : '';
        const tagId = typeof ctx.options.tagId === 'string' ? ctx.options.tagId.trim() : '';
        if (!datasetId || !tagId) {
          throw new CliArgumentError('--dataset-id and --tag-id are required.');
        }

        await confirmDestructiveAction({
          ctx,
          message: `Permanently delete tag "${tagId}" from dataset "${datasetId}"?`
        });

        return ctx.container.datasetTagSynonymService.deleteTag({
          client: activeClient,
          datasetId,
          tagId,
          dryRun: ctx.options.dryRun === true
        });
      }
    },

    {
      path: ['dataset', 'tag', 'bind'],
      summary: 'Set or batch-set tag values on collection(s) (Pro edition)',
      risk: 'write',
      authModes: ['token'],
      options: [
        {
          name: 'datasetId',
          flags: '--dataset-id <id>',
          takesValue: true,
          description: 'Dataset ObjectId'
        },
        {
          name: 'collectionId',
          flags: '--collection-id <id>',
          takesValue: true,
          description: 'Single collection ID'
        },
        {
          name: 'collectionIds',
          flags: '--collection-ids <ids>',
          takesValue: true,
          description: 'Comma-separated collection IDs'
        },
        {
          name: 'mode',
          flags: '--mode <mode>',
          takesValue: true,
          description: 'Batch mode: add (default) or remove'
        },
        {
          name: 'file',
          flags: '--file <path>',
          takesValue: true,
          description: 'JSON file with tags payload'
        },
        {
          name: 'stdin',
          flags: '--stdin',
          takesValue: false,
          description: 'Read tags JSON from stdin'
        },
        {
          name: 'dryRun',
          flags: '--dry-run',
          takesValue: false,
          description: 'Preview without executing'
        }
      ],
      examples: [
        {
          description: 'Bind tags to a collection from JSON',
          args: [
            'dataset',
            'tag',
            'bind',
            '--dataset-id',
            '68ad85a7463006c963799a05',
            '--collection-id',
            '68ad85a7463006c963799a06',
            '--file',
            'tags.json'
          ]
        }
      ],
      execute: async ({ options, client, container }) => {
        const activeClient = requireActiveClient(client, 'dataset tag bind');
        const datasetId = typeof options.datasetId === 'string' ? options.datasetId.trim() : '';
        const collectionIds = parseIdListOption(options.collectionIds);
        const singleCollectionId =
          typeof options.collectionId === 'string' ? options.collectionId.trim() : '';

        if (!datasetId || (!collectionIds && !singleCollectionId)) {
          throw new CliArgumentError(
            '--dataset-id and (--collection-id or --collection-ids) are required.'
          );
        }

        const parsed = await resolveJsonPayload<unknown>({
          filePath: typeof options.file === 'string' ? options.file : undefined,
          useStdin: options.stdin === true,
          readTextFile: container.fileIo.readTextFile,
          readStdin: container.readStdin,
          fieldLabel: 'tag bind payload'
        });

        const tags = Array.isArray(parsed)
          ? parsed
          : ((parsed as Record<string, unknown> | undefined)?.tags as unknown[] | undefined);
        if (!Array.isArray(tags)) {
          throw new CliArgumentError('Tags array is required via --file or --stdin.');
        }

        if (collectionIds) {
          const rawMode = options.mode;
          if (rawMode !== undefined && rawMode !== 'add' && rawMode !== 'remove') {
            throw new CliArgumentError('--mode must be "add" or "remove".');
          }
          const validatedBatch = BatchSetCollectionTagsBodySchema.parse({
            datasetId,
            collectionIds,
            mode: rawMode ?? 'add',
            tags
          });
          return container.datasetTagSynonymService.batchSetCollectionTags({
            client: activeClient,
            input: validatedBatch,
            dryRun: options.dryRun === true
          });
        }

        const validatedSingle = SetCollectionTagsBodySchema.parse({
          datasetId,
          collectionId: singleCollectionId,
          tags
        });
        return container.datasetTagSynonymService.setCollectionTags({
          client: activeClient,
          input: validatedSingle,
          dryRun: options.dryRun === true
        });
      }
    },

    // ==================== dataset synonym ====================
    {
      path: ['dataset', 'synonym', 'detail'],
      summary: 'Get current synonym configuration and rebuild status of a dataset',
      risk: 'read',
      authModes: ['token', 'personalKey'],
      positionalArgs: [{ name: 'datasetId', required: false, description: 'Dataset ObjectId' }],
      options: [
        {
          name: 'datasetId',
          flags: '--dataset-id <id>',
          takesValue: true,
          description: 'Dataset ObjectId'
        }
      ],
      examples: [
        {
          description: 'Get dataset synonym detail',
          args: ['dataset', 'synonym', 'detail', '68ad85a7463006c963799a05']
        }
      ],
      execute: async ({ positional, options, client, container }) => {
        const activeClient = requireActiveClient(client, 'dataset synonym detail');
        const datasetId = resolveIdArg({
          positional: positional[0],
          flagValue: options.datasetId,
          label: 'Dataset ID',
          usage: 'fastgpt dataset synonym detail <datasetId>'
        });

        return container.datasetTagSynonymService.getSynonymDetail({
          client: activeClient,
          datasetId
        });
      }
    },

    {
      path: ['dataset', 'synonym', 'list'],
      summary: 'Search and paginate active synonym mappings in a dataset',
      risk: 'read',
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
          name: 'search',
          flags: '--search <keyword>',
          takesValue: true,
          description: 'Filter keyword'
        },
        { name: 'page', flags: '--page <n>', takesValue: true, description: 'Page number' },
        {
          name: 'pageSize',
          flags: '--page-size <n>',
          takesValue: true,
          description: 'Items per page (max 100)'
        }
      ],
      examples: [
        {
          description: 'Search synonym mappings',
          args: ['dataset', 'synonym', 'list', '68ad85a7463006c963799a05', '--search', 'AI']
        }
      ],
      execute: async ({ positional, options, client, container }) => {
        const activeClient = requireActiveClient(client, 'dataset synonym list');
        const datasetId = resolveIdArg({
          positional: positional[0],
          flagValue: options.datasetId,
          label: 'Dataset ID',
          usage: 'fastgpt dataset synonym list <datasetId>'
        });

        return container.datasetTagSynonymService.searchSynonymMappings({
          client: activeClient,
          datasetId,
          search: typeof options.search === 'string' ? options.search : undefined,
          page: parseOptionalNumber(options.page),
          pageSize: parseOptionalNumber(options.pageSize)
        });
      }
    },

    {
      path: ['dataset', 'synonym', 'upload'],
      summary: 'Upload synonym mappings from a CSV/XLS/XLSX file or JSON mappings file',
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
          name: 'file',
          flags: '--file <path>',
          takesValue: true,
          description: 'CSV/XLS/XLSX or JSON mappings file path'
        },
        {
          name: 'fileName',
          flags: '--file-name <name>',
          takesValue: true,
          description: 'Optional display filename for JSON upload'
        },
        {
          name: 'dryRun',
          flags: '--dry-run',
          takesValue: false,
          description: 'Preview without uploading'
        }
      ],
      examples: [
        {
          description: 'Upload synonym CSV file',
          args: [
            'dataset',
            'synonym',
            'upload',
            '68ad85a7463006c963799a05',
            '--file',
            'synonyms.csv'
          ]
        }
      ],
      execute: async ({ positional, options, client, container }) => {
        const activeClient = requireActiveClient(client, 'dataset synonym upload');
        const datasetId = resolveIdArg({
          positional: positional[0],
          flagValue: options.datasetId,
          label: 'Dataset ID',
          usage: 'fastgpt dataset synonym upload <datasetId> --file synonyms.csv'
        });
        const filePath = typeof options.file === 'string' ? options.file.trim() : '';
        if (!filePath) {
          throw new CliArgumentError('--file <path> is required.');
        }

        if (filePath.toLowerCase().endsWith('.json')) {
          const parsed = await resolveJsonPayload<unknown>({
            filePath,
            readTextFile: container.fileIo.readTextFile,
            readStdin: container.readStdin,
            fieldLabel: 'synonym JSON mappings'
          });
          const mappings = Array.isArray(parsed)
            ? parsed
            : (parsed as Record<string, unknown> | undefined)?.mappings;
          if (!Array.isArray(mappings)) {
            throw new CliArgumentError(
              'Synonym JSON file must contain a mappings array.',
              undefined,
              'Provide a JSON array of mappings or { "mappings": [...] } via --file <path>.'
            );
          }
          const validatedInput = UploadDatasetSynonymBodySchema.parse({
            datasetId,
            mappings,
            ...(typeof options.fileName === 'string' ? { fileName: options.fileName } : {})
          });
          return container.datasetTagSynonymService.uploadSynonymMappings({
            client: activeClient,
            input: validatedInput,
            dryRun: options.dryRun === true
          });
        }

        const file = await container.fileIo.readBinaryFile(filePath);
        return container.datasetTagSynonymService.uploadSynonymFile({
          client: activeClient,
          datasetId,
          file,
          dryRun: options.dryRun === true
        });
      }
    },

    {
      path: ['dataset', 'synonym', 'update'],
      summary: 'Update synonym mappings from a CSV/XLS/XLSX file or JSON mappings file',
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
          name: 'synonymId',
          flags: '--synonym-id <id>',
          takesValue: true,
          description: 'Current synonym config ObjectId'
        },
        {
          name: 'version',
          flags: '--version <n>',
          takesValue: true,
          description: 'Current fileVersion for optimistic concurrency'
        },
        {
          name: 'file',
          flags: '--file <path>',
          takesValue: true,
          description: 'CSV/XLS/XLSX or JSON mappings file path'
        },
        {
          name: 'dryRun',
          flags: '--dry-run',
          takesValue: false,
          description: 'Preview without updating'
        }
      ],
      examples: [
        {
          description: 'Update synonym CSV file',
          args: [
            'dataset',
            'synonym',
            'update',
            '68ad85a7463006c963799a05',
            '--synonym-id',
            '68ad85a7463006c963799a09',
            '--version',
            '1',
            '--file',
            'synonyms-v2.csv'
          ]
        }
      ],
      execute: async ({ positional, options, client, container }) => {
        const activeClient = requireActiveClient(client, 'dataset synonym update');
        const datasetId = resolveIdArg({
          positional: positional[0],
          flagValue: options.datasetId,
          label: 'Dataset ID',
          usage:
            'fastgpt dataset synonym update <datasetId> --synonym-id <id> --version <n> --file <path>'
        });
        const oldSynonymId = typeof options.synonymId === 'string' ? options.synonymId.trim() : '';
        const oldFileVersion = parseOptionalNumber(options.version);
        const filePath = typeof options.file === 'string' ? options.file.trim() : '';
        if (!oldSynonymId || oldFileVersion === undefined || !filePath) {
          throw new CliArgumentError('--synonym-id, --version, and --file are required.');
        }

        if (filePath.toLowerCase().endsWith('.json')) {
          const parsed = await resolveJsonPayload<unknown>({
            filePath,
            readTextFile: container.fileIo.readTextFile,
            readStdin: container.readStdin,
            fieldLabel: 'synonym JSON mappings'
          });
          const mappings = Array.isArray(parsed)
            ? parsed
            : (parsed as Record<string, unknown> | undefined)?.mappings;
          if (!Array.isArray(mappings)) {
            throw new CliArgumentError(
              'Synonym JSON file must contain a mappings array.',
              undefined,
              'Provide a JSON array of mappings or { "mappings": [...] } via --file <path>.'
            );
          }
          const validatedInput = UpdateDatasetSynonymBodySchema.parse({
            datasetId,
            oldSynonymId,
            oldFileVersion,
            mappings
          });
          return container.datasetTagSynonymService.updateSynonymMappings({
            client: activeClient,
            input: validatedInput,
            dryRun: options.dryRun === true
          });
        }

        const file = await container.fileIo.readBinaryFile(filePath);
        return container.datasetTagSynonymService.updateSynonymFile({
          client: activeClient,
          datasetId,
          oldSynonymId,
          oldFileVersion,
          file,
          dryRun: options.dryRun === true
        });
      }
    },

    {
      path: ['dataset', 'synonym', 'delete'],
      summary: 'Disable and delete dataset synonym configuration',
      risk: 'destructive',
      authModes: ['token', 'personalKey'],
      positionalArgs: [
        { name: 'synonymId', required: false, description: 'Synonym config ObjectId' }
      ],
      options: [
        {
          name: 'id',
          flags: '--id <synonymId>',
          takesValue: true,
          description: 'Synonym config ObjectId'
        },
        {
          name: 'version',
          flags: '--version <n>',
          takesValue: true,
          description: 'Current fileVersion'
        },
        {
          name: 'dryRun',
          flags: '--dry-run',
          takesValue: false,
          description: 'Preview without deleting'
        },
        { name: 'yes', flags: '--yes', takesValue: false, description: 'Confirm deletion' }
      ],
      examples: [
        {
          description: 'Delete synonym config',
          args: [
            'dataset',
            'synonym',
            'delete',
            '68ad85a7463006c963799a09',
            '--version',
            '1',
            '--yes'
          ]
        }
      ],
      execute: async (ctx) => {
        const activeClient = requireActiveClient(ctx.client, 'dataset synonym delete');
        const synonymId = resolveIdArg({
          positional: ctx.positional[0],
          flagValue: ctx.options.id,
          label: 'Synonym ID',
          usage: 'fastgpt dataset synonym delete <synonymId> --version <n> --yes'
        });
        const oldFileVersion = parseOptionalNumber(ctx.options.version);
        if (oldFileVersion === undefined) {
          throw new CliArgumentError('--version <n> is required.');
        }

        await confirmDestructiveAction({
          ctx,
          message: `Delete synonym config "${synonymId}" (version ${oldFileVersion})?`
        });

        return ctx.container.datasetTagSynonymService.deleteSynonym({
          client: activeClient,
          synonymId,
          oldFileVersion,
          dryRun: ctx.options.dryRun === true
        });
      }
    },

    {
      path: ['dataset', 'synonym', 'download'],
      summary: 'Download active dataset synonym CSV file',
      risk: 'read',
      authModes: ['token', 'personalKey'],
      positionalArgs: [
        { name: 'synonymId', required: false, description: 'Synonym config ObjectId' }
      ],
      options: [
        {
          name: 'id',
          flags: '--id <synonymId>',
          takesValue: true,
          description: 'Synonym config ObjectId'
        },
        {
          name: 'output',
          flags: '--output <path>',
          takesValue: true,
          description: 'Output CSV file path'
        }
      ],
      examples: [
        {
          description: 'Download synonym CSV to file',
          args: [
            'dataset',
            'synonym',
            'download',
            '68ad85a7463006c963799a09',
            '--output',
            'synonyms.csv'
          ]
        }
      ],
      execute: async ({ positional, options, client, container }) => {
        const activeClient = requireActiveClient(client, 'dataset synonym download');
        const synonymId = resolveIdArg({
          positional: positional[0],
          flagValue: options.id,
          label: 'Synonym ID',
          usage: 'fastgpt dataset synonym download <synonymId> --output synonyms.csv'
        });
        const outputPath = typeof options.output === 'string' ? options.output : undefined;

        return container.datasetTagSynonymService.downloadSynonym({
          client: activeClient,
          synonymId,
          writeOutput: outputPath
            ? (bytes) => container.fileIo.writeOutputFile(outputPath, bytes)
            : undefined
        });
      }
    }
  ];
}
