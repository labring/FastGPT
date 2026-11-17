import z from 'zod';
import { ChatCompletionMessageParamSchema } from '@fastgpt/global/core/ai/llm/type';
import { ChatItemMiniSchema } from '@fastgpt/global/core/chat/type';
import { CliArgumentError } from '../../../shared/errors';
import {
  parseIdListOption,
  resolveJsonObjectPayload,
  resolveJsonPayload,
  resolveTextInput
} from '../../../shared/input';
import type { CliCommandSpec } from '../../pipeline';
import { requireActiveClient } from '../dataset/shared';
import {
  WORKFLOW_DIR_OPTION,
  WORKFLOW_DRY_RUN_OPTION,
  WORKFLOW_LOCALE_OPTION,
  optionalNonEmptyOption,
  requireNonEmptyOption,
  resolveWorkflowDir,
  resolveWorkflowLocale
} from './shared';

function resolveOptionalAppId(
  positional: readonly string[],
  options: Record<string, unknown>
): string | undefined {
  const pos = positional[0];
  const flag = optionalNonEmptyOption(options, 'appId');
  return pos ?? flag;
}

function parseTimeoutMs(raw: unknown): number | undefined {
  if (raw === undefined) {
    return undefined;
  }
  const num = typeof raw === 'number' ? raw : Number(String(raw));
  if (!Number.isInteger(num) || num <= 0) {
    throw new CliArgumentError('--timeout must be a positive integer in milliseconds.');
  }
  return num;
}

/**
 * 云端工作流 GitOps 同步、调试、代码生成与自动化测试命令组。
 */
