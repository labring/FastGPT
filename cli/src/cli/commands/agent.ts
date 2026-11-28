import { CliArgumentError } from '../../shared/errors';
import { parseInlineJsonValue, resolveJsonObjectPayload } from '../../shared/input';
import type { CliCommandSpec } from '../pipeline';
import { createAgentFolderCommandSpecs } from './agent/folder';
import { createAgentLifecycleCommandSpecs } from './agent/lifecycle';
import { createAgentLogsCommandSpecs } from './agent/logs';
import { createAgentVersionCommandSpecs } from './agent/version';
import { requireActiveClient } from './shared/helpers';
import {
  WORKFLOW_DIR_OPTION,
  WORKFLOW_DRY_RUN_OPTION,
  WORKFLOW_LOCALE_OPTION,
  optionalNonEmptyOption,
  parseWorkflowTimeoutMs,
  resolveWorkflowAppId,
  resolveWorkflowDir,
  resolveWorkflowLocale
} from './shared/workflow-options';

/** 注册 FastGPT Agent 全部命令：生命周期、目录、版本历史、对话日志，以及工作流拉取/保存/发布/测试。 */
export function createAgentCommandSpecs(): CliCommandSpec[] {
  return [
    ...createAgentLifecycleCommandSpecs(),
    ...createAgentFolderCommandSpecs(),
    ...createAgentVersionCommandSpecs(),
    ...createAgentLogsCommandSpecs(),
    {
      path: ['agent', 'pull'],
      summary: 'Pull an Agent draft or specific version from FastGPT into local workflow.json',
      risk: 'write',
      authModes: ['token'],
      positionalArgs: [
        { name: 'agentId', required: false, description: 'Target Agent ObjectId (or use --id)' }
      ],
      options: [
        WORKFLOW_DIR_OPTION,
        WORKFLOW_LOCALE_OPTION,
        {
          name: 'id',
          flags: '--id <agentId>',
          takesValue: true,
          description: 'Target Agent ObjectId'
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
          description: 'Overwrite local changes that have not been saved remotely'
        },
        WORKFLOW_DRY_RUN_OPTION
      ],
      examples: [
        {
          description: 'Pull latest draft workflow for an Agent',
          args: ['agent', 'pull', '68ad85a7463006c963799a05']
        },
        {
          description: 'Pull a specific version',
          args: [
            'agent',
            'pull',
            '68ad85a7463006c963799a05',
            '--version-id',
            '68ad85a7463006c963799a09'
          ]
        }
      ],
      execute: ({ positional, options, client, container }) =>
        container.workflowSyncService.pull({
          client: requireActiveClient(client, 'agent pull'),
          dir: resolveWorkflowDir(options, container.env),
          locale: resolveWorkflowLocale(options, container.env),
          appId: resolveWorkflowAppId(positional, options),
          versionId: optionalNonEmptyOption(options, 'versionId'),
          force: options.force === true,
          dryRun: options.dryRun === true
        })
    },

    {
      path: ['agent', 'save'],
      summary: 'Validate local workflow.json and save it as the remote Agent draft',
      risk: 'write',
      authModes: ['token'],
      positionalArgs: [
        {
          name: 'agentId',
          required: false,
          description: 'Target Agent ObjectId (defaults to synced appId)'
        }
      ],
      options: [
        WORKFLOW_DIR_OPTION,
        {
          name: 'id',
          flags: '--id <agentId>',
          takesValue: true,
          description: 'Target Agent ObjectId'
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
          description: 'Save local workflow.json as the remote Agent draft',
          args: ['agent', 'save']
        },
        {
          description: 'Preview saving the Agent draft',
          args: ['agent', 'save', '--dry-run']
        }
      ],
      execute: ({ positional, options, client, container }) =>
        container.workflowSyncService.save({
          client: requireActiveClient(client, 'agent save'),
          dir: resolveWorkflowDir(options, container.env),
          appId: resolveWorkflowAppId(positional, options),
          force: options.force === true,
          dryRun: options.dryRun === true
        })
    },

    {
      path: ['agent', 'publish'],
      summary: 'Validate local workflow.json and publish a new live Agent version',
      risk: 'write',
      authModes: ['token'],
      positionalArgs: [
        {
          name: 'agentId',
          required: false,
          description: 'Target Agent ObjectId (defaults to synced appId)'
        }
      ],
      options: [
        WORKFLOW_DIR_OPTION,
        {
          name: 'id',
          flags: '--id <agentId>',
          takesValue: true,
          description: 'Target Agent ObjectId'
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
          args: ['agent', 'publish', '--version-name', 'v1.2.0']
        }
      ],
      execute: ({ positional, options, client, container }) =>
        container.workflowSyncService.publish({
          client: requireActiveClient(client, 'agent publish'),
          dir: resolveWorkflowDir(options, container.env),
          appId: resolveWorkflowAppId(positional, options),
          versionName: optionalNonEmptyOption(options, 'versionName'),
          force: options.force === true,
          dryRun: options.dryRun === true
        })
    },

    {
      path: ['agent', 'test'],
      summary:
        'Run a full end-to-end draft or local workflow conversation test via /core/chat/chatTest',
      risk: 'write',
      authModes: ['token'],
      positionalArgs: [
        {
          name: 'agentId',
          required: false,
          description: 'Target Agent ObjectId (defaults to synced workspace appId)'
        }
      ],
      options: [
        {
          name: 'id',
          flags: '--id <agentId>',
          takesValue: true,
          description: 'Target Agent ObjectId (alternative to positional argument)'
        },
        {
          name: 'text',
          flags: '--text <text>',
          takesValue: true,
          description: 'User message text; mutually exclusive with --messages'
        },
        {
          name: 'messages',
          flags: '--messages <json>',
          takesValue: true,
          description: 'OpenAI-format message array JSON'
        },
        {
          name: 'chatId',
          flags: '--chat-id <chatId>',
          takesValue: true,
          description: 'Test conversation ID for multi-turn debugging (auto-generated if omitted)'
        },
        {
          name: 'variables',
          flags: '--variables <json>',
          takesValue: true,
          description: 'Global variables JSON object'
        },
        {
          name: 'detail',
          flags: '--detail',
          takesValue: false,
          description: 'Include per-node execution responses in output'
        },
        {
          name: 'local',
          flags: '--local',
          takesValue: false,
          description:
            'Force testing local workflow.json (default when workflow.json exists in --dir)'
        },
        {
          name: 'remote',
          flags: '--remote',
          takesValue: false,
          description: 'Force testing remote Agent draft instead of local workflow.json'
        },
        WORKFLOW_DIR_OPTION,
        {
          name: 'file',
          flags: '--file <path>',
          takesValue: true,
          description: 'Read JSON payload (messages/variables/chatId) from file ("-" for stdin)'
        },
        {
          name: 'stdin',
          flags: '--stdin',
          takesValue: false,
          description: 'Read JSON payload from stdin'
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
          description: 'Test remote Agent draft with a single user prompt',
          args: ['agent', 'test', '68ad85a7463006c963799a05', '--text', 'Hello']
        },
        {
          description: 'Test local workflow.json with node details enabled',
          args: ['agent', 'test', '--local', '--text', 'Hello', '--detail']
        }
      ],
      execute: async ({ positional, options, client, container }) => {
        const activeClient = requireActiveClient(client, 'agent test');
        const filePayload = await resolveJsonObjectPayload({
          filePath: typeof options.file === 'string' ? options.file : undefined,
          useStdin: options.stdin === true,
          readTextFile: container.fileIo.readTextFile,
          readStdin: container.readStdin,
          fieldLabel: 'agent test payload'
        });

        if (options.text !== undefined && options.messages !== undefined) {
          throw new CliArgumentError('--text and --messages are mutually exclusive.');
        }

        const messages = (() => {
          if (typeof options.text === 'string') {
            if (filePayload?.messages !== undefined) {
              throw new CliArgumentError('Use either --text or messages in JSON payload.');
            }
            return [{ role: 'user', content: options.text }];
          }
          if (typeof options.messages === 'string') {
            const parsed = parseInlineJsonValue(options.messages, '--messages');
            if (!Array.isArray(parsed)) {
              throw new CliArgumentError('--messages must be a JSON array.');
            }
            return parsed;
          }
          if (Array.isArray(filePayload?.messages)) {
            return filePayload.messages;
          }
          return [];
        })();

        const flagVariables = await resolveJsonObjectPayload({
          inlineJson: typeof options.variables === 'string' ? options.variables : undefined,
          readTextFile: container.fileIo.readTextFile,
          readStdin: container.readStdin,
          fieldLabel: 'variables'
        });
        const mergedVariables =
          filePayload?.variables &&
          typeof filePayload.variables === 'object' &&
          !Array.isArray(filePayload.variables)
            ? { ...(filePayload.variables as Record<string, unknown>), ...(flagVariables ?? {}) }
            : flagVariables;

        const explicitAppId =
          positional[0] ??
          optionalNonEmptyOption(options, 'id') ??
          (typeof filePayload?.appId === 'string' ? filePayload.appId : undefined);

        return container.workflowSyncService.chatTest({
          client: activeClient,
          dir: resolveWorkflowDir(options, container.env),
          appId: explicitAppId,
          local: options.local === true,
          remote: options.remote === true,
          messages,
          chatId:
            optionalNonEmptyOption(options, 'chatId') ??
            (typeof filePayload?.chatId === 'string' ? filePayload.chatId : undefined),
          variables: mergedVariables,
          responseChatItemId:
            typeof filePayload?.responseChatItemId === 'string'
              ? filePayload.responseChatItemId
              : undefined,
          detail: options.detail === true,
          timeoutMs: parseWorkflowTimeoutMs(options.timeout),
          dryRun: options.dryRun === true
        });
      }
    }
  ];
}
