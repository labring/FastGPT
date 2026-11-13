import { CliArgumentError } from '../../../shared/errors';
import type { CliCommandSpec } from '../../pipeline';
import {
  confirmDestructiveAction,
  parseOptionalNumber,
  requireActiveClient,
  resolveIdArg
} from './shared';

/**
 * 知识库训练队列监控、报错排查、重试及等待命令组（PRD-02.3）。
 */
export function createDatasetTrainCommandSpecs(): CliCommandSpec[] {
  return [
    {
      path: ['dataset', 'train', 'queue'],
      summary: 'Check whether a dataset currently has active training or rebuild tasks',
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
          description: 'Check training queue status',
          args: ['dataset', 'train', 'queue', '68ad85a7463006c963799a05']
        }
      ],
      execute: async ({ positional, options, client, container }) => {
        const activeClient = requireActiveClient(client, 'dataset train queue');
        const datasetId = resolveIdArg({
          positional: positional[0],
          flagValue: options.datasetId,
          label: 'Dataset ID',
          usage: 'fastgpt dataset train queue <datasetId>'
        });

        return container.datasetTrainingService.getQueue({
          client: activeClient,
          datasetId
        });
      }
    },

    {
      path: ['dataset', 'train', 'has-error'],
      summary: 'Check whether a dataset has any blocked/failed training errors',
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
          description: 'Check for training errors',
          args: ['dataset', 'train', 'has-error', '68ad85a7463006c963799a05']
        }
      ],
      execute: async ({ positional, options, client, container }) => {
        const activeClient = requireActiveClient(client, 'dataset train has-error');
        const datasetId = resolveIdArg({
          positional: positional[0],
          flagValue: options.datasetId,
          label: 'Dataset ID',
          usage: 'fastgpt dataset train has-error <datasetId>'
        });

        return container.datasetTrainingService.hasError({
          client: activeClient,
          datasetId
        });
      }
    },

    {
      path: ['dataset', 'train', 'errors'],
      summary: 'List failed training records grouped by collection in a dataset',
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
          name: 'collectionId',
          flags: '--collection-id <id>',
          takesValue: true,
          description: 'Filter by collection ID'
        },
        { name: 'page', flags: '--page <n>', takesValue: true, description: 'Page number' },
        {
          name: 'pageSize',
          flags: '--page-size <n>',
          takesValue: true,
          description: 'Items per page'
        }
      ],
      examples: [
        {
          description: 'List training errors for a dataset',
          args: ['dataset', 'train', 'errors', '68ad85a7463006c963799a05']
        }
      ],
      execute: async ({ positional, options, client, container }) => {
        const activeClient = requireActiveClient(client, 'dataset train errors');
        const datasetId = resolveIdArg({
          positional: positional[0],
          flagValue: options.datasetId,
          label: 'Dataset ID',
          usage: 'fastgpt dataset train errors <datasetId>'
        });

        return container.datasetTrainingService.getDatasetErrors({
          client: activeClient,
          input: {
            datasetId,
            ...(typeof options.collectionId === 'string'
              ? { collectionId: options.collectionId }
              : {}),
            page: parseOptionalNumber(options.page),
            pageSize: parseOptionalNumber(options.pageSize)
          }
        });
      }
    },

    {
      path: ['dataset', 'train', 'collection-errors'],
      summary: 'List failed training items for a specific collection',
      risk: 'read',
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
        { name: 'page', flags: '--page <n>', takesValue: true, description: 'Page number' },
        {
          name: 'pageSize',
          flags: '--page-size <n>',
          takesValue: true,
          description: 'Items per page'
        }
      ],
      examples: [
        {
          description: 'List training errors for a collection',
          args: ['dataset', 'train', 'collection-errors', '68ad85a7463006c963799a06']
        }
      ],
      execute: async ({ positional, options, client, container }) => {
        const activeClient = requireActiveClient(client, 'dataset train collection-errors');
        const collectionId = resolveIdArg({
          positional: positional[0],
          flagValue: options.collectionId,
          label: 'Collection ID',
          usage: 'fastgpt dataset train collection-errors <collectionId>'
        });

        return container.datasetTrainingService.getCollectionErrors({
          client: activeClient,
          input: {
            collectionId,
            page: parseOptionalNumber(options.page),
            pageSize: parseOptionalNumber(options.pageSize)
          }
        });
      }
    },

    {
      path: ['dataset', 'train', 'detail'],
      summary: 'Get details of a single training queue item',
      risk: 'read',
      authModes: ['token', 'personalKey'],
      options: [
        {
          name: 'collectionId',
          flags: '--collection-id <id>',
          takesValue: true,
          description: 'Collection ObjectId'
        },
        {
          name: 'dataId',
          flags: '--data-id <id>',
          takesValue: true,
          description: 'Training data ObjectId'
        }
      ],
      examples: [
        {
          description: 'Inspect a training item',
          args: [
            'dataset',
            'train',
            'detail',
            '--collection-id',
            '68ad85a7463006c963799a06',
            '--data-id',
            '68ad85a7463006c963799a07'
          ]
        }
      ],
      execute: async ({ options, client, container }) => {
        const activeClient = requireActiveClient(client, 'dataset train detail');
        const collectionId =
          typeof options.collectionId === 'string' ? options.collectionId.trim() : '';
        const dataId = typeof options.dataId === 'string' ? options.dataId.trim() : '';
        if (!collectionId || !dataId) {
          throw new CliArgumentError('--collection-id and --data-id are required.');
        }

        return container.datasetTrainingService.getDetail({
          client: activeClient,
          input: { collectionId, dataId }
        });
      }
    },

    {
      path: ['dataset', 'train', 'retry'],
      summary: 'Retry failed training tasks (by dataset, collection, or specific data item)',
      risk: 'write',
      authModes: ['token', 'personalKey'],
      options: [
        {
          name: 'datasetId',
          flags: '--dataset-id <id>',
          takesValue: true,
          description: 'Retry all errors in dataset'
        },
        {
          name: 'collectionId',
          flags: '--collection-id <id>',
          takesValue: true,
          description: 'Retry all errors in collection'
        },
        {
          name: 'dataId',
          flags: '--data-id <id>',
          takesValue: true,
          description: 'Retry or edit specific training item'
        },
        {
          name: 'q',
          flags: '--q <text>',
          takesValue: true,
          description: 'Optional updated primary text'
        },
        {
          name: 'a',
          flags: '--a <text>',
          takesValue: true,
          description: 'Optional updated answer text'
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
          description: 'Retry all failed training items in a dataset',
          args: ['dataset', 'train', 'retry', '--dataset-id', '68ad85a7463006c963799a05']
        }
      ],
      execute: async ({ options, client, container }) => {
        const activeClient = requireActiveClient(client, 'dataset train retry');

        return container.datasetTrainingService.retryOrUpdate({
          client: activeClient,
          input: {
            ...(typeof options.datasetId === 'string'
              ? { datasetId: options.datasetId.trim() }
              : {}),
            ...(typeof options.collectionId === 'string'
              ? { collectionId: options.collectionId.trim() }
              : {}),
            ...(typeof options.dataId === 'string' ? { dataId: options.dataId.trim() } : {}),
            ...(typeof options.q === 'string' ? { q: options.q } : {}),
            ...(typeof options.a === 'string' ? { a: options.a } : {})
          },
          dryRun: options.dryRun === true
        });
      }
    },

    {
      path: ['dataset', 'train', 'delete'],
      summary: 'Cancel/delete a pending or failed training data item',
      risk: 'destructive',
      authModes: ['token', 'personalKey'],
      options: [
        {
          name: 'collectionId',
          flags: '--collection-id <id>',
          takesValue: true,
          description: 'Collection ObjectId'
        },
        {
          name: 'dataId',
          flags: '--data-id <id>',
          takesValue: true,
          description: 'Training data ObjectId'
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
          description: 'Delete a training task non-interactively',
          args: [
            'dataset',
            'train',
            'delete',
            '--collection-id',
            '68ad85a7463006c963799a06',
            '--data-id',
            '68ad85a7463006c963799a07',
            '--yes'
          ]
        }
      ],
      execute: async (ctx) => {
        const activeClient = requireActiveClient(ctx.client, 'dataset train delete');
        const collectionId =
          typeof ctx.options.collectionId === 'string' ? ctx.options.collectionId.trim() : '';
        const dataId = typeof ctx.options.dataId === 'string' ? ctx.options.dataId.trim() : '';
        if (!collectionId || !dataId) {
          throw new CliArgumentError('--collection-id and --data-id are required.');
        }

        await confirmDestructiveAction({
          ctx,
          message: `Delete training item "${dataId}" from collection "${collectionId}"?`
        });

        return ctx.container.datasetTrainingService.deleteTrainingData({
          client: activeClient,
          input: { collectionId, dataId },
          dryRun: ctx.options.dryRun === true
        });
      }
    },

    {
      path: ['dataset', 'train', 'rebuild'],
      summary: 'Switch vector model and rebuild embeddings for all data in a dataset',
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
          name: 'vectorModel',
          flags: '--vector-model <modelId>',
          takesValue: true,
          description: 'New vector model ID'
        },
        {
          name: 'dryRun',
          flags: '--dry-run',
          takesValue: false,
          description: 'Preview without rebuilding'
        }
      ],
      examples: [
        {
          description: 'Rebuild dataset embeddings with a new vector model',
          args: [
            'dataset',
            'train',
            'rebuild',
            '68ad85a7463006c963799a05',
            '--vector-model',
            'text-embedding-3-large'
          ]
        }
      ],
      execute: async ({ positional, options, client, container }) => {
        const activeClient = requireActiveClient(client, 'dataset train rebuild');
        const datasetId = resolveIdArg({
          positional: positional[0],
          flagValue: options.datasetId,
          label: 'Dataset ID',
          usage: 'fastgpt dataset train rebuild <datasetId> --vector-model <modelId>'
        });
        const vectorModelId =
          typeof options.vectorModel === 'string' ? options.vectorModel.trim() : '';
        if (!vectorModelId) {
          throw new CliArgumentError('--vector-model is required.');
        }

        return container.datasetTrainingService.rebuildEmbedding({
          client: activeClient,
          input: { datasetId, vectorModelId },
          dryRun: options.dryRun === true
        });
      }
    },

    {
      path: ['dataset', 'train', 'wait'],
      summary: 'Wait and poll until dataset training queue drains (writes progress to stderr)',
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
          name: 'interval',
          flags: '--interval <ms>',
          takesValue: true,
          description: 'Polling interval in ms (default 2000)'
        },
        {
          name: 'timeout',
          flags: '--timeout <ms>',
          takesValue: true,
          description: 'Max wait time in ms (default 300000)'
        },
        {
          name: 'failOnError',
          flags: '--no-fail-on-error',
          takesValue: false,
          description: 'Exit 0 even if errors occurred'
        }
      ],
      examples: [
        {
          description: 'Wait for dataset training queue to finish',
          args: ['dataset', 'train', 'wait', '68ad85a7463006c963799a05', '--interval', '3000']
        }
      ],
      execute: async ({ positional, options, client, container, logger }) => {
        const activeClient = requireActiveClient(client, 'dataset train wait');
        const datasetId = resolveIdArg({
          positional: positional[0],
          flagValue: options.datasetId,
          label: 'Dataset ID',
          usage: 'fastgpt dataset train wait <datasetId>'
        });

        return container.datasetTrainingService.wait({
          client: activeClient,
          datasetId,
          intervalMs: parseOptionalNumber(options.interval) ?? 2000,
          timeoutMs: parseOptionalNumber(options.timeout) ?? 300_000,
          failOnError: options.failOnError !== false,
          onProgress: (msg) => logger.info(msg)
        });
      }
    }
  ];
}
