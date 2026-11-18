import z from 'zod';
import { ChatItemMiniSchema } from '@fastgpt/global/core/chat/type';
import { CliArgumentError } from '../../../shared/errors';
import {
  parseIdListOption,
  resolveJsonObjectPayload,
  resolveJsonPayload
} from '../../../shared/input';
import type { CliCommandSpec } from '../../pipeline';
import { requireActiveClient } from '../dataset/shared';
import {
  WORKFLOW_DIR_OPTION,
  WORKFLOW_DRY_RUN_OPTION,
  optionalNonEmptyOption,
  parseWorkflowTimeoutMs,
  resolveWorkflowAppId,
  resolveWorkflowDir
} from './shared';

/** 注册工作流图的远端对比和单步调试命令。 */
export function createWorkflowSyncCommandSpecs(): CliCommandSpec[] {
  return [
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
          appId: resolveWorkflowAppId(positional, options)
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
          appId: resolveWorkflowAppId(positional, options),
          remote: options.remote === true,
          query: typeof options.query === 'string' ? options.query : undefined,
          variables,
          history,
          entryNodes: parseIdListOption(options.entryNodes),
          chatId: optionalNonEmptyOption(options, 'chatId'),
          usageId: optionalNonEmptyOption(options, 'usageId'),
          timeoutMs: parseWorkflowTimeoutMs(options.timeout),
          dryRun: options.dryRun === true
        });
      }
    }
  ];
}