export function createWorkflowSyncCommandSpecs(): CliCommandSpec[] {
  return [
    {
      path: ['workflow', 'pull'],
      summary: 'Pull an App draft or specific version from FastGPT into local workflow.json',
      risk: 'write',
      authModes: ['token'],
      positionalArgs: [
        { name: 'appId', required: false, description: 'Target App ObjectId (or use --app-id)' }
      ],
      options: [
        WORKFLOW_DIR_OPTION,
        WORKFLOW_LOCALE_OPTION,
        {
          name: 'appId',
          flags: '--app-id <appId>',
          takesValue: true,
          description: 'Target App ObjectId'
        },
        {
          name: 'versionId',
          flags: '--version-id <versionId>',
          takesValue: true,
          description: 'Pull a specific historical version ID'
        },
        {
          name: 'force',
          flags: '--force',
          takesValue: false,
          description: 'Overwrite local unpushed modifications'
        },
        WORKFLOW_DRY_RUN_OPTION
      ],
      examples: [
        {
          description: 'Pull latest draft workflow for an App',
          args: ['workflow', 'pull', '68ad85a7463006c963799a05']
        },
        {
          description: 'Pull a specific version',
          args: [
            'workflow',
            'pull',
            '68ad85a7463006c963799a05',
            '--version-id',
            '68ad85a7463006c963799a09'
          ]
        }
      ],
      execute: ({ positional, options, client, container }) =>
        container.workflowSyncService.pull({
          client: requireActiveClient(client, 'workflow pull'),
          dir: resolveWorkflowDir(options, container.env),
          locale: resolveWorkflowLocale(options, container.env),
          appId: resolveOptionalAppId(positional, options),
          versionId: optionalNonEmptyOption(options, 'versionId'),
          force: options.force === true,
          dryRun: options.dryRun === true
        })
    },

    {
      path: ['workflow', 'diff'],
      summary: 'Compare local workflow.json against the remote App draft',
      risk: 'read',
      authModes: ['token'],
      positionalArgs: [
        {
          name: 'appId',
          required: false,
          description: 'Target App ObjectId (defaults to synced appId)'
        }
      ],
      options: [
        WORKFLOW_DIR_OPTION,
        {
          name: 'appId',
          flags: '--app-id <appId>',
          takesValue: true,
          description: 'Target App ObjectId'
        }
      ],
      examples: [
        {
          description: 'Diff local workflow.json against remote App draft',
          args: ['workflow', 'diff']
        }
      ],
      execute: ({ positional, options, client, container }) =>
        container.workflowSyncService.diff({
          client: requireActiveClient(client, 'workflow diff'),
          dir: resolveWorkflowDir(options, container.env),
          appId: resolveOptionalAppId(positional, options)
        })
    },

    {
      path: ['workflow', 'push'],
      summary: 'Validate local workflow.json and save it as the remote App auto-save draft',
      risk: 'write',
      authModes: ['token'],
      positionalArgs: [
        {
          name: 'appId',
          required: false,
          description: 'Target App ObjectId (defaults to synced appId)'
        }
      ],
      options: [
        WORKFLOW_DIR_OPTION,
        {
          name: 'appId',
          flags: '--app-id <appId>',
          takesValue: true,
          description: 'Target App ObjectId'
        },
        {
          name: 'force',
          flags: '--force',
          takesValue: false,
          description: 'Overwrite remote draft even if remote changed since last sync'
        },
        WORKFLOW_DRY_RUN_OPTION
      ],
      examples: [
        { description: 'Push local workflow.json to remote draft', args: ['workflow', 'push'] },
        {
          description: 'Preview push without saving remotely',
          args: ['workflow', 'push', '--dry-run']
        }
      ],
      execute: ({ positional, options, client, container }) =>
        container.workflowSyncService.push({
          client: requireActiveClient(client, 'workflow push'),
          dir: resolveWorkflowDir(options, container.env),
          appId: resolveOptionalAppId(positional, options),
          force: options.force === true,
          dryRun: options.dryRun === true
        })
    },

    {
      path: ['workflow', 'publish'],
      summary: 'Validate local workflow.json and publish a new live App version',
      risk: 'write',
      authModes: ['token'],
      positionalArgs: [
        {
          name: 'appId',
          required: false,
          description: 'Target App ObjectId (defaults to synced appId)'
        }
      ],
      options: [
        WORKFLOW_DIR_OPTION,
        {
          name: 'appId',
          flags: '--app-id <appId>',
          takesValue: true,
          description: 'Target App ObjectId'
        },
        {
          name: 'versionName',
          flags: '--version-name <name>',
          takesValue: true,
          description: 'Release version label'
        },
        {
          name: 'force',
          flags: '--force',
          takesValue: false,
          description: 'Overwrite remote draft even if remote changed since last sync'
        },
        WORKFLOW_DRY_RUN_OPTION
      ],
      examples: [
        {
          description: 'Publish local workflow.json as v1.2.0',
          args: ['workflow', 'publish', '--version-name', 'v1.2.0']
        }
      ],
      execute: ({ positional, options, client, container }) =>
        container.workflowSyncService.publish({
          client: requireActiveClient(client, 'workflow publish'),
          dir: resolveWorkflowDir(options, container.env),
          appId: resolveOptionalAppId(positional, options),
          versionName: optionalNonEmptyOption(options, 'versionName'),
          force: options.force === true,
          dryRun: options.dryRun === true
        })
    },

    {
      path: ['workflow', 'debug'],
      summary:
        'Execute a single-round debug run of local or remote workflow via /core/workflow/debug',
      risk: 'write',
      authModes: ['token'],
      positionalArgs: [
        {
          name: 'appId',
          required: false,
          description: 'Target App ObjectId (defaults to synced appId)'
        }
      ],
      options: [
        WORKFLOW_DIR_OPTION,
        {
          name: 'appId',
          flags: '--app-id <appId>',
          takesValue: true,
          description: 'Target App ObjectId'
        },
        {
          name: 'remote',
          flags: '--remote',
          takesValue: false,
          description: 'Debug remote draft instead of local workflow.json'
        },
        {
          name: 'query',
          flags: '--query <text>',
          takesValue: true,
          description: 'User query text for debug run'
        },
        {
          name: 'variables',
          flags: '--variables <json>',
          takesValue: true,
          description: 'Global variables JSON object'
        },
        {
          name: 'variablesFile',
          flags: '--variables-file <path>',
          takesValue: true,
          description: 'Read global variables JSON object from file'
        },
        {
          name: 'historyFile',
          flags: '--history-file <path>',
          takesValue: true,
          description: 'Read ChatItemMini[] history JSON from file'
        },
        {
          name: 'entryNodes',
          flags: '--entry-nodes <ids>',
          takesValue: true,
          description: 'Comma-separated entry node IDs'
        },
        {
          name: 'chatId',
          flags: '--chat-id <id>',
          takesValue: true,
          description: 'Optional debug session chatId'
        },
        {
          name: 'usageId',
          flags: '--usage-id <id>',
          takesValue: true,
          description: 'Reuse existing usageId across debug steps'
        },
        {
          name: 'timeout',
          flags: '--timeout <ms>',
          takesValue: true,
          description: 'Request timeout in milliseconds (default 300000)'
        },
        WORKFLOW_DRY_RUN_OPTION
      ],
      examples: [
        {
          description: 'Debug local workflow with a test prompt',
          args: ['workflow', 'debug', '--query', 'How do I reset my password?']
        }
      ],
      execute: async ({ positional, options, client, container }) => {
        const activeClient = requireActiveClient(client, 'workflow debug');
        if (options.variables !== undefined && options.variablesFile !== undefined) {
          throw new CliArgumentError('--variables and --variables-file are mutually exclusive.');
        }
        const variables = await resolveJsonObjectPayload({
          inlineJson: typeof options.variables === 'string' ? options.variables : undefined,
          filePath: typeof options.variablesFile === 'string' ? options.variablesFile : undefined,
          readTextFile: container.fileIo.readTextFile,
          readStdin: container.readStdin,
          fieldLabel: 'variables'
        });
        const rawHistory = await resolveJsonPayload({
          filePath: typeof options.historyFile === 'string' ? options.historyFile : undefined,
          readTextFile: container.fileIo.readTextFile,
          readStdin: container.readStdin,
          fieldLabel: 'history'
        });
        const history =
          rawHistory !== undefined ? z.array(ChatItemMiniSchema).parse(rawHistory) : undefined;

        return container.workflowSyncService.debug({
          client: activeClient,
          dir: resolveWorkflowDir(options, container.env),
          appId: resolveOptionalAppId(positional, options),
          remote: options.remote === true,
          query: typeof options.query === 'string' ? options.query : undefined,
          variables,
          history,
          entryNodes: parseIdListOption(options.entryNodes),
          chatId: optionalNonEmptyOption(options, 'chatId'),
          usageId: optionalNonEmptyOption(options, 'usageId'),
          timeoutMs: parseTimeoutMs(options.timeout),
          dryRun: options.dryRun === true
        });
      }
    },

    {
      path: ['workflow', 'sandbox-packages'],
      summary: 'List available JS/Python packages and builtin globals in the FastGPT code sandbox',
      risk: 'read',
      authModes: ['token'],
      options: [],
      examples: [
        {
          description: 'Query supported sandbox dependencies',
          args: ['workflow', 'sandbox-packages', '--format', 'json']
        }
      ],
      execute: ({ client, container }) =>
        container.workflowSyncService.sandboxPackages({
          client: requireActiveClient(client, 'workflow sandbox-packages')
        })
    },

    {
      path: ['workflow', 'optimize-code'],
      summary: 'Generate or optimize code-node JavaScript/Python code via FastGPT Code Copilot',
      risk: 'write',
      authModes: ['token', 'personalKey'],
      options: [
        {
          name: 'prompt',
          flags: '--prompt <text>',
          takesValue: true,
          description: 'Code generation or optimization prompt'
        },
        {
          name: 'file',
          flags: '--file <path>',
          takesValue: true,
          description: 'Read prompt from file ("-" for stdin)'
        },
        {
          name: 'stdin',
          flags: '--stdin',
          takesValue: false,
          description: 'Read prompt from stdin'
        },
        {
          name: 'model',
          flags: '--model <modelId>',
          takesValue: true,
          description: 'LLM model ID'
        },
        {
          name: 'historyFile',
          flags: '--history-file <path>',
          takesValue: true,
          description: 'Optional conversationHistory JSON file'
        },
        WORKFLOW_DRY_RUN_OPTION
      ],
      examples: [
        {
          description: 'Generate a deduplication JS function for a code node',
          args: [
            'workflow',
            'optimize-code',
            '--model',
            'gpt-4o-mini',
            '--prompt',
            'Deduplicate and sort string array {paramName: "items", paramRefer: "start.items", paramType: "arrayString"}'
          ]
        }
      ],
      execute: async ({ options, client, container }) => {
        const activeClient = requireActiveClient(client, 'workflow optimize-code');
        const prompt = await resolveTextInput({
          directText: typeof options.prompt === 'string' ? options.prompt : undefined,
          filePath: typeof options.file === 'string' ? options.file : undefined,
          useStdin: options.stdin === true,
          readTextFile: container.fileIo.readTextFile,
          readStdin: container.readStdin,
          fieldLabel: 'prompt'
        });
        if (!prompt || !prompt.trim()) {
          throw new CliArgumentError('A prompt is required via --prompt, --file, or --stdin.');
        }
        const modelId = requireNonEmptyOption({ options, key: 'model', flagName: '--model' });
        const rawHistory = await resolveJsonPayload({
          filePath: typeof options.historyFile === 'string' ? options.historyFile : undefined,
          readTextFile: container.fileIo.readTextFile,
          readStdin: container.readStdin,
          fieldLabel: 'conversationHistory'
        });
        const conversationHistory =
          rawHistory !== undefined
            ? z.array(ChatCompletionMessageParamSchema).parse(rawHistory)
            : undefined;

        return container.workflowSyncService.optimizeCode({
          client: activeClient,
          prompt,
          modelId,
          conversationHistory,
          dryRun: options.dryRun === true
        });
      }
    },

    {
      path: ['workflow', 'test'],
      summary:
        'Run automated assertion tests against local or remote workflow via /core/workflow/debug',
      risk: 'write',
      authModes: ['token'],
      positionalArgs: [
        {
          name: 'appId',
          required: false,
          description: 'Target App ObjectId (defaults to synced appId or cases file appId)'
        }
      ],
      options: [
        WORKFLOW_DIR_OPTION,
        {
          name: 'appId',
          flags: '--app-id <appId>',
          takesValue: true,
          description: 'Target App ObjectId'
        },
        {
          name: 'remote',
          flags: '--remote',
          takesValue: false,
          description: 'Test remote App draft instead of local workflow.json'
        },
        {
          name: 'cases',
          flags: '--cases <path>',
          takesValue: true,
          description: 'Test cases JSON file path ("-" for stdin)'
        },
        {
          name: 'query',
          flags: '--query <text>',
          takesValue: true,
          description: 'Run a quick single-case smoke test with query text'
        },
        {
          name: 'variables',
          flags: '--variables <json>',
          takesValue: true,
          description: 'Default variables JSON object merged into each case'
        },
        {
          name: 'failFast',
          flags: '--fail-fast',
          takesValue: false,
          description: 'Stop after the first failed test case'
        },
        {
          name: 'timeout',
          flags: '--timeout <ms>',
          takesValue: true,
          description: 'Per-case debug timeout in milliseconds (default 300000)'
        },
        WORKFLOW_DRY_RUN_OPTION
      ],
      examples: [
        {
          description: 'Run test suite from cases.json',
          args: ['workflow', 'test', '--cases', './workflow-tests.json', '--format', 'json']
        },
        {
          description: 'Run single-query smoke test',
          args: ['workflow', 'test', '--query', 'Hello']
        }
      ],
      execute: async ({ positional, options, client, container }) => {
        const activeClient = requireActiveClient(client, 'workflow test');
        if (options.cases !== undefined && options.query !== undefined) {
          throw new CliArgumentError('--cases and --query are mutually exclusive.');
        }
        const variables = await resolveJsonObjectPayload({
          inlineJson: typeof options.variables === 'string' ? options.variables : undefined,
          readTextFile: container.fileIo.readTextFile,
          readStdin: container.readStdin,
          fieldLabel: 'variables'
        });
        return container.workflowSyncService.test({
          client: activeClient,
          dir: resolveWorkflowDir(options, container.env),
          appId: resolveOptionalAppId(positional, options),
          remote: options.remote === true,
          casesSource: optionalNonEmptyOption(options, 'cases'),
          query: typeof options.query === 'string' ? options.query : undefined,
          variables,
          failFast: options.failFast === true,
          timeoutMs: parseTimeoutMs(options.timeout),
          dryRun: options.dryRun === true
        });
      }
    }
  ];
}
