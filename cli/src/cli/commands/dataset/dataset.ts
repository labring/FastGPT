import { DatasetSearchModeEnum } from '@fastgpt/global/core/dataset/constants';
import z from 'zod';
import { CliArgumentError } from '../../../shared/errors';
import {
  isPlainObject,
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
 * 知识库主资源命令组（System OpenAPI）：list / get / create / delete / search / batch-move / batch-delete。
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
      summary: 'Search one or more datasets using the OpenAPI retrieval endpoint',
      risk: 'read',
      authModes: ['token', 'personalKey'],
      positionalArgs: [
        {
          name: 'datasetId',
          required: false,
          description: 'Target dataset ObjectId (or use --id / --dataset-ids)'
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
          name: 'datasetIds',
          flags: '--dataset-ids <ids>',
          takesValue: true,
          description: 'Comma-separated dataset ObjectIds for multi-dataset search'
        },
        {
          name: 'text',
          flags: '--text <query>',
          takesValue: true,
          description: 'Search query text'
        },
        {
          name: 'topk',
          flags: '--topk <n>',
          takesValue: true,
          description:
            'Top-K chunks to return (1-100, default 20; mutually exclusive with --max-tokens)'
        },
        {
          name: 'maxTokens',
          flags: '--max-tokens <n>',
          takesValue: true,
          description: 'Maximum token budget for recalled chunks (mutually exclusive with --topk)'
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
        },
        {
          name: 'file',
          flags: '--file <path>',
          takesValue: true,
          description: 'Read structured /core/dataset/search JSON payload from file ("-" for stdin)'
        },
        {
          name: 'stdin',
          flags: '--stdin',
          takesValue: false,
          description: 'Read structured /core/dataset/search JSON payload from stdin'
        }
      ],
      examples: [
        {
          description: 'Search a dataset with query text',
          args: ['dataset', 'search', '68ad85a7463006c963799a05', 'What is FastGPT?']
        },
        {
          description: 'Multi-dataset hybrid search with rerank',
          args: [
            'dataset',
            'search',
            '--dataset-ids',
            '68ad85a7463006c963799a05,68ad85a7463006c963799a06',
            '--text',
            'API authentication',
            '--topk',
            '10',
            '--rerank',
            '--format',
            'json'
          ]
        }
      ],
      execute: async ({ positional, options, client, container }) => {
        const activeClient = requireActiveClient(client, 'dataset search');

        const filePayload = await resolveJsonObjectPayload({
          filePath: typeof options.file === 'string' ? options.file : undefined,
          useStdin: options.stdin === true,
          readTextFile: container.fileIo.readTextFile,
          readStdin: container.readStdin,
          fieldLabel: 'dataset search payload'
        });

        const flagIds = parseIdListOption(options.datasetIds);
        const singleId =
          positional[0]?.trim() || (typeof options.id === 'string' ? options.id.trim() : '');
        const scopeObj = isPlainObject(filePayload?.scope) ? filePayload.scope : undefined;
        const fileDatasetIds = Array.isArray(scopeObj?.datasetIds)
          ? scopeObj.datasetIds.map((id) => String(id).trim()).filter(Boolean)
          : undefined;
        const datasetIds = flagIds ?? (singleId ? [singleId] : fileDatasetIds);

        if (!datasetIds || datasetIds.length === 0) {
          throw new CliArgumentError(
            'Dataset ID is required.',
            undefined,
            'Usage: fastgpt dataset search <datasetId> "search text" or --dataset-ids <id1>,<id2>'
          );
        }

        const queryObj = isPlainObject(filePayload?.query) ? filePayload.query : undefined;
        const searchText = await (async () => {
          const direct =
            positional[1] ??
            (typeof options.text === 'string' ? options.text : undefined) ??
            (typeof queryObj?.text === 'string' ? queryObj.text : '');
          if (direct.trim()) return direct.trim();
          if (container.prompter.isInteractive && options.format !== 'json' && !filePayload) {
            return (await container.prompter.text({ message: 'Enter search query:' })).trim();
          }
          return '';
        })();

        const fileImageKeys = Array.isArray(queryObj?.imageKeys) ? queryObj.imageKeys : undefined;
        if (!searchText && (!fileImageKeys || fileImageKeys.length === 0)) {
          throw new CliArgumentError(
            'Search query text is required.',
            undefined,
            'Usage: fastgpt dataset search <datasetId> "search text"'
          );
        }

        const searchMode =
          options.mode !== undefined
            ? z.enum(DatasetSearchModeEnum).parse(options.mode)
            : isPlainObject(filePayload?.retrieval) &&
                typeof filePayload.retrieval.mode === 'string'
              ? z.enum(DatasetSearchModeEnum).parse(filePayload.retrieval.mode)
              : DatasetSearchModeEnum.mixedRecall;

        const embeddingWeight = parseOptionalNumber(options.embeddingWeight);
        const topk = parseOptionalNumber(options.topk);
        const maxTokens = parseOptionalNumber(options.maxTokens);
        const similarity = parseOptionalNumber(options.similarity);

        const usingReRank = parseOptionalBooleanFlag({
          positive: options.rerank,
          negative: options.noRerank
        });
        const rerankModelId =
          typeof options.rerankModel === 'string' ? options.rerankModel.trim() : undefined;
        const rerankWeight = parseOptionalNumber(options.rerankWeight);
        const rerankCandidateNum = parseOptionalNumber(options.rerankCandidateNum);

        const fileRerank = isPlainObject(filePayload?.rerank) ? filePayload.rerank : undefined;
        const rerankEnabled =
          usingReRank ?? (typeof fileRerank?.enabled === 'boolean' ? fileRerank.enabled : false);

        const rerank = rerankEnabled
          ? {
              ...(fileRerank ?? {}),
              enabled: true as const,
              ...(rerankModelId ? { modelId: rerankModelId } : {}),
              ...(rerankWeight !== undefined ? { weight: rerankWeight } : {}),
              ...(rerankCandidateNum !== undefined ? { candidateNum: rerankCandidateNum } : {})
            }
          : { enabled: false as const };

        const fileExt = isPlainObject(filePayload?.queryExtension)
          ? filePayload.queryExtension
          : undefined;
        const extensionModelId =
          typeof options.extensionModel === 'string' ? options.extensionModel.trim() : undefined;
        const extensionBg =
          typeof options.extensionBg === 'string' ? options.extensionBg : undefined;
        const extEnabled =
          options.extensionQuery === true ||
          (options.extensionQuery === undefined && fileExt?.enabled === true);

        const queryExtension = extEnabled
          ? {
              ...(fileExt ?? {}),
              enabled: true as const,
              ...(extensionModelId ? { modelId: extensionModelId } : {}),
              ...(extensionBg !== undefined ? { background: extensionBg } : {})
            }
          : { enabled: false as const };

        const fileResult = isPlainObject(filePayload?.result) ? filePayload.result : undefined;
        const result = (() => {
          const baseSim =
            similarity !== undefined
              ? { similarity }
              : typeof fileResult?.similarity === 'number'
                ? { similarity: fileResult.similarity }
                : {};
          if (maxTokens !== undefined) {
            return { ...baseSim, maxTokens };
          }
          if (topk !== undefined) {
            return { ...baseSim, topk };
          }
          if (fileResult && 'maxTokens' in fileResult && fileResult.maxTokens !== undefined) {
            return { ...baseSim, maxTokens: fileResult.maxTokens as number };
          }
          if (fileResult && 'topk' in fileResult && fileResult.topk !== undefined) {
            return { ...baseSim, topk: fileResult.topk as number };
          }
          return baseSim;
        })();

        const fileRetrieval = isPlainObject(filePayload?.retrieval)
          ? filePayload.retrieval
          : undefined;

        const payload = {
          ...(filePayload ?? {}),
          scope: {
            ...(scopeObj ?? {}),
            datasetIds
          },
          query: searchText
            ? { ...(queryObj ?? {}), text: searchText }
            : { ...(queryObj ?? {}), imageKeys: fileImageKeys ?? [] },
          retrieval: {
            ...(fileRetrieval ?? {}),
            mode: searchMode,
            ...(embeddingWeight !== undefined ? { embeddingWeight } : {})
          },
          rerank,
          queryExtension,
          result
        };

        return container.datasetService.search({
          client: activeClient,
          input: payload as any
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
          description: 'Move two datasets to a folder',
          args: [
            'dataset',
            'batch-move',
            '--ids',
            '68ad85a7463006c963799a05,68ad85a7463006c963799a06',
            '--parent-id',
            '68ad85a7463006c963799a10'
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
    }
  ];
}
