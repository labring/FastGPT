import { DatasetDataIndexTypeEnum } from '@fastgpt/global/core/dataset/data/constants';
import z from 'zod';
import { CliArgumentError } from '../../../shared/errors';
import { resolveJsonPayload } from '../../../shared/input';
import type { CliCommandSpec } from '../../pipeline';
import {
  confirmDestructiveAction,
  parseOptionalNumber,
  requireActiveClient,
  resolveIdArg
} from './shared';

/**
 * 知识库分块数据与索引命令组（PRD-02.3）。
 */
export function createDatasetDataCommandSpecs(): CliCommandSpec[] {
  return [
    {
      path: ['dataset', 'data', 'list'],
      summary: 'List data chunks inside a collection with search and pagination',
      risk: 'read',
      authModes: ['token', 'personalKey'],
      positionalArgs: [
        {
          name: 'collectionId',
          required: false,
          description: 'Collection ObjectId (or --collection-id)'
        }
      ],
      options: [
        {
          name: 'collectionId',
          flags: '--collection-id <id>',
          takesValue: true,
          description: 'Collection ObjectId'
        },
        {
          name: 'search',
          flags: '--search <keyword>',
          takesValue: true,
          description: 'Search keyword in q/a'
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
          description: 'List chunks in a collection',
          args: ['dataset', 'data', 'list', '68ad85a7463006c963799a06']
        }
      ],
      execute: async ({ positional, options, client, container }) => {
        const activeClient = requireActiveClient(client, 'dataset data list');
        const collectionId = resolveIdArg({
          positional: positional[0],
          flagValue: options.collectionId,
          label: 'Collection ID',
          usage: 'fastgpt dataset data list <collectionId>'
        });

        return container.datasetDataService.list({
          client: activeClient,
          input: {
            collectionId,
            searchText: typeof options.search === 'string' ? options.search : undefined,
            page: parseOptionalNumber(options.page),
            pageSize: parseOptionalNumber(options.pageSize),
            offset: parseOptionalNumber(options.offset)
          }
        });
      }
    },

    {
      path: ['dataset', 'data', 'get'],
      summary: 'Get details and indexes of a single data chunk',
      risk: 'read',
      authModes: ['token', 'personalKey'],
      positionalArgs: [{ name: 'dataId', required: false, description: 'Data chunk ObjectId' }],
      options: [
        { name: 'id', flags: '--id <dataId>', takesValue: true, description: 'Data chunk ObjectId' }
      ],
      examples: [
        {
          description: 'Get data chunk detail',
          args: ['dataset', 'data', 'get', '68ad85a7463006c963799a07']
        }
      ],
      execute: async ({ positional, options, client, container }) => {
        const activeClient = requireActiveClient(client, 'dataset data get');
        const dataId = resolveIdArg({
          positional: positional[0],
          flagValue: options.id,
          label: 'Data ID',
          usage: 'fastgpt dataset data get <dataId>'
        });

        return container.datasetDataService.getDetail({
          client: activeClient,
          dataId
        });
      }
    },

    {
      path: ['dataset', 'data', 'quote'],
      summary: 'Get quote data with parent collection info for a chunk',
      risk: 'read',
      authModes: ['token', 'personalKey'],
      positionalArgs: [{ name: 'dataId', required: false, description: 'Data chunk ObjectId' }],
      options: [
        { name: 'id', flags: '--id <dataId>', takesValue: true, description: 'Data chunk ObjectId' }
      ],
      examples: [
        {
          description: 'Fetch quote data for chunk',
          args: ['dataset', 'data', 'quote', '68ad85a7463006c963799a07']
        }
      ],
      execute: async ({ positional, options, client, container }) => {
        const activeClient = requireActiveClient(client, 'dataset data quote');
        const dataId = resolveIdArg({
          positional: positional[0],
          flagValue: options.id,
          label: 'Data ID',
          usage: 'fastgpt dataset data quote <dataId>'
        });

        return container.datasetDataService.getQuoteData({
          client: activeClient,
          dataId
        });
      }
    },

    {
      path: ['dataset', 'data', 'insert'],
      summary: 'Insert a single data chunk (q/a) directly into a collection',
      risk: 'write',
      authModes: ['token', 'personalKey'],
      positionalArgs: [
        { name: 'collectionId', required: false, description: 'Collection ObjectId' }
      ],
      options: [
        {
          name: 'collectionId',
          flags: '--collection-id <id>',
          takesValue: true,
          description: 'Collection ObjectId'
        },
        {
          name: 'q',
          flags: '--q <text>',
          takesValue: true,
          description: 'Primary text / question'
        },
        {
          name: 'a',
          flags: '--a <text>',
          takesValue: true,
          description: 'Auxiliary text / answer'
        },
        {
          name: 'chunkIndex',
          flags: '--chunk-index <n>',
          takesValue: true,
          description: 'Chunk index'
        },
        {
          name: 'file',
          flags: '--file <path>',
          takesValue: true,
          description: 'Read insert JSON from file'
        },
        {
          name: 'stdin',
          flags: '--stdin',
          takesValue: false,
          description: 'Read insert JSON from stdin'
        },
        {
          name: 'dryRun',
          flags: '--dry-run',
          takesValue: false,
          description: 'Preview without inserting'
        }
      ],
      examples: [
        {
          description: 'Insert a Q/A pair into a collection',
          args: [
            'dataset',
            'data',
            'insert',
            '68ad85a7463006c963799a06',
            '--q',
            'What is FastGPT?',
            '--a',
            'An AI Agent builder platform.'
          ]
        }
      ],
      execute: async ({ positional, options, client, container }) => {
        const activeClient = requireActiveClient(client, 'dataset data insert');
        const collectionId = resolveIdArg({
          positional: positional[0],
          flagValue: options.collectionId,
          label: 'Collection ID',
          usage: 'fastgpt dataset data insert <collectionId> --q "question" --a "answer"'
        });

        const filePayload = await resolveJsonPayload<Record<string, unknown>>({
          filePath: typeof options.file === 'string' ? options.file : undefined,
          useStdin: options.stdin === true,
          readTextFile: container.fileIo.readTextFile,
          readStdin: container.readStdin,
          fieldLabel: 'data insert payload'
        });

        const q = (() => {
          if (typeof options.q === 'string') return options.q;
          if (typeof filePayload?.q === 'string') return filePayload.q;
          return undefined;
        })();
        if (!q || !q.trim()) {
          throw new CliArgumentError('Primary text (--q) must be a non-empty string.');
        }

        return container.datasetDataService.insert({
          client: activeClient,
          input: {
            ...(filePayload ?? {}),
            collectionId,
            q,
            ...(typeof options.a === 'string' ? { a: options.a } : {}),
            ...(options.chunkIndex !== undefined
              ? { chunkIndex: parseOptionalNumber(options.chunkIndex) }
              : {})
          } as any,
          dryRun: options.dryRun === true
        });
      }
    },

    {
      path: ['dataset', 'data', 'push'],
      summary: 'Push a batch of data chunks (up to 200) into the training queue',
      risk: 'write',
      authModes: ['token', 'personalKey'],
      positionalArgs: [
        { name: 'collectionId', required: false, description: 'Collection ObjectId' }
      ],
      options: [
        {
          name: 'collectionId',
          flags: '--collection-id <id>',
          takesValue: true,
          description: 'Collection ObjectId'
        },
        {
          name: 'file',
          flags: '--file <path>',
          takesValue: true,
          description: 'JSON file containing array of chunks or PushData body ("-" for stdin)'
        },
        {
          name: 'stdin',
          flags: '--stdin',
          takesValue: false,
          description: 'Read JSON payload from stdin'
        },
        {
          name: 'trainingType',
          flags: '--training-type <mode>',
          takesValue: true,
          description: 'Training mode'
        },
        {
          name: 'dryRun',
          flags: '--dry-run',
          takesValue: false,
          description: 'Preview without pushing'
        }
      ],
      examples: [
        {
          description: 'Batch push chunks from JSON file',
          args: ['dataset', 'data', 'push', '68ad85a7463006c963799a06', '--file', 'chunks.json']
        }
      ],
      execute: async ({ positional, options, client, container }) => {
        const activeClient = requireActiveClient(client, 'dataset data push');
        const collectionId = resolveIdArg({
          positional: positional[0],
          flagValue: options.collectionId,
          label: 'Collection ID',
          usage: 'fastgpt dataset data push <collectionId> --file chunks.json'
        });

        const parsed = await resolveJsonPayload<unknown>({
          filePath: typeof options.file === 'string' ? options.file : undefined,
          useStdin: options.stdin === true,
          readTextFile: container.fileIo.readTextFile,
          readStdin: container.readStdin,
          fieldLabel: 'data push payload'
        });
        if (!parsed) {
          throw new CliArgumentError('Payload is required via --file <path> or --stdin.');
        }

        const body = Array.isArray(parsed)
          ? { collectionId, data: parsed }
          : { ...(parsed as Record<string, unknown>), collectionId };

        return container.datasetDataService.push({
          client: activeClient,
          input: {
            ...body,
            ...(typeof options.trainingType === 'string'
              ? { trainingType: options.trainingType as any }
              : {})
          } as any,
          dryRun: options.dryRun === true
        });
      }
    },

    {
      path: ['dataset', 'data', 'update'],
      summary: 'Update a data chunk q/a text or indexes',
      risk: 'write',
      authModes: ['token', 'personalKey'],
      positionalArgs: [{ name: 'dataId', required: false, description: 'Data chunk ObjectId' }],
      options: [
        {
          name: 'id',
          flags: '--id <dataId>',
          takesValue: true,
          description: 'Data chunk ObjectId'
        },
        { name: 'q', flags: '--q <text>', takesValue: true, description: 'Updated primary text' },
        { name: 'a', flags: '--a <text>', takesValue: true, description: 'Updated auxiliary text' },
        {
          name: 'file',
          flags: '--file <path>',
          takesValue: true,
          description: 'Read update JSON from file'
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
          description: 'Update data chunk text',
          args: ['dataset', 'data', 'update', '68ad85a7463006c963799a07', '--q', 'Updated question']
        }
      ],
      execute: async ({ positional, options, client, container }) => {
        const activeClient = requireActiveClient(client, 'dataset data update');
        const dataId = resolveIdArg({
          positional: positional[0],
          flagValue: options.id,
          label: 'Data ID',
          usage: 'fastgpt dataset data update <dataId> --q "..."'
        });

        const filePayload = await resolveJsonPayload<Record<string, unknown>>({
          filePath: typeof options.file === 'string' ? options.file : undefined,
          readTextFile: container.fileIo.readTextFile,
          readStdin: container.readStdin,
          fieldLabel: 'data update payload'
        });

        const q = (() => {
          if (typeof options.q === 'string') return options.q;
          if (typeof filePayload?.q === 'string') return filePayload.q;
          return undefined;
        })();
        if (!q || !q.trim()) {
          throw new CliArgumentError(
            'Primary text (--q) is required for dataset data update.',
            undefined,
            'Usage: fastgpt dataset data update <dataId> --q "..."'
          );
        }

        return container.datasetDataService.update({
          client: activeClient,
          input: {
            ...(filePayload ?? {}),
            dataId,
            q,
            ...(typeof options.a === 'string' ? { a: options.a } : {})
          },
          dryRun: options.dryRun === true
        });
      }
    },

    {
      path: ['dataset', 'data', 'delete'],
      summary: 'Delete a data chunk permanently',
      risk: 'destructive',
      authModes: ['token', 'personalKey'],
      positionalArgs: [{ name: 'dataId', required: false, description: 'Data chunk ObjectId' }],
      options: [
        {
          name: 'id',
          flags: '--id <dataId>',
          takesValue: true,
          description: 'Data chunk ObjectId'
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
          description: 'Delete a data chunk non-interactively',
          args: ['dataset', 'data', 'delete', '68ad85a7463006c963799a07', '--yes']
        }
      ],
      execute: async (ctx) => {
        const activeClient = requireActiveClient(ctx.client, 'dataset data delete');
        const dataId = resolveIdArg({
          positional: ctx.positional[0],
          flagValue: ctx.options.id,
          label: 'Data ID',
          usage: 'fastgpt dataset data delete <dataId> --yes'
        });

        await confirmDestructiveAction({
          ctx,
          message: `Permanently delete data chunk "${dataId}"?`
        });

        return ctx.container.datasetDataService.delete({
          client: activeClient,
          dataId,
          dryRun: ctx.options.dryRun === true
        });
      }
    },

    {
      path: ['dataset', 'data', 'index-create'],
      summary: 'Create a custom vector index on an existing data chunk',
      risk: 'write',
      authModes: ['token', 'personalKey'],
      positionalArgs: [{ name: 'dataId', required: false, description: 'Data chunk ObjectId' }],
      options: [
        {
          name: 'id',
          flags: '--id <dataId>',
          takesValue: true,
          description: 'Data chunk ObjectId'
        },
        {
          name: 'type',
          flags: '--type <type>',
          takesValue: true,
          description: 'Index type (default custom)'
        },
        { name: 'text', flags: '--text <text>', takesValue: true, description: 'Index text' },
        {
          name: 'dryRun',
          flags: '--dry-run',
          takesValue: false,
          description: 'Preview without creating'
        }
      ],
      examples: [
        {
          description: 'Add a custom index to a data chunk',
          args: [
            'dataset',
            'data',
            'index-create',
            '68ad85a7463006c963799a07',
            '--text',
            'Alternative keyword phrase'
          ]
        }
      ],
      execute: async ({ positional, options, client, container }) => {
        const activeClient = requireActiveClient(client, 'dataset data index-create');
        const dataId = resolveIdArg({
          positional: positional[0],
          flagValue: options.id,
          label: 'Data ID',
          usage: 'fastgpt dataset data index-create <dataId> --text "..."'
        });
        const text = typeof options.text === 'string' ? options.text : '';
        if (!text.trim()) {
          throw new CliArgumentError('Index --text is required.');
        }

        const indexType =
          typeof options.type === 'string'
            ? z.enum(DatasetDataIndexTypeEnum).parse(options.type)
            : DatasetDataIndexTypeEnum.custom;

        return container.datasetDataService.createIndex({
          client: activeClient,
          input: {
            dataId,
            type: indexType,
            text
          },
          dryRun: options.dryRun === true
        });
      }
    },

    {
      path: ['dataset', 'data', 'index-update'],
      summary: 'Update an existing custom index on a data chunk',
      risk: 'write',
      authModes: ['token', 'personalKey'],
      positionalArgs: [{ name: 'dataId', required: false, description: 'Data chunk ObjectId' }],
      options: [
        {
          name: 'id',
          flags: '--id <dataId>',
          takesValue: true,
          description: 'Data chunk ObjectId'
        },
        {
          name: 'indexDataId',
          flags: '--index-id <id>',
          takesValue: true,
          description: 'VectorDB index dataId'
        },
        {
          name: 'type',
          flags: '--type <type>',
          takesValue: true,
          description: 'Index type (default custom)'
        },
        {
          name: 'text',
          flags: '--text <text>',
          takesValue: true,
          description: 'Updated index text'
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
          description: 'Update index on a data chunk',
          args: [
            'dataset',
            'data',
            'index-update',
            '68ad85a7463006c963799a07',
            '--index-id',
            'vec-1',
            '--text',
            'Updated index text'
          ]
        }
      ],
      execute: async ({ positional, options, client, container }) => {
        const activeClient = requireActiveClient(client, 'dataset data index-update');
        const dataId = resolveIdArg({
          positional: positional[0],
          flagValue: options.id,
          label: 'Data ID',
          usage: 'fastgpt dataset data index-update <dataId> --index-id <id> --text "..."'
        });
        const indexDataId =
          typeof options.indexDataId === 'string' ? options.indexDataId.trim() : '';
        const text = typeof options.text === 'string' ? options.text : '';
        if (!indexDataId || !text.trim()) {
          throw new CliArgumentError('--index-id and --text are required.');
        }

        const indexType =
          typeof options.type === 'string'
            ? z.enum(DatasetDataIndexTypeEnum).parse(options.type)
            : DatasetDataIndexTypeEnum.custom;

        return container.datasetDataService.updateIndex({
          client: activeClient,
          input: {
            dataId,
            indexDataId,
            type: indexType,
            text
          },
          dryRun: options.dryRun === true
        });
      }
    },

    {
      path: ['dataset', 'data', 'index-delete'],
      summary: 'Delete a single vector index from a data chunk',
      risk: 'destructive',
      authModes: ['token', 'personalKey'],
      positionalArgs: [{ name: 'dataId', required: false, description: 'Data chunk ObjectId' }],
      options: [
        {
          name: 'id',
          flags: '--id <dataId>',
          takesValue: true,
          description: 'Data chunk ObjectId'
        },
        {
          name: 'indexDataId',
          flags: '--index-id <id>',
          takesValue: true,
          description: 'VectorDB index dataId'
        },
        {
          name: 'dryRun',
          flags: '--dry-run',
          takesValue: false,
          description: 'Preview without deleting'
        },
        { name: 'yes', flags: '--yes', takesValue: false, description: 'Confirm index deletion' }
      ],
      examples: [
        {
          description: 'Delete a data index non-interactively',
          args: [
            'dataset',
            'data',
            'index-delete',
            '68ad85a7463006c963799a07',
            '--index-id',
            'vec-1',
            '--yes'
          ]
        }
      ],
      execute: async (ctx) => {
        const activeClient = requireActiveClient(ctx.client, 'dataset data index-delete');
        const dataId = resolveIdArg({
          positional: ctx.positional[0],
          flagValue: ctx.options.id,
          label: 'Data ID',
          usage: 'fastgpt dataset data index-delete <dataId> --index-id <id> --yes'
        });
        const indexDataId =
          typeof ctx.options.indexDataId === 'string' ? ctx.options.indexDataId.trim() : '';
        if (!indexDataId) {
          throw new CliArgumentError('--index-id is required.');
        }

        await confirmDestructiveAction({
          ctx,
          message: `Permanently delete index "${indexDataId}" from data chunk "${dataId}"?`
        });

        return ctx.container.datasetDataService.deleteIndex({
          client: activeClient,
          input: { dataId, indexDataId },
          dryRun: ctx.options.dryRun === true
        });
      }
    }
  ];
}
