import { DatasetSearchFilterSchema } from '@fastgpt/global/core/dataset/search/type';
import { Option } from 'commander';
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
 * 知识库主资源命令组（System OpenAPI）：list / get / create / update / delete / search / batch-move / batch-delete。
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
      summary: 'Update dataset information, model settings, or parent folder',
      risk: 'write',
      authModes: ['token', 'personalKey'],
      positionalArgs: [
        { name: 'datasetId', required: false, description: 'Dataset ObjectId (or use --id)' }
      ],
      options: [
        {
          name: 'id',
          flags: '--id <datasetId>',
          takesValue: true,
          description: 'Dataset ObjectId'
        },
        { name: 'name', flags: '--name <name>', takesValue: true, description: 'New dataset name' },
        {
          name: 'intro',
          flags: '--intro <text>',
          takesValue: true,
          description: 'New description'
        },
        {
          name: 'avatar',
          flags: '--avatar <path>',
          takesValue: true,
          description: 'New avatar path'
        },
        {
          name: 'agentModel',
          flags: '--agent-model <modelId>',
          takesValue: true,
          description: 'Agent / QA model ID; cannot be empty'
        },
        {
          name: 'vlmModel',
          flags: '--vlm-model <modelId>',
          takesValue: true,
          description: 'Vision-language model ID; pass an empty string to clear'
        },
        {
          name: 'parentId',
          flags: '--parent-id <id>',
          takesValue: true,
          description: 'Move to this folder; null for root, omitted to keep the current folder'
        },
        {
          name: 'autoSync',
          flags: '--auto-sync',
          takesValue: false,
          description: 'Enable automatic synchronization'
        },
        {
          name: 'noAutoSync',
          flags: '--no-auto-sync',
          takesValue: false,
          description: 'Disable automatic synchronization'
        },
        {
          name: 'file',
          flags: '--file <path>',
          takesValue: true,
          description: 'Read update JSON, including advanced settings, from a file ("-" for stdin)'
        },
        {
          name: 'stdin',
          flags: '--stdin',
          takesValue: false,
          description: 'Read update JSON from stdin'
        },
        {
          name: 'dryRun',
          flags: '--dry-run',
          takesValue: false,
          description: 'Validate and preview the update without applying it'
        }
      ],
      examples: [
        {
          description: 'Rename a dataset',
          args: ['dataset', 'update', '68ad85a7463006c963799a05', '--name', 'Product Docs']
        },
        {
          description: 'Preview an update from JSON',
          args: ['dataset', 'update', '--file', 'dataset-update.json', '--dry-run']
        }
      ],
      execute: async ({ positional, options, client, container }) => {
        const activeClient = requireActiveClient(client, 'dataset update');
        const filePayload = await resolveJsonObjectPayload({
          filePath: typeof options.file === 'string' ? options.file : undefined,
          useStdin: options.stdin === true,
          readTextFile: container.fileIo.readTextFile,
          readStdin: container.readStdin,
          fieldLabel: 'dataset update payload'
        });
        const id = positional[0] ?? (typeof options.id === 'string' ? options.id : undefined);
        const autoSync = parseOptionalBooleanFlag({
          positive: options.autoSync,
          negative: options.noAutoSync
        });

        // 命令行字段覆盖 JSON；未传字段不写入，保留 null、false 和空字符串的显式更新语义。
        return container.datasetService.update({
          client: activeClient,
          input: {
            ...(filePayload ?? {}),
            ...(id !== undefined ? { id } : {}),
            ...(typeof options.name === 'string' ? { name: options.name } : {}),
            ...(typeof options.intro === 'string' ? { intro: options.intro } : {}),
            ...(typeof options.avatar === 'string' ? { avatar: options.avatar } : {}),
            ...(typeof options.agentModel === 'string' ? { agentModelId: options.agentModel } : {}),
            ...(typeof options.vlmModel === 'string' ? { vlmModelId: options.vlmModel } : {}),
            ...(options.parentId !== undefined
              ? { parentId: parseParentIdOption(options.parentId) }
              : {}),
            ...(autoSync !== undefined ? { autoSync } : {})
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
      summary: 'Search one or more datasets with unified recall, scoring, and reranking',
      risk: 'read',
      authModes: ['token', 'personalKey'],
      positionalArgs: [
        {
          name: 'datasetIds',
          required: false,
          description: 'One or more comma-separated dataset ObjectIds, up to 100 (or use --id)'
        },
        { name: 'text', required: false, description: 'Search query text (or use --text)' }
      ],
      options: [
        {
          name: 'id',
          flags: '--id <datasetIds>',
          takesValue: true,
          description:
            'One or more comma-separated dataset ObjectIds (alternative to positional argument)'
        },
        {
          name: 'text',
          flags: '--text <query>',
          takesValue: true,
          description: 'Search query text'
        },
        {
          name: 'topk',
          flags: '--topk <count>',
          takesValue: true,
          description: 'Return the top 1-100 chunks (default 20); takes precedence over --maxTokens'
        },
        {
          name: 'maxTokens',
          flags: '--maxTokens <tokens>',
          takesValue: true,
          description: 'Use a token budget instead of topk (positive integer)'
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
          description: 'Recall mode: embedding, fullTextRecall, or mixedRecall (default embedding)'
        },
        {
          name: 'usageScene',
          flags: '--usageScene <scene>',
          takesValue: true,
          description:
            'Billing label only: search or searchTest (default search); does not affect retrieval'
        },
        {
          name: 'embeddingWeight',
          flags: '--embeddingWeight <weight>',
          takesValue: true,
          description: 'Embedding fusion weight for mixedRecall (0-1, default 0.5)'
        },
        {
          name: 'collectionIds',
          flags: '--collectionIds <ids>',
          takesValue: true,
          description: 'Restrict to comma-separated collection or folder IDs (up to 500)'
        },
        {
          name: 'createTimeGte',
          flags: '--createTimeGte <datetime>',
          takesValue: true,
          description: 'Inclusive collection creation time lower bound (ISO 8601 with timezone)'
        },
        {
          name: 'createTimeLte',
          flags: '--createTimeLte <datetime>',
          takesValue: true,
          description: 'Inclusive collection creation time upper bound (ISO 8601 with timezone)'
        },
        {
          name: 'tagsAnd',
          flags: '--tagsAnd <json>',
          takesValue: true,
          description: 'JSON array of tag conditions that must all match (1-50 conditions)'
        },
        {
          name: 'tagsOr',
          flags: '--tagsOr <json>',
          takesValue: true,
          description:
            'JSON array of tag conditions of which at least one must match (1-50 conditions)'
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
          description: 'Disable rerank model scoring (default)'
        },
        {
          name: 'rerankModelId',
          flags: '--rerankModelId <id>',
          takesValue: true,
          description: 'Rerank model ID; requires --rerank (default: authorized default model)'
        },
        {
          name: 'rerankCandidateNum',
          flags: '--rerankCandidateNum <count>',
          takesValue: true,
          description: 'Rerank candidate count (10-100, default 100); requires --rerank'
        },
        {
          name: 'rerankWeight',
          flags: '--rerankWeight <weight>',
          takesValue: true,
          description: 'Rerank fusion weight (0-1, default 0.5); requires --rerank'
        },
        {
          name: 'queryExtension',
          flags: '--queryExtension',
          takesValue: false,
          description: 'Enable query extension'
        },
        {
          name: 'noQueryExtension',
          flags: '--no-queryExtension',
          takesValue: false,
          description: 'Disable query extension (default)'
        },
        {
          name: 'queryExtensionModelId',
          flags: '--queryExtensionModelId <id>',
          takesValue: true,
          description:
            'Query extension model ID; requires --queryExtension (default: authorized default model)'
        },
        {
          name: 'queryExtensionBackground',
          flags: '--queryExtensionBackground <text>',
          takesValue: true,
          description:
            'Query extension background (up to 100000 characters); requires --queryExtension'
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
      configure: (cmd) => {
        // 兼容 kebab-case 别名参数（不污染默认 --help 与 commands 清单）
        for (const aliasFlag of [
          '--dataset-ids <ids>',
          '--max-tokens <tokens>',
          '--embedding-weight <weight>',
          '--rerank-model <id>',
          '--rerank-candidate-num <count>',
          '--rerank-weight <weight>',
          '--extension-model <id>',
          '--extension-bg <text>'
        ]) {
          cmd.addOption(new Option(aliasFlag).hideHelp());
        }
        cmd.addOption(new Option('--extension-query').hideHelp());
      },
      examples: [
        {
          description: 'Search a dataset with query text',
          args: ['dataset', 'search', '68ad85a7463006c963799a05', 'What is FastGPT?']
        },
        {
          description: 'Search multiple datasets together with a shared topk budget',
          args: [
            'dataset',
            'search',
            '68ad85a7463006c963799a05,68ad85a7463006c963799a10',
            'What is FastGPT?',
            '--topk',
            '10'
          ]
        }
      ],
      execute: async ({ positional, options, client, container }) => {
        const activeClient = requireActiveClient(client, 'dataset search');

        // 1. 解析结构化 JSON 文件/标准输入载荷（保留原始字段以便共享 OpenAPI Schema 严格校验）
        const filePayload = await resolveJsonObjectPayload({
          filePath: typeof options.file === 'string' ? options.file : undefined,
          useStdin: options.stdin === true,
          readTextFile: container.fileIo.readTextFile,
          readStdin: container.readStdin,
          fieldLabel: 'dataset search payload'
        });

        const readString = (name: string) =>
          typeof options[name] === 'string' ? options[name] : undefined;
        /** JSON 语法错误归为命令参数错误；标签操作符及值类型继续由共享 Schema 校验。 */
        const readJson = (name: string): unknown => {
          const value = readString(name);
          if (value === undefined) return undefined;
          try {
            return JSON.parse(value);
          } catch {
            throw new CliArgumentError(`--${name} must be valid JSON.`);
          }
        };

        // 2. 合并搜索范围与筛选条件（保留逗号拆分空项以便共享 Schema 拒绝非法末尾逗号）
        const rawIdsInput =
          positional[0] ??
          (typeof options.id === 'string' ? options.id : undefined) ??
          (typeof options.datasetIds === 'string' ? options.datasetIds : undefined);

        const hasFilterFlags = [
          'collectionIds',
          'createTimeGte',
          'createTimeLte',
          'tagsAnd',
          'tagsOr'
        ].some((name) => options[name] !== undefined);
        const cliFilter = hasFilterFlags
          ? DatasetSearchFilterSchema.parse({
              collectionIds: readString('collectionIds')
                ?.split(',')
                .map((id) => id.trim()),
              createTime:
                options.createTimeGte !== undefined || options.createTimeLte !== undefined
                  ? { gte: readString('createTimeGte'), lte: readString('createTimeLte') }
                  : undefined,
              tags:
                options.tagsAnd !== undefined || options.tagsOr !== undefined
                  ? { and: readJson('tagsAnd'), or: readJson('tagsOr') }
                  : undefined
            })
          : undefined;

        const scope = (() => {
          if (rawIdsInput !== undefined || cliFilter !== undefined) {
            if (rawIdsInput !== undefined && !rawIdsInput.trim()) {
              throw new CliArgumentError(
                'At least one dataset ID is required.',
                undefined,
                'Usage: fastgpt dataset search <id1,id2,...> <query> or fastgpt dataset search --id <id1,id2,...> --text <query>'
              );
            }
            const baseScope: Record<string, unknown> = isPlainObject(filePayload?.scope)
              ? { ...filePayload.scope }
              : {};
            if (rawIdsInput !== undefined) {
              baseScope.datasetIds = rawIdsInput.split(',').map((id) => id.trim());
            }
            if (cliFilter !== undefined) {
              baseScope.filter = cliFilter;
            }
            if (!('datasetIds' in baseScope)) {
              throw new CliArgumentError(
                'At least one dataset ID is required.',
                undefined,
                'Usage: fastgpt dataset search <id1,id2,...> <query> or fastgpt dataset search --id <id1,id2,...> --text <query>'
              );
            }
            return baseScope;
          }
          if (filePayload && 'scope' in filePayload) {
            return filePayload.scope;
          }
          throw new CliArgumentError(
            'At least one dataset ID is required.',
            undefined,
            'Usage: fastgpt dataset search <id1,id2,...> <query> or fastgpt dataset search --id <id1,id2,...> --text <query>'
          );
        })();

        // 3. 合并查询文本（显式传入时覆盖，否则保留文件载荷中的 query 原值）
        const explicitText =
          positional[1] !== undefined
            ? positional[1]
            : typeof options.text === 'string'
              ? options.text
              : undefined;

        const query = await (async () => {
          if (explicitText !== undefined) {
            const trimmed = explicitText.trim();
            if (!trimmed) {
              throw new CliArgumentError(
                'Search query text is required.',
                undefined,
                'Usage: fastgpt dataset search <id1,id2,...> "search text"'
              );
            }
            return {
              ...(isPlainObject(filePayload?.query) ? filePayload.query : {}),
              text: trimmed
            };
          }
          if (filePayload && 'query' in filePayload) {
            return filePayload.query;
          }
          if (container.prompter.isInteractive && options.format !== 'json') {
            const prompted = (
              await container.prompter.text({ message: 'Enter search query:' })
            ).trim();
            if (prompted) {
              return { text: prompted };
            }
          }
          throw new CliArgumentError(
            'Search query text is required.',
            undefined,
            'Usage: fastgpt dataset search <id1,id2,...> "search text"'
          );
        })();

        // 4. 合并召回、重排与查询扩展配置（未传 flag 时保留文件原值；禁用态附带子参数交由共享 Schema 拒绝）
        const embeddingWeight = parseOptionalNumber(options.embeddingWeight);
        const hasRetrievalFlags = options.mode !== undefined || embeddingWeight !== undefined;
        const retrieval = (() => {
          if (hasRetrievalFlags) {
            return {
              ...(isPlainObject(filePayload?.retrieval) ? filePayload.retrieval : {}),
              ...(options.mode !== undefined ? { mode: options.mode } : {}),
              ...(embeddingWeight !== undefined ? { embeddingWeight } : {})
            };
          }
          return filePayload && 'retrieval' in filePayload ? filePayload.retrieval : undefined;
        })();

        const usingReRank = parseOptionalBooleanFlag({
          positive: options.rerank,
          negative: options.noRerank
        });
        const rerankModelId =
          typeof options.rerankModelId === 'string'
            ? options.rerankModelId
            : typeof options.rerankModel === 'string'
              ? options.rerankModel
              : undefined;
        const rerankWeight = parseOptionalNumber(options.rerankWeight);
        const rerankCandidateNum = parseOptionalNumber(options.rerankCandidateNum);
        const hasRerankFlags =
          usingReRank !== undefined ||
          rerankModelId !== undefined ||
          rerankWeight !== undefined ||
          rerankCandidateNum !== undefined;

        const rerank = (() => {
          if (hasRerankFlags) {
            const fileRerank = isPlainObject(filePayload?.rerank) ? filePayload.rerank : undefined;
            const enabled =
              usingReRank !== undefined
                ? usingReRank
                : typeof fileRerank?.enabled === 'boolean'
                  ? fileRerank.enabled
                  : false;
            return {
              ...(fileRerank ?? {}),
              enabled,
              ...(rerankModelId !== undefined ? { modelId: rerankModelId } : {}),
              ...(rerankCandidateNum !== undefined ? { candidateNum: rerankCandidateNum } : {}),
              ...(rerankWeight !== undefined ? { weight: rerankWeight } : {})
            };
          }
          return filePayload && 'rerank' in filePayload ? filePayload.rerank : undefined;
        })();

        const usingQueryExt = parseOptionalBooleanFlag({
          positive: options.queryExtension === true || options.extensionQuery === true || undefined,
          negative: options.queryExtension === false ? true : undefined
        });
        const extensionModelId =
          typeof options.queryExtensionModelId === 'string'
            ? options.queryExtensionModelId
            : typeof options.extensionModel === 'string'
              ? options.extensionModel
              : undefined;
        const extensionBg =
          typeof options.queryExtensionBackground === 'string'
            ? options.queryExtensionBackground
            : typeof options.extensionBg === 'string'
              ? options.extensionBg
              : undefined;
        const hasExtFlags =
          usingQueryExt !== undefined ||
          extensionModelId !== undefined ||
          extensionBg !== undefined;

        const queryExtension = (() => {
          if (hasExtFlags) {
            const fileExt = isPlainObject(filePayload?.queryExtension)
              ? filePayload.queryExtension
              : undefined;
            const enabled =
              usingQueryExt !== undefined
                ? usingQueryExt
                : typeof fileExt?.enabled === 'boolean'
                  ? fileExt.enabled
                  : false;
            return {
              ...(fileExt ?? {}),
              enabled,
              ...(extensionModelId !== undefined ? { modelId: extensionModelId } : {}),
              ...(extensionBg !== undefined ? { background: extensionBg } : {})
            };
          }
          return filePayload && 'queryExtension' in filePayload
            ? filePayload.queryExtension
            : undefined;
        })();

        // 5. 合并结果预算（双传与优先级统一交由共享 SearchDatasetRequestBodySchema 执行 topk 优先归一化）
        const topk = parseOptionalNumber(options.topk);
        const maxTokens = parseOptionalNumber(options.maxTokens);
        const similarity = parseOptionalNumber(options.similarity);
        const hasResultFlags =
          topk !== undefined || maxTokens !== undefined || similarity !== undefined;
        const result = (() => {
          if (!hasResultFlags) {
            return filePayload && 'result' in filePayload ? filePayload.result : undefined;
          }
          const baseResult: Record<string, unknown> = isPlainObject(filePayload?.result)
            ? { ...filePayload.result }
            : {};
          if (similarity !== undefined) {
            baseResult.similarity = similarity;
          }
          if (topk !== undefined && maxTokens !== undefined) {
            baseResult.topk = topk;
            baseResult.maxTokens = maxTokens;
          } else if (topk !== undefined) {
            delete baseResult.maxTokens;
            baseResult.topk = topk;
          } else if (maxTokens !== undefined) {
            delete baseResult.topk;
            baseResult.maxTokens = maxTokens;
          }
          return baseResult;
        })();

        const usageScene =
          options.usageScene !== undefined
            ? readString('usageScene')
            : filePayload && 'usageScene' in filePayload
              ? filePayload.usageScene
              : undefined;

        // 6. 组装最终载荷并交由领域服务执行 SearchDatasetRequestBodySchema 校验与请求
        const payload = {
          ...(filePayload ?? {}),
          scope,
          query,
          ...(retrieval !== undefined ? { retrieval } : {}),
          ...(rerank !== undefined ? { rerank } : {}),
          ...(queryExtension !== undefined ? { queryExtension } : {}),
          ...(result !== undefined ? { result } : {}),
          ...(usageScene !== undefined ? { usageScene } : {})
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
