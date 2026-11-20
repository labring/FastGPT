import { CliArgumentError } from '../../shared/errors';
import { resolveJsonObjectPayload } from '../../shared/input';
import type { CliCommandSpec } from '../pipeline';
import { createAppListCommandSpec } from './app/list';
import { requireActiveClient } from './dataset/shared';
import {
  WORKFLOW_DIR_OPTION,
  WORKFLOW_DRY_RUN_OPTION,
  WORKFLOW_LOCALE_OPTION,
  optionalNonEmptyOption,
  parseWorkflowTimeoutMs,
  resolveWorkflowAppId,
  resolveWorkflowDir,
  resolveWorkflowLocale
} from './workflow/shared';

/** 注册应用资源查询，以及复用工作流工作区的拉取、保存、发布和测试命令。 */
export function createAppCommandSpecs(): CliCommandSpec[] {
  return [
    createAppListCommandSpec(),
    {
      path: ['app', 'pull'],
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
          description: 'Overwrite local changes that have not been saved remotely'
        },
        WORKFLOW_DRY_RUN_OPTION
      ],
      examples: [
        {
          description: 'Pull latest draft workflow for an App',
          args: ['app', 'pull', '68ad85a7463006c963799a05']
        },
        {
          description: 'Pull a specific version',
          args: [
            'app',
            'pull',
            '68ad85a7463006c963799a05',
            '--version-id',
            '68ad85a7463006c963799a09'
          ]
        }
      ],
      execute: ({ positional, options, client, container }) =>
        container.workflowSyncService.pull({
          client: requireActiveClient(client, 'app pull'),
          dir: resolveWorkflowDir(options, container.env),
          locale: resolveWorkflowLocale(options, container.env),
          appId: resolveWorkflowAppId(positional, options),
          versionId: optionalNonEmptyOption(options, 'versionId'),
          force: options.force === true,
          dryRun: options.dryRun === true
        })
    },

    {
      path: ['app', 'save'],
      summary: 'Validate local workflow.json and save it as the remote App draft',
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
        { description: 'Save local workflow.json as the remote App draft', args: ['app', 'save'] },
        {
          description: 'Preview saving the App draft',
          args: ['app', 'save', '--dry-run']
        }
      ],
      execute: ({ positional, options, client, container }) =>
        container.workflowSyncService.save({
          client: requireActiveClient(client, 'app save'),
          dir: resolveWorkflowDir(options, container.env),
          appId: resolveWorkflowAppId(positional, options),
          force: options.force === true,
          dryRun: options.dryRun === true
        })
    },

    {
      path: ['app', 'publish'],
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
          args: ['app', 'publish', '--version-name', 'v1.2.0']
        }
      ],
      execute: ({ positional, options, client, container }) =>
        container.workflowSyncService.publish({
          client: requireActiveClient(client, 'app publish'),
          dir: resolveWorkflowDir(options, container.env),
          appId: resolveWorkflowAppId(positional, options),
          versionName: optionalNonEmptyOption(options, 'versionName'),
          force: options.force === true,
          dryRun: options.dryRun === true
        })
    },

    {
      path: ['app', 'test'],
      summary:
        'Run debug assertions against local workflow.json or the remote App draft, one step per case',
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
          args: ['app', 'test', '--cases', './workflow-tests.json', '--format', 'json']
        },
        {
          description: 'Run single-query smoke test',
          args: ['app', 'test', '--query', 'Hello']
        }
      ],
      execute: async ({ positional, options, client, container }) => {
        const activeClient = requireActiveClient(client, 'app test');
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
          appId: resolveWorkflowAppId(positional, options),
          remote: options.remote === true,
          casesSource: optionalNonEmptyOption(options, 'cases'),
          query: typeof options.query === 'string' ? options.query : undefined,
          variables,
          failFast: options.failFast === true,
          timeoutMs: parseWorkflowTimeoutMs(options.timeout),
          dryRun: options.dryRun === true
        });
      }
    }
  ];
}
