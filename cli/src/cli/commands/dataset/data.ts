import { CliArgumentError } from '../../../shared/errors';
import { isPlainObject, resolveJsonObjectPayload, resolveJsonPayload } from '../../../shared/input';
import type { CliCommandSpec } from '../../pipeline';
import {
  confirmDestructiveAction,
  parseOptionalNumber,
  requireActiveClient,
  resolveIdArg
} from './shared';

/**
 * 知识库分块数据命令组（System OpenAPI）：list / get / push / update / delete。
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

        const parsed = await resolveJsonPayload({
          filePath: typeof options.file === 'string' ? options.file : undefined,
          useStdin: options.stdin === true,
          readTextFile: container.fileIo.readTextFile,
          readStdin: container.readStdin,
          fieldLabel: 'data push payload'
        });
        if (!parsed) {
          throw new CliArgumentError('Payload is required via --file <path> or --stdin.');
        }

        const body = (() => {
          if (Array.isArray(parsed)) {
            return { collectionId, data: parsed };
          }
          if (isPlainObject(parsed)) {
            return { ...parsed, collectionId };
          }
          throw new CliArgumentError('Data push payload must be a JSON array or object.');
        })();

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

        const filePayload = await resolveJsonObjectPayload({
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
    }
  ];
}
