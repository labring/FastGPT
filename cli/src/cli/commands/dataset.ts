import { CliArgumentError } from '../../shared/errors';
import type { CliCommandSpec } from '../pipeline';

export function createDatasetCommandSpecs(): CliCommandSpec[] {
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
          description: 'Filter by type: dataset, folder, or websiteDataset'
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
        }
      ],
      examples: [
        { description: 'List root datasets', args: ['dataset', 'list'] },
        {
          description: 'Search datasets matching "product"',
          args: ['dataset', 'list', '--search', 'product']
        },
        {
          description: 'List datasets as JSON for CI/Agent',
          args: ['dataset', 'list', '--format', 'json']
        }
      ],
      execute: async ({ options, client, container }) => {
        if (!client) {
          throw new CliArgumentError('Active HTTP client required for dataset list.');
        }

        return container.datasetService.list({
          client,
          input: {
            searchKey: typeof options.search === 'string' ? options.search : undefined,
            parentId: typeof options.parentId === 'string' ? options.parentId : undefined,
            type: typeof options.type === 'string' ? options.type : undefined,
            page: typeof options.page === 'string' ? Number(options.page) : undefined,
            pageSize: typeof options.pageSize === 'string' ? Number(options.pageSize) : undefined
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
        },
        {
          description: 'Inspect dataset configuration using --id flag',
          args: ['dataset', 'get', '--id', '68ad85a7463006c963799a05']
        }
      ],
      execute: async ({ positional, options, client, container }) => {
        if (!client) {
          throw new CliArgumentError('Active HTTP client required for dataset get.');
        }

        const datasetId = positional[0] ?? (typeof options.id === 'string' ? options.id : '');
        if (!datasetId.trim()) {
          throw new CliArgumentError(
            'Dataset ID is required.',
            undefined,
            'Usage: fastgpt dataset get <datasetId> or fastgpt dataset get --id <datasetId>'
          );
        }

        return container.datasetService.getDetail({
          client,
          datasetId: datasetId.trim()
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
          description: 'Type: dataset (default), folder, or websiteDataset'
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
          name: 'parentId',
          flags: '--parent-id <id>',
          takesValue: true,
          description: 'Parent folder ID (null for root)'
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
          description: 'Preview creation with custom vector model',
          args: [
            'dataset',
            'create',
            '--name',
            'FAQ',
            '--vector-model',
            'text-embedding-3-small',
            '--dry-run'
          ]
        }
      ],
      execute: async ({ options, client, container }) => {
        if (!client) {
          throw new CliArgumentError('Active HTTP client required for dataset create.');
        }

        const name = await (async () => {
          const direct = typeof options.name === 'string' ? options.name.trim() : '';
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

        return container.datasetService.create({
          client,
          input: {
            name,
            intro: typeof options.intro === 'string' ? options.intro : undefined,
            type: typeof options.type === 'string' ? options.type : undefined,
            vectorModelId:
              typeof options.vectorModel === 'string' ? options.vectorModel : undefined,
            agentModelId: typeof options.agentModel === 'string' ? options.agentModel : undefined,
            parentId: typeof options.parentId === 'string' ? options.parentId : undefined
          },
          dryRun: options.dryRun === true
        });
      }
    },

    {
      path: ['dataset', 'update'],
      summary: 'Update dataset properties, metadata, or agent model',
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
          name: 'parentId',
          flags: '--parent-id <id>',
          takesValue: true,
          description: 'New parent folder ID (null to move to root)'
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
          description: 'Update dataset using --id flag and preview changes',
          args: [
            'dataset',
            'update',
            '--id',
            '68ad85a7463006c963799a05',
            '--name',
            'New Name',
            '--dry-run'
          ]
        }
      ],
      execute: async ({ positional, options, client, container }) => {
        if (!client) {
          throw new CliArgumentError('Active HTTP client required for dataset update.');
        }

        const datasetId = positional[0] ?? (typeof options.id === 'string' ? options.id : '');
        if (!datasetId.trim()) {
          throw new CliArgumentError(
            'Dataset ID is required.',
            undefined,
            'Usage: fastgpt dataset update <datasetId> --name "New Name"'
          );
        }

        return container.datasetService.update({
          client,
          datasetId: datasetId.trim(),
          input: {
            name: typeof options.name === 'string' ? options.name : undefined,
            intro: typeof options.intro === 'string' ? options.intro : undefined,
            agentModelId: typeof options.agentModel === 'string' ? options.agentModel : undefined,
            parentId: typeof options.parentId === 'string' ? options.parentId : undefined
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
          description: 'Delete a dataset with confirmation',
          args: ['dataset', 'delete', '68ad85a7463006c963799a05']
        },
        {
          description: 'Preview dataset deletion without deleting',
          args: ['dataset', 'delete', '68ad85a7463006c963799a05', '--dry-run']
        },
        {
          description: 'Non-interactive deletion for CI / Agent',
          args: ['dataset', 'delete', '68ad85a7463006c963799a05', '--yes']
        }
      ],
      execute: async ({ positional, options, client, container }) => {
        if (!client) {
          throw new CliArgumentError('Active HTTP client required for dataset delete.');
        }

        const datasetId = positional[0] ?? (typeof options.id === 'string' ? options.id : '');
        if (!datasetId.trim()) {
          throw new CliArgumentError(
            'Dataset ID is required.',
            undefined,
            'Usage: fastgpt dataset delete <datasetId> or fastgpt dataset delete --id <datasetId>'
          );
        }

        if (
          options.dryRun !== true &&
          container.prompter.isInteractive &&
          options.format !== 'json' &&
          options.yes !== true
        ) {
          const confirmed = await container.prompter.confirm?.({
            message: `Are you sure you want to permanently delete dataset "${datasetId.trim()}"?`
          });
          if (!confirmed) {
            throw new CliArgumentError('Dataset deletion cancelled by user.');
          }
        }

        return container.datasetService.delete({
          client,
          datasetId: datasetId.trim(),
          dryRun: options.dryRun === true
        });
      }
    },

    {
      path: ['dataset', 'search'],
      summary: 'Test knowledge recall, chunk scoring, and reranking against a dataset',
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
        }
      ],
      examples: [
        {
          description: 'Test recall with query text',
          args: ['dataset', 'search', '68ad85a7463006c963799a05', 'What is FastGPT?']
        },
        {
          description: 'Hybrid search using --id and --text flags',
          args: [
            'dataset',
            'search',
            '--id',
            '68ad85a7463006c963799a05',
            '--text',
            'API authentication',
            '--similarity',
            '0.6',
            '--format',
            'json'
          ]
        }
      ],
      execute: async ({ positional, options, client, container }) => {
        if (!client) {
          throw new CliArgumentError('Active HTTP client required for dataset search.');
        }

        const datasetId = positional[0] ?? (typeof options.id === 'string' ? options.id : '');
        if (!datasetId.trim()) {
          throw new CliArgumentError(
            'Dataset ID is required.',
            undefined,
            'Usage: fastgpt dataset search <datasetId> <query> or fastgpt dataset search --id <datasetId> --text <query>'
          );
        }

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

        const searchMode = (() => {
          if (
            options.mode === 'embedding' ||
            options.mode === 'fullTextRecall' ||
            options.mode === 'mixedRecall'
          ) {
            return options.mode;
          }
          return 'mixedRecall' as const;
        })();

        const usingReRank = (() => {
          if (options.rerank === true) return true;
          if (options.noRerank === true || options.rerank === false) return false;
          return undefined;
        })();

        return container.datasetService.search({
          client,
          input: {
            datasetId: datasetId.trim(),
            text: searchText,
            limit: typeof options.limit === 'string' ? Number(options.limit) : undefined,
            similarity:
              typeof options.similarity === 'string' ? Number(options.similarity) : undefined,
            searchMode,
            usingReRank
          }
        });
      }
    }
  ];
}
