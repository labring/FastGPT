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
 * ChangeSet 事务计划与校验应用命令组：changeset plan / changeset apply。
 */
export function createWorkflowChangesetCommandSpecs(): CliCommandSpec[] {
  return [
    {
      path: ['workflow', 'changeset', 'plan'],
      summary: 'Compute and validate a deterministic WorkflowPlan from a ChangeSet JSON',
      risk: 'read',
      authModes: ['none'],
      options: [
        WORKFLOW_DIR_OPTION,
        WORKFLOW_LOCALE_OPTION,
        {
          name: 'input',
          flags: '--input <path>',
          takesValue: true,
          description: 'ChangeSet JSON path ("-" for stdin)'
        },
        {
          name: 'output',
          flags: '--output <path>',
          takesValue: true,
          description: 'Optional output path to write WorkflowPlan JSON'
        }
      ],
      examples: [
        {
          description: 'Generate a validated workflow plan from changeset.json',
          args: [
            'workflow',
            'changeset',
            'plan',
            '--input',
            './changeset.json',
            '--output',
            './plan.json'
          ]
        }
      ],
      execute: ({ options, container }) =>
        container.workflowLocalService.changesetPlan({
          dir: resolveWorkflowDir(options, container.env),
          locale: resolveWorkflowLocale(options, container.env),
          inputSource: requireNonEmptyOption(options, 'input', '--input'),
          output: optionalNonEmptyOption(options, 'output')
        })
    },

    {
      path: ['workflow', 'changeset', 'apply'],
      summary: 'Recompute, verify checksums, and atomically apply a WorkflowPlan to workflow.json',
      risk: 'write',
      authModes: ['none'],
      options: [
        WORKFLOW_DIR_OPTION,
        WORKFLOW_LOCALE_OPTION,
        {
          name: 'plan',
          flags: '--plan <path>',
          takesValue: true,
          description: 'WorkflowPlan JSON path ("-" for stdin)'
        },
        {
          name: 'confirm',
          flags: '--confirm <checksum>',
          takesValue: true,
          description: 'Expected targetChecksum (sha256:...) required in non-interactive mode'
        },
        {
          name: 'yes',
          flags: '--yes',
          takesValue: false,
          description: 'Skip interactive confirmation prompt in TTY mode'
        },
        WORKFLOW_DRY_RUN_OPTION
      ],
      examples: [
        {
          description: 'Apply a plan non-interactively with target checksum confirmation',
          args: [
            'workflow',
            'changeset',
            'apply',
            '--plan',
            './plan.json',
            '--confirm',
            'sha256:...'
          ]
        }
      ],
      execute: ({ options, container }) =>
        container.workflowLocalService.changesetApply({
          dir: resolveWorkflowDir(options, container.env),
          locale: resolveWorkflowLocale(options, container.env),
          planSource: requireNonEmptyOption(options, 'plan', '--plan'),
          confirm: optionalNonEmptyOption(options, 'confirm'),
          yes: options.yes === true,
          dryRun: options.dryRun === true
        })
    }
  ];
}
