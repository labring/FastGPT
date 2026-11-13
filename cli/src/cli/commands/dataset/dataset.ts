import { DatasetSearchModeEnum } from '@fastgpt/global/core/dataset/constants';
import { CliArgumentError } from '../../../shared/errors';
import {
  parseIdListOption,
  parseParentIdOption,
  resolveJsonObjectPayload
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
 * 知识库主资源命令组（PRD-02.1）：CRUD、召回测试、全量导出、同步、路径与权限治理。
 */
export function createDatasetRootCommandSpecs(): CliCommandSpec[] {
  return [
    {
      path: ['dataset', 'list'],
      summary: 'List accessible knowledge base datasets with pagination and search',
      risk: 'read',
      authModes: ['token', 'personalKey'],
      options: [
        {
          name: 'search',
          flags: '--search <keyword>',
          takesValue: true,
          description: 'Search datasets by name or intro keyword'
        },
        {
          name: 'parentId',
          flags: '--parent-id <id>',
          takesValue: true,
          description: 'Filter datasets inside a specific folder ID (null for root)'
        },
        {
          name: 'type',
          flags: '--type <type>',
          takesValue: true,
          description: 'Filter by type: dataset, folder, websiteDataset, apiDataset, etc.'
        },
        {
          name: 'datasetIds',
          flags: '--dataset-ids <ids>',
          takesValue: true,
          description: 'Comma-separated dataset ObjectIds to query exactly'
        },
        {
          name: 'withAppCount',
          flags: '--with-app-count',
          takesValue: false,
          description: 'Include app reference count'
        },
        {
          name: 'withFileCount',
          flags: '--with-file-count',
          takesValue: false,
          description: 'Include dataset file count'
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
          description: 'Items per page (default 20, max 500)'
        },
        {
          name: 'offset',
          flags: '--offset <n>',
          takesValue: true,
          description: 'Offset pagination start (takes precedence over --page)'
        }
      ],
      examples: [
        { description: 'List root datasets', args: ['dataset', 'list'] },
        {
          description: 'Search datasets matching "product"',
          args: ['dataset', 'list', '--search', 'product']
        },
        {
          description: 'List datasets by exact IDs as JSON',
          args: ['dataset', 'list', '--dataset-ids', '68ad85a7463006c963799a05', '--format', 'json']
        }
      ],
      execute: async ({ options, client, container }) => {
        const activeClient = requireActiveClient(client, 'dataset list');

        return container.datasetService.list({
          client: activeClient,
          input: {
            searchKey: typeof options.search === 'string' ? options.search : undefined,
            parentId: parseParentIdOption(options.parentId),
            type: typeof options.type === 'string' ? options.type : undefined,
            datasetIds: parseIdListOption(options.datasetIds),
            withAppCount: options.withAppCount === true ? true : undefined,
            withFileCount: options.withFileCount === true ? true : undefined,
            page: parseOptionalNumber(options.page),
            pageSize: parseOptionalNumber(options.pageSize),
            offset: parseOptionalNumber(options.offset)
          }
        });
      }
    },

    {
      path: ['dataset', 'get'],
      summary: 'Get details, model configuration, and collection counts of a dataset',
      risk: 'read',
      authModes: ['token', 'personalKey'],
      positionalArgs: [
        {
          name: 'datasetId',
          required: false,
          description: 'Target dataset ObjectId (or use --id)'
        }
      ],
      options: [
        {
          name: 'id',
          flags: '--id <datasetId>',
          takesValue: true,
          description: 'Dataset ObjectId (alternative to positional argument)'
        }
      ],
      examples: [
        {
          description: 'Inspect dataset configuration',
          args: ['dataset', 'get', '68ad85a7463006c963799a05']
        }
      ],
      execute: async ({ positional, options, client, container }) => {
        const activeClient = requireActiveClient(client, 'dataset get');
        const datasetId = resolveIdArg({
          positional: positional[0],
          flagValue: options.id,
          label: 'Dataset ID',
          usage: 'fastgpt dataset get <datasetId> or fastgpt dataset get --id <datasetId>'
        });

        return container.datasetService.getDetail({
          client: activeClient,
          datasetId
        });
      }
    },

    {
      path: ['dataset', 'create'],
      summary: 'Create a new knowledge base dataset or folder',
      risk: 'write',
      authModes: ['token', 'personalKey'],
      options: [
        {
          name: 'name',
          flags: '--name <name>',
          takesValue: true,
          description: 'Dataset display name'
        },
        {
          name: 'intro',
          flags: '--intro <text>',
          takesValue: true,
          description: 'Dataset description or introduction'
        },
        {
          name: 'type',
          flags: '--type <type>',
          takesValue: true,
          description: 'Type: dataset (default), folder, websiteDataset, apiDataset, etc.'
        },
        {
          name: 'vectorModel',
          flags: '--vector-model <modelId>',
          takesValue: true,
          description: 'Vector embedding model ID (defaults to team default)'
        },
        {
          name: 'agentModel',
          flags: '--agent-model <modelId>',
          takesValue: true,
          description: 'Agent / QA model ID for dataset processing'
        },
        {
          name: 'vlmModel',
          flags: '--vlm-model <modelId>',
          takesValue: true,
          description: 'Vision-language model ID'
        },
        {
          name: 'parentId',
          flags: '--parent-id <id>',
          takesValue: true,
          description: 'Parent folder ID (null for root)'
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
          description: 'Create a standard dataset',
          args: ['dataset', 'create', '--name', 'Product Docs', '--intro', 'Technical specs']
        },
        {
          description: 'Preview creation from JSON config file',
          args: ['dataset', 'create', '--file', 'dataset-spec.json', '--dry-run']
        }
      ],
      execute: async ({ options, client, container }) => {
        const activeClient = requireActiveClient(client, 'dataset create');

        const filePayload = await resolveJsonObjectPayload({
          filePath: typeof options.file === 'string' ? options.file : undefined,
          useStdin: options.stdin === true,
          readTextFile: container.fileIo.readTextFile,
          readStdin: container.readStdin,
          fieldLabel: 'dataset create payload'
        });

        const name = await (async () => {
          const flagName = typeof options.name === 'string' ? options.name.trim() : '';
          const payloadName = typeof filePayload?.name === 'string' ? filePayload.name.trim() : '';
          const direct = flagName || payloadName;
          if (direct) return direct;
          if (container.prompter.isInteractive && options.format !== 'json') {
            return (await container.prompter.text({ message: 'Enter dataset name:' })).trim();
          }
          return '';
        })();

        if (!name) {
          throw new CliArgumentError(
            'Dataset name is required.',
            undefined,
            'Usage: fastgpt dataset create --name "My Dataset"'
          );
        }

        const mergedInput = {
          ...(filePayload ?? {}),
          name,
          ...(typeof options.intro === 'string' ? { intro: options.intro } : {}),
          ...(typeof options.type === 'string' ? { type: options.type } : {}),
          ...(typeof options.vectorModel === 'string'
            ? { vectorModelId: options.vectorModel }
            : {}),
          ...(typeof options.agentModel === 'string' ? { agentModelId: options.agentModel } : {}),
          ...(typeof options.vlmModel === 'string' ? { vlmModelId: options.vlmModel } : {}),
          ...(options.parentId !== undefined
            ? { parentId: parseParentIdOption(options.parentId) }
            : {})
        };

        return container.datasetService.create({
          client: activeClient,
          input: mergedInput,
          dryRun: options.dryRun === true
        });
      }
    },

    {
      path: ['dataset', 'update'],
      summary: 'Update dataset properties, metadata, chunk settings, or models',
      risk: 'write',
      authModes: ['token', 'personalKey'],
      positionalArgs: [
        {
          name: 'datasetId',
          required: false,
          description: 'Target dataset ObjectId (or use --id)'
        }
      ],
      options: [
        {
          name: 'id',
          flags: '--id <datasetId>',
          takesValue: true,
          description: 'Dataset ObjectId (alternative to positional argument)'
        },
        {
          name: 'name',
          flags: '--name <name>',
          takesValue: true,
          description: 'New dataset name'
        },
        {
          name: 'intro',
          flags: '--intro <text>',
          takesValue: true,
          description: 'New dataset intro'
        },
        {
          name: 'agentModel',
          flags: '--agent-model <modelId>',
          takesValue: true,
          description: 'New agent model ID'
        },
        {
          name: 'vlmModel',
          flags: '--vlm-model <modelId>',
          takesValue: true,
          description: 'New VLM model ID (empty string to clear)'
        },
        {
          name: 'autoSync',
          flags: '--auto-sync',
          takesValue: false,
          description: 'Enable automatic dataset sync'
        },
        {
          name: 'noAutoSync',
          flags: '--no-auto-sync',
          takesValue: false,
          description: 'Disable automatic dataset sync'
        },
        {
          name: 'parentId',
          flags: '--parent-id <id>',
          takesValue: true,
          description: 'New parent folder ID (null to move to root)'
        },
        {
          name: 'file',
          flags: '--file <path>',
          takesValue: true,
          description: 'Read update JSON payload (e.g. chunkSettings) from file ("-" for stdin)'
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
          description: 'Preview changes without applying'
        }
      ],
      examples: [
        {
          description: 'Update dataset name and intro',
          args: ['dataset', 'update', '68ad85a7463006c963799a05', '--name', 'New Name']
        },
        {
          description: 'Move dataset to root folder and preview',
          args: [
            'dataset',
            'update',
            '--id',
            '68ad85a7463006c963799a05',
            '--parent-id',
            'null',
            '--dry-run'
          ]
        }
      ],
      execute: async ({ positional, options, client, container }) => {
        const activeClient = requireActiveClient(client, 'dataset update');
        const datasetId = resolveIdArg({
          positional: positional[0],
          flagValue: options.id,
          label: 'Dataset ID',
          usage: 'fastgpt dataset update <datasetId> --name "New Name"'
        });

        const filePayload = await resolveJsonObjectPayload({
          filePath: typeof options.file === 'string' ? options.file : undefined,
          useStdin: options.stdin === true,
          readTextFile: container.fileIo.readTextFile,
          readStdin: container.readStdin,
          fieldLabel: 'dataset update payload'
        });

        const autoSync = parseOptionalBooleanFlag({
          positive: options.autoSync,
          negative: options.noAutoSync
        });

        return container.datasetService.update({
          client: activeClient,
          datasetId,
          input: {
            ...(filePayload ?? {}),
            ...(typeof options.name === 'string' ? { name: options.name } : {}),
            ...(typeof options.intro === 'string' ? { intro: options.intro } : {}),
            ...(typeof options.agentModel === 'string' ? { agentModelId: options.agentModel } : {}),
            ...(typeof options.vlmModel === 'string' ? { vlmModelId: options.vlmModel } : {}),
            ...(autoSync !== undefined ? { autoSync } : {}),
            ...(options.parentId !== undefined
              ? { parentId: parseParentIdOption(options.parentId) }
              : {})
          },
          dryRun: options.dryRun === true
        });
      }
    },

    {
      path: ['dataset', 'delete'],
      summary: 'Delete a knowledge base dataset and all its collections and chunks',
      risk: 'destructive',
      authModes: ['token', 'personalKey'],
      positionalArgs: [
        {
          name: 'datasetId',
          required: false,
          description: 'Target dataset ObjectId (or use --id)'
        }
      ],
      options: [
        {
          name: 'id',
          flags: '--id <datasetId>',
          takesValue: true,
          description: 'Dataset ObjectId (alternative to positional argument)'
        },
        {
          name: 'dryRun',
          flags: '--dry-run',
          takesValue: false,
          description: 'Preview deletion payload without deleting'
        },
        {
          name: 'yes',
          flags: '--yes',
          takesValue: false,
          description: 'Confirm deletion without prompting (mandatory in non-interactive/JSON mode)'
        }
      ],
      examples: [
        {
          description: 'Preview dataset deletion without deleting',
          args: ['dataset', 'delete', '68ad85a7463006c963799a05', '--dry-run']
        },
        {
          description: 'Non-interactive deletion for CI / Agent',
          args: ['dataset', 'delete', '68ad85a7463006c963799a05', '--yes']
        }
      ],
      execute: async (ctx) => {
        const activeClient = requireActiveClient(ctx.client, 'dataset delete');
        const datasetId = resolveIdArg({
          positional: ctx.positional[0],
          flagValue: ctx.options.id,
          label: 'Dataset ID',
          usage: 'fastgpt dataset delete <datasetId> or fastgpt dataset delete --id <datasetId>'
        });

        await confirmDestructiveAction({
          ctx,
          message: `Are you sure you want to permanently delete dataset "${datasetId}"?`
        });

        return ctx.container.datasetService.delete({
          client: activeClient,
          datasetId,
          dryRun: ctx.options.dryRun === true
        });
      }
    },

    {
      path: ['dataset', 'search'],
      summary: 'Test knowledge recall, chunk scoring, extension query, and reranking',
      risk: 'read',
      authModes: ['token', 'personalKey'],
      positionalArgs: [
        {
          name: 'datasetId',
          required: false,
          description: 'Target dataset ObjectId (or use --id)'
        },
        { name: 'text', required: false, description: 'Search query text (or use --text)' }
      ],
      options: [
        {
          name: 'id',
          flags: '--id <datasetId>',
          takesValue: true,
          description: 'Dataset ObjectId (alternative to positional argument)'
        },
        {
          name: 'text',
          flags: '--text <query>',
          takesValue: true,
          description: 'Search query text'
        },
        {
          name: 'limit',
          flags: '--limit <tokens>',
          takesValue: true,
          description: 'Maximum token budget for recalled chunks (default 5000, max 20000)'
        },
        {
          name: 'similarity',
          flags: '--similarity <score>',
          takesValue: true,
          description: 'Minimum similarity score threshold (0.0 to 1.0, default 0)'
        },
        {
          name: 'mode',
          flags: '--mode <mode>',
          takesValue: true,
          description:
            'Recall mode: embedding, fullTextRecall, or mixedRecall (default mixedRecall)'
        },
        {
          name: 'embeddingWeight',
          flags: '--embedding-weight <weight>',
          takesValue: true,
          description: 'Embedding fusion weight in mixedRecall (0.0 to 1.0)'
        },
        {
          name: 'rerank',
          flags: '--rerank',
          takesValue: false,
          description: 'Enable rerank model scoring'
        },
        {
          name: 'noRerank',
          flags: '--no-rerank',
          takesValue: false,
          description: 'Disable rerank model scoring'
        },
        {
          name: 'rerankModel',
          flags: '--rerank-model <modelId>',
          takesValue: true,
          description: 'Rerank model ID'
        },
        {
          name: 'rerankWeight',
          flags: '--rerank-weight <weight>',
          takesValue: true,
          description: 'Rerank fusion weight (0.0 to 1.0)'
        },
        {
          name: 'rerankCandidateNum',
          flags: '--rerank-candidate-num <n>',
          takesValue: true,
          description: 'Max candidate chunks sent to reranker (10 to 100)'
        },
        {
          name: 'extensionQuery',
          flags: '--extension-query',
          takesValue: false,
          description: 'Enable query extension before retrieval'
        },
        {
          name: 'extensionModel',
          flags: '--extension-model <modelId>',
          takesValue: true,
          description: 'Model ID used for query extension'
        },
        {
          name: 'extensionBg',
          flags: '--extension-bg <text>',
          takesValue: true,
          description: 'Background context for query extension'
        }
      ],
      examples: [
        {
          description: 'Test recall with query text',
          args: ['dataset', 'search', '68ad85a7463006c963799a05', 'What is FastGPT?']
        },
        {
          description: 'Hybrid search with custom weights and rerank',
          args: [
            'dataset',
            'search',
            '--id',
            '68ad85a7463006c963799a05',
            '--text',
            'API authentication',
            '--embedding-weight',
            '0.6',
            '--rerank',
            '--format',
            'json'
          ]
        }
      ],
      execute: async ({ positional, options, client, container }) => {
        const activeClient = requireActiveClient(client, 'dataset search');
        const datasetId = resolveIdArg({
          positional: positional[0],
          flagValue: options.id,
          label: 'Dataset ID',
          usage:
            'fastgpt dataset search <datasetId> <query> or fastgpt dataset search --id <datasetId> --text <query>'
        });

        const searchText = await (async () => {
          const direct = positional[1] ?? (typeof options.text === 'string' ? options.text : '');
          if (direct.trim()) return direct.trim();
          if (container.prompter.isInteractive && options.format !== 'json') {
            return (await container.prompter.text({ message: 'Enter search query:' })).trim();
          }
          return '';
        })();

        if (!searchText) {
          throw new CliArgumentError(
            'Search query text is required.',
            undefined,
            'Usage: fastgpt dataset search <datasetId> "search text"'
          );
        }

        const searchMode =
          options.mode === undefined ? DatasetSearchModeEnum.mixedRecall : (options.mode as any);
        const usingReRank = parseOptionalBooleanFlag({
          positive: options.rerank,
          negative: options.noRerank
        });

        return container.datasetService.search({
          client: activeClient,
          input: {
            datasetId,
            text: searchText,
            limit: parseOptionalNumber(options.limit),
            similarity: parseOptionalNumber(options.similarity),
            searchMode,
            embeddingWeight: parseOptionalNumber(options.embeddingWeight),
            usingReRank,
            rerankModelId:
              typeof options.rerankModel === 'string' ? options.rerankModel : undefined,
            rerankWeight: parseOptionalNumber(options.rerankWeight),
            rerankCandidateNum: parseOptionalNumber(options.rerankCandidateNum),
            datasetSearchUsingExtensionQuery: options.extensionQuery === true ? true : undefined,
            datasetSearchExtensionModelId:
              typeof options.extensionModel === 'string' ? options.extensionModel : undefined,
            datasetSearchExtensionBg:
              typeof options.extensionBg === 'string' ? options.extensionBg : undefined
          }
        });
      }
    },

    {
      path: ['dataset', 'export'],
      summary: 'Export all chunks of a dataset as CSV (streamed to file or output)',
      risk: 'read',
      authModes: ['token'],
      positionalArgs: [
        { name: 'datasetId', required: false, description: 'Target dataset ObjectId (or --id)' }
      ],
      options: [
        {
          name: 'id',
          flags: '--id <datasetId>',
          takesValue: true,
          description: 'Dataset ObjectId'
        },
        {
          name: 'output',
          flags: '--output <path>',
          takesValue: true,
          description: 'Write exported CSV to file path'
        }
      ],
      examples: [
        {
          description: 'Export dataset CSV to local file',
          args: ['dataset', 'export', '68ad85a7463006c963799a05', '--output', 'backup.csv']
        }
      ],
      execute: async ({ positional, options, client, container }) => {
        const activeClient = requireActiveClient(client, 'dataset export');
        const datasetId = resolveIdArg({
          positional: positional[0],
          flagValue: options.id,
          label: 'Dataset ID',
          usage: 'fastgpt dataset export <datasetId> --output <file.csv>'
        });

        const outputPath = typeof options.output === 'string' ? options.output : undefined;
        return container.datasetService.exportAll({
          client: activeClient,
          datasetId,
          writeOutput: outputPath
            ? (bytes) => container.fileIo.writeOutputFile(outputPath, bytes)
            : undefined,
          writeStreamOutput:
            outputPath && container.fileIo.writeStreamFile
              ? (stream) => container.fileIo.writeStreamFile!(outputPath, stream)
              : undefined
        });
      }
    },

    {
      path: ['dataset', 'sync'],
      summary: 'Trigger full sync for an external/API/website dataset (Pro edition)',
      risk: 'write',
      authModes: ['token'],
      positionalArgs: [
        { name: 'datasetId', required: false, description: 'Target dataset ObjectId (or --id)' }
      ],
      options: [
        {
          name: 'id',
          flags: '--id <datasetId>',
          takesValue: true,
          description: 'Dataset ObjectId'
        },
        {
          name: 'dryRun',
          flags: '--dry-run',
          takesValue: false,
          description: 'Preview sync request without triggering'
        }
      ],
      examples: [
        {
          description: 'Trigger dataset sync',
          args: ['dataset', 'sync', '68ad85a7463006c963799a05']
        }
      ],
      execute: async ({ positional, options, client, container }) => {
        const activeClient = requireActiveClient(client, 'dataset sync');
        const datasetId = resolveIdArg({
          positional: positional[0],
          flagValue: options.id,
          label: 'Dataset ID',
          usage: 'fastgpt dataset sync <datasetId>'
        });

        return container.datasetService.sync({
          client: activeClient,
          datasetId,
          dryRun: options.dryRun === true
        });
      }
    },

    {
      path: ['dataset', 'paths'],
      summary: 'Get breadcrumb path chain of a dataset or folder',
      risk: 'read',
      authModes: ['token'],
      positionalArgs: [
        { name: 'datasetId', required: false, description: 'Dataset or folder ObjectId' }
      ],
      options: [
        {
          name: 'id',
          flags: '--id <datasetId>',
          takesValue: true,
          description: 'Dataset ObjectId'
        },
        {
          name: 'type',
          flags: '--type <type>',
          takesValue: true,
          description: 'Path type: current (default) or parent'
        }
      ],
      examples: [
        {
          description: 'Get dataset breadcrumb paths',
          args: ['dataset', 'paths', '68ad85a7463006c963799a05']
        }
      ],
      execute: async ({ positional, options, client, container }) => {
        const activeClient = requireActiveClient(client, 'dataset paths');
        const sourceId = positional[0] ?? (typeof options.id === 'string' ? options.id : undefined);
        const rawType = options.type;
        if (rawType !== undefined && rawType !== 'current' && rawType !== 'parent') {
          throw new CliArgumentError('--type must be "current" or "parent".');
        }
        const type = rawType === 'parent' ? 'parent' : 'current';

        return container.datasetService.paths({
          client: activeClient,
          sourceId,
          type
        });
      }
    },

    {
      path: ['dataset', 'permission'],
      summary: 'Check current user read/write permissions on a dataset',
      risk: 'read',
      authModes: ['token', 'personalKey'],
      positionalArgs: [{ name: 'datasetId', required: false, description: 'Dataset ObjectId' }],
      options: [
        {
          name: 'id',
          flags: '--id <datasetId>',
          takesValue: true,
          description: 'Dataset ObjectId'
        }
      ],
      examples: [
        {
          description: 'Check dataset permissions',
          args: ['dataset', 'permission', '68ad85a7463006c963799a05']
        }
      ],
      execute: async ({ positional, options, client, container }) => {
        const activeClient = requireActiveClient(client, 'dataset permission');
        const datasetId = resolveIdArg({
          positional: positional[0],
          flagValue: options.id,
          label: 'Dataset ID',
          usage: 'fastgpt dataset permission <datasetId>'
        });

        return container.datasetService.getPermission({
          client: activeClient,
          datasetId
        });
      }
    },

    {
      path: ['dataset', 'batch-move'],
      summary: 'Batch move multiple datasets or folders to a target parent folder (or root)',
      risk: 'write',
      authModes: ['token', 'personalKey'],
      options: [
        {
          name: 'ids',
          flags: '--ids <ids>',
          takesValue: true,
          description: 'Comma-separated dataset ObjectIds'
        },
        {
          name: 'parentId',
          flags: '--parent-id <id>',
          takesValue: true,
          description: 'Target folder ObjectId (or "null" for root)'
        },
        {
          name: 'dryRun',
          flags: '--dry-run',
          takesValue: false,
          description: 'Preview batch move without executing'
        }
      ],
      examples: [
        {
          description: 'Move two datasets to root folder',
          args: [
            'dataset',
            'batch-move',
            '--ids',
            '68ad85a7463006c963799a05,68ad85a7463006c963799a06',
            '--parent-id',
            'null'
          ]
        }
      ],
      execute: async ({ options, client, container }) => {
        const activeClient = requireActiveClient(client, 'dataset batch-move');
        const ids = parseIdListOption(options.ids);
        if (!ids || ids.length === 0) {
          throw new CliArgumentError(
            'Dataset IDs (--ids) are required.',
            undefined,
            'Usage: fastgpt dataset batch-move --ids <id1>,<id2> --parent-id <folderId|null>'
          );
        }
        if (options.parentId === undefined) {
          throw new CliArgumentError(
            'Target parent folder ID (--parent-id) is required; pass "null" to move to root.',
            undefined,
            'Usage: fastgpt dataset batch-move --ids <id1>,<id2> --parent-id <folderId|null>'
          );
        }
        const parentId = parseParentIdOption(options.parentId) ?? null;

        return container.datasetService.batchMove({
          client: activeClient,
          ids,
          parentId,
          dryRun: options.dryRun === true
        });
      }
    },

    {
      path: ['dataset', 'batch-delete'],
      summary: 'Batch delete multiple datasets or folders and their subtrees',
      risk: 'destructive',
      authModes: ['token', 'personalKey'],
      options: [
        {
          name: 'ids',
          flags: '--ids <ids>',
          takesValue: true,
          description: 'Comma-separated dataset ObjectIds'
        },
        {
          name: 'dryRun',
          flags: '--dry-run',
          takesValue: false,
          description: 'Preview batch deletion without executing'
        },
        {
          name: 'yes',
          flags: '--yes',
          takesValue: false,
          description: 'Confirm destructive batch deletion'
        }
      ],
      examples: [
        {
          description: 'Batch delete datasets non-interactively',
          args: [
            'dataset',
            'batch-delete',
            '--ids',
            '68ad85a7463006c963799a05,68ad85a7463006c963799a06',
            '--yes'
          ]
        }
      ],
      execute: async (ctx) => {
        const activeClient = requireActiveClient(ctx.client, 'dataset batch-delete');
        const ids = parseIdListOption(ctx.options.ids);
        if (!ids || ids.length === 0) {
          throw new CliArgumentError(
            'Dataset IDs (--ids) are required.',
            undefined,
            'Usage: fastgpt dataset batch-delete --ids <id1>,<id2> --yes'
          );
        }

        await confirmDestructiveAction({
          ctx,
          message: `Permanently delete ${ids.length} dataset(s) (${ids.join(', ')})?`
        });

        return ctx.container.datasetService.batchDelete({
          client: activeClient,
          ids,
          dryRun: ctx.options.dryRun === true
        });
      }
    },

    {
      path: ['dataset', 'enable-collection-permission'],
      summary: 'Enable file/collection-level permissions for a dataset',
      risk: 'write',
      authModes: ['token'],
      positionalArgs: [{ name: 'datasetId', required: false, description: 'Dataset ObjectId' }],
      options: [
        {
          name: 'id',
          flags: '--id <datasetId>',
          takesValue: true,
          description: 'Dataset ObjectId'
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
          description: 'Enable collection-level permissions',
          args: ['dataset', 'enable-collection-permission', '68ad85a7463006c963799a05']
        }
      ],
      execute: async ({ positional, options, client, container }) => {
        const activeClient = requireActiveClient(client, 'dataset enable-collection-permission');
        const datasetId = resolveIdArg({
          positional: positional[0],
          flagValue: options.id,
          label: 'Dataset ID',
          usage: 'fastgpt dataset enable-collection-permission <datasetId>'
        });

        return container.datasetService.setCollectionPermission({
          client: activeClient,
          datasetId,
          enabled: true,
          dryRun: options.dryRun === true
        });
      }
    },

    {
      path: ['dataset', 'disable-collection-permission'],
      summary: 'Disable file/collection-level permissions and reset all collections to inherit',
      risk: 'destructive',
      authModes: ['token'],
      positionalArgs: [{ name: 'datasetId', required: false, description: 'Dataset ObjectId' }],
      options: [
        {
          name: 'id',
          flags: '--id <datasetId>',
          takesValue: true,
          description: 'Dataset ObjectId'
        },
        {
          name: 'dryRun',
          flags: '--dry-run',
          takesValue: false,
          description: 'Preview without applying'
        },
        {
          name: 'yes',
          flags: '--yes',
          takesValue: false,
          description: 'Confirm disabling permissions'
        }
      ],
      examples: [
        {
          description: 'Disable collection-level permissions',
          args: ['dataset', 'disable-collection-permission', '68ad85a7463006c963799a05', '--yes']
        }
      ],
      execute: async (ctx) => {
        const activeClient = requireActiveClient(
          ctx.client,
          'dataset disable-collection-permission'
        );
        const datasetId = resolveIdArg({
          positional: ctx.positional[0],
          flagValue: ctx.options.id,
          label: 'Dataset ID',
          usage: 'fastgpt dataset disable-collection-permission <datasetId> --yes'
        });

        await confirmDestructiveAction({
          ctx,
          message: `Disable collection-level permissions and clear custom collection collaborators on dataset "${datasetId}"?`
        });

        return ctx.container.datasetService.setCollectionPermission({
          client: activeClient,
          datasetId,
          enabled: false,
          dryRun: ctx.options.dryRun === true
        });
      }
    },

    {
      path: ['dataset', 'resume-inherit-permission'],
      summary: 'Resume inherited permissions from parent folder for a dataset',
      risk: 'write',
      authModes: ['token'],
      positionalArgs: [{ name: 'datasetId', required: false, description: 'Dataset ObjectId' }],
      options: [
        {
          name: 'id',
          flags: '--id <datasetId>',
          takesValue: true,
          description: 'Dataset ObjectId'
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
          description: 'Resume inherited permissions',
          args: ['dataset', 'resume-inherit-permission', '68ad85a7463006c963799a05']
        }
      ],
      execute: async ({ positional, options, client, container }) => {
        const activeClient = requireActiveClient(client, 'dataset resume-inherit-permission');
        const datasetId = resolveIdArg({
          positional: positional[0],
          flagValue: options.id,
          label: 'Dataset ID',
          usage: 'fastgpt dataset resume-inherit-permission <datasetId>'
        });

        return container.datasetService.resumeInheritPermission({
          client: activeClient,
          datasetId,
          dryRun: options.dryRun === true
        });
      }
    }
  ];
}
