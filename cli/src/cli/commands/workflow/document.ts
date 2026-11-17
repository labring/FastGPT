import type { CliCommandSpec } from '../../pipeline';
import {
  WORKFLOW_DIR_OPTION,
  WORKFLOW_DRY_RUN_OPTION,
  WORKFLOW_LOCALE_OPTION,
  optionalNonEmptyOption,
  requireNonEmptyOption,
  resolveWorkflowDir,
  resolveWorkflowLocale
} from './shared';

/**
 * 工作流文档生命周期命令：init / build / import / inspect / validate。
 */
export function createWorkflowDocumentCommandSpecs(): CliCommandSpec[] {
  return [
    {
      path: ['workflow', 'init'],
      summary: 'Initialize a new local workflow.json workspace',
      risk: 'write',
      authModes: ['none'],
      options: [
        WORKFLOW_DIR_OPTION,
        WORKFLOW_LOCALE_OPTION,
        { name: 'name', flags: '--name <name>', takesValue: true, description: 'Workflow name' },
        WORKFLOW_DRY_RUN_OPTION
      ],
      examples: [
        {
          description: 'Initialize workflow.json in current directory',
          args: ['workflow', 'init']
        },
        {
          description: 'Initialize a named workflow in ./my-flow',
          args: ['workflow', 'init', '--dir', './my-flow', '--name', 'Customer Support']
        }
      ],
      execute: ({ options, container }) =>
        container.workflowLocalService.init({
          dir: resolveWorkflowDir(options, container.env),
          locale: resolveWorkflowLocale(options, container.env),
          name: optionalNonEmptyOption(options, 'name'),
          dryRun: options.dryRun === true
        })
    },

    {
      path: ['workflow', 'build'],
      summary: 'Validate local workflow.json and compile it to StoreWorkflow JSON',
      risk: 'write',
      authModes: ['none'],
      options: [
        WORKFLOW_DIR_OPTION,
        {
          name: 'output',
          flags: '--output <path>',
          takesValue: true,
          description: 'Output file path for compiled StoreWorkflow JSON'
        },
        WORKFLOW_DRY_RUN_OPTION
      ],
      examples: [
        {
          description: 'Build workflow.json into store-workflow.json',
          args: ['workflow', 'build', '--output', './store-workflow.json']
        }
      ],
      execute: ({ options, container }) =>
        container.workflowLocalService.build({
          dir: resolveWorkflowDir(options, container.env),
          output: requireNonEmptyOption({ options, key: 'output', flagName: '--output' }),
          dryRun: options.dryRun === true
        })
    },

    {
      path: ['workflow', 'import'],
      summary: 'Decompile a StoreWorkflow JSON file into local workflow.json',
      risk: 'write',
      authModes: ['none'],
      options: [
        WORKFLOW_DIR_OPTION,
        WORKFLOW_LOCALE_OPTION,
        {
          name: 'input',
          flags: '--input <path>',
          takesValue: true,
          description: 'StoreWorkflow JSON input path ("-" for stdin)'
        },
        WORKFLOW_DRY_RUN_OPTION
      ],
      examples: [
        {
          description: 'Import StoreWorkflow JSON into workflow.json',
          args: ['workflow', 'import', '--input', './store-workflow.json']
        }
      ],
      execute: ({ options, container }) =>
        container.workflowLocalService.importWorkflow({
          dir: resolveWorkflowDir(options, container.env),
          locale: resolveWorkflowLocale(options, container.env),
          inputPath: requireNonEmptyOption({ options, key: 'input', flagName: '--input' }),
          dryRun: options.dryRun === true
        })
    },

    {
      path: ['workflow', 'inspect'],
      summary: 'Inspect local workflow.json structure, bindings, references, and diagnostics',
      risk: 'read',
      authModes: ['none'],
      options: [WORKFLOW_DIR_OPTION],
      examples: [
        {
          description: 'Inspect local workflow in JSON format',
          args: ['workflow', 'inspect', '--format', 'json']
        }
      ],
      execute: ({ options, container }) =>
        container.workflowLocalService.inspect({
          dir: resolveWorkflowDir(options, container.env)
        })
    },

    {
      path: ['workflow', 'validate'],
      summary: 'Validate local workflow.json graph, references, and bindings',
      risk: 'read',
      authModes: ['none'],
      options: [WORKFLOW_DIR_OPTION],
      examples: [
        {
          description: 'Validate workflow.json before pushing or publishing',
          args: ['workflow', 'validate']
        }
      ],
      execute: ({ options, container }) =>
        container.workflowLocalService.validate({
          dir: resolveWorkflowDir(options, container.env)
        })
    }
  ];
}
