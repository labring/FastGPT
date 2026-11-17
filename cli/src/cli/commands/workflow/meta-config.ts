import z from 'zod';
import {
  VariableInputEnum,
  WorkflowIOValueTypeEnum
} from '@fastgpt/global/core/workflow/constants';
import { CliArgumentError } from '../../../shared/errors';
import type { CliCommandSpec } from '../../pipeline';
import {
  WORKFLOW_DIR_OPTION,
  WORKFLOW_DRY_RUN_OPTION,
  WORKFLOW_LOCALE_OPTION,
  WORKFLOW_VALUE_OPTIONS,
  countActiveValueOptions,
  extractValueInput,
  optionalNonEmptyOption,
  requireNonEmptyOption,
  resolveWorkflowDir,
  resolveWorkflowLocale
} from './shared';

const VARIABLE_TYPE_VALUES = [...Object.values(VariableInputEnum), 'external'] as const;
const VARIABLE_TYPE_SET = new Set<string>(VARIABLE_TYPE_VALUES);
const VALUE_TYPE_SET = new Set<string>(Object.values(WorkflowIOValueTypeEnum));
const TIME_GRANULARITY_SET = new Set<string>(['day', 'hour', 'minute', 'second']);

const VARIABLE_CONFIG_OPTIONS = [
  {
    name: 'configJson',
    flags: '--config-json <json>',
    takesValue: true,
    description: 'Type-specific variable config as JSON'
  },
  {
    name: 'configFile',
    flags: '--config-file <path>',
    takesValue: true,
    description: 'Read type-specific variable config from JSON file'
  },
  {
    name: 'optionsJson',
    flags: '--options-json <json>',
    takesValue: true,
    description: 'Select options as JSON array'
  },
  { name: 'min', flags: '--min <n>', takesValue: true, description: 'Minimum numeric value' },
  { name: 'max', flags: '--max <n>', takesValue: true, description: 'Maximum numeric value' },
  {
    name: 'maxLength',
    flags: '--max-length <n>',
    takesValue: true,
    description: 'Max text length'
  },
  {
    name: 'timeGranularity',
    flags: '--time-granularity <unit>',
    takesValue: true,
    description: 'Time granularity: day, hour, minute or second'
  }
] as const;

function parseVariableConfigOptions(options: Record<string, unknown>) {
  if (options.configJson !== undefined && options.configFile !== undefined) {
    throw new CliArgumentError('--config-json and --config-file are mutually exclusive.');
  }
  const timeGranularity = optionalNonEmptyOption(options, 'timeGranularity');
  if (timeGranularity !== undefined && !TIME_GRANULARITY_SET.has(timeGranularity)) {
    throw new CliArgumentError('--time-granularity must be one of: day, hour, minute, second.');
  }
  return {
    configJson: optionalNonEmptyOption(options, 'configJson'),
    configFile: optionalNonEmptyOption(options, 'configFile'),
    optionsJson: optionalNonEmptyOption(options, 'optionsJson'),
    min: optionalNonEmptyOption(options, 'min'),
    max: optionalNonEmptyOption(options, 'max'),
    maxLength: optionalNonEmptyOption(options, 'maxLength'),
    timeGranularity: timeGranularity as 'day' | 'hour' | 'minute' | 'second' | undefined
  };
}

/**
 * 工作流元数据、ChatConfig 与全局变量命令组：meta / config / variable。
 */
export function createWorkflowMetaConfigCommandSpecs(): CliCommandSpec[] {
  return [
    {
      path: ['workflow', 'meta', 'show'],
      summary: 'Show application metadata stored in workflow.json',
      risk: 'read',
      authModes: ['none'],
      options: [WORKFLOW_DIR_OPTION],
      examples: [{ description: 'Show workflow metadata', args: ['workflow', 'meta', 'show'] }],
      execute: ({ options, container }) =>
        container.workflowLocalService.metaShow({
          dir: resolveWorkflowDir(options, container.env)
        })
    },

    {
      path: ['workflow', 'meta', 'set'],
      summary: 'Update application name or intro in local workflow.json',
      risk: 'write',
      authModes: ['none'],
      options: [
        WORKFLOW_DIR_OPTION,
        WORKFLOW_LOCALE_OPTION,
        { name: 'name', flags: '--name <name>', takesValue: true, description: 'Application name' },
        {
          name: 'intro',
          flags: '--intro <text>',
          takesValue: true,
          description: 'Application introduction'
        },
        WORKFLOW_DRY_RUN_OPTION
      ],
      examples: [
        {
          description: 'Update local workflow app name',
          args: ['workflow', 'meta', 'set', '--name', 'Order Assistant']
        }
      ],
      execute: ({ options, container }) => {
        const name = optionalNonEmptyOption(options, 'name');
        const intro = typeof options.intro === 'string' ? options.intro : undefined;
        if (name === undefined && intro === undefined) {
          throw new CliArgumentError('At least one of --name or --intro is required.');
        }
        return container.workflowLocalService.metaSet({
          dir: resolveWorkflowDir(options, container.env),
          locale: resolveWorkflowLocale(options, container.env),
          name,
          intro,
          dryRun: options.dryRun === true
        });
      }
    },

    {
      path: ['workflow', 'config', 'list'],
      summary: 'List allowlisted ChatConfig paths and their current values',
      risk: 'read',
      authModes: ['none'],
      options: [WORKFLOW_DIR_OPTION, WORKFLOW_LOCALE_OPTION],
      examples: [
        { description: 'List chatConfig descriptors', args: ['workflow', 'config', 'list'] }
      ],
      execute: ({ options, container }) =>
        container.workflowLocalService.configList({
          dir: resolveWorkflowDir(options, container.env),
          locale: resolveWorkflowLocale(options, container.env)
        })
    },

    {
      path: ['workflow', 'config', 'get'],
      summary: 'Get a single allowlisted ChatConfig field descriptor and value',
      risk: 'read',
      authModes: ['none'],
      options: [
        WORKFLOW_DIR_OPTION,
        WORKFLOW_LOCALE_OPTION,
        {
          name: 'path',
          flags: '--path <path>',
          takesValue: true,
          description: 'Allowlisted ChatConfig path'
        }
      ],
      examples: [
        {
          description: 'Get welcomeText config',
          args: ['workflow', 'config', 'get', '--path', 'welcomeText']
        }
      ],
      execute: ({ options, container }) =>
        container.workflowLocalService.configGet({
          dir: resolveWorkflowDir(options, container.env),
          locale: resolveWorkflowLocale(options, container.env),
          path: requireNonEmptyOption({ options, key: 'path', flagName: '--path' })
        })
    },

    {
      path: ['workflow', 'config', 'set'],
      summary: 'Set an allowlisted ChatConfig path in local workflow.json',
      risk: 'write',
      authModes: ['none'],
      options: [
        WORKFLOW_DIR_OPTION,
        WORKFLOW_LOCALE_OPTION,
        {
          name: 'path',
          flags: '--path <path>',
          takesValue: true,
          description: 'Allowlisted ChatConfig path'
        },
        ...WORKFLOW_VALUE_OPTIONS,
        WORKFLOW_DRY_RUN_OPTION
      ],
      examples: [
        {
          description: 'Set welcomeText',
          args: ['workflow', 'config', 'set', '--path', 'welcomeText', '--value', 'Hello!']
        }
      ],
      execute: ({ options, container }) => {
        if (countActiveValueOptions(options) !== 1) {
          throw new CliArgumentError(
            'Exactly one of --value, --value-json, --value-file, or --value-env is required.'
          );
        }
        return container.workflowLocalService.configSet({
          dir: resolveWorkflowDir(options, container.env),
          locale: resolveWorkflowLocale(options, container.env),
          path: requireNonEmptyOption({ options, key: 'path', flagName: '--path' }),
          valueInput: extractValueInput(options),
          dryRun: options.dryRun === true
        });
      }
    },

    {
      path: ['workflow', 'config', 'unset'],
      summary: 'Unset an allowlisted ChatConfig path in local workflow.json',
      risk: 'write',
      authModes: ['none'],
      options: [
        WORKFLOW_DIR_OPTION,
        WORKFLOW_LOCALE_OPTION,
        {
          name: 'path',
          flags: '--path <path>',
          takesValue: true,
          description: 'Allowlisted ChatConfig path'
        },
        WORKFLOW_DRY_RUN_OPTION
      ],
      examples: [
        {
          description: 'Unset welcomeText',
          args: ['workflow', 'config', 'unset', '--path', 'welcomeText']
        }
      ],
      execute: ({ options, container }) =>
        container.workflowLocalService.configUnset({
          dir: resolveWorkflowDir(options, container.env),
          locale: resolveWorkflowLocale(options, container.env),
          path: requireNonEmptyOption({ options, key: 'path', flagName: '--path' }),
          dryRun: options.dryRun === true
        })
    },

    {
      path: ['workflow', 'variable', 'list'],
      summary: 'List global workflow variables defined in workflow.json',
      risk: 'read',
      authModes: ['none'],
      options: [WORKFLOW_DIR_OPTION],
      examples: [
        { description: 'List workflow variables', args: ['workflow', 'variable', 'list'] }
      ],
      execute: ({ options, container }) =>
        container.workflowLocalService.variableList({
          dir: resolveWorkflowDir(options, container.env)
        })
    },

    {
      path: ['workflow', 'variable', 'add'],
      summary: 'Add a global variable to local workflow.json',
      risk: 'write',
      authModes: ['none'],
      options: [
        WORKFLOW_DIR_OPTION,
        WORKFLOW_LOCALE_OPTION,
        { name: 'key', flags: '--key <key>', takesValue: true, description: 'Variable key' },
        {
          name: 'type',
          flags: '--type <type>',
          takesValue: true,
          description: 'Variable input type; external is an alias for custom'
        },
        {
          name: 'valueType',
          flags: '--value-type <type>',
          takesValue: true,
          description: 'Workflow IO value type'
        },
        {
          name: 'label',
          flags: '--label <label>',
          takesValue: true,
          description: 'Variable label'
        },
        {
          name: 'description',
          flags: '--description <text>',
          takesValue: true,
          description: 'Variable description'
        },
        {
          name: 'required',
          flags: '--required',
          takesValue: false,
          description: 'Mark variable as required'
        },
        ...VARIABLE_CONFIG_OPTIONS,
        ...WORKFLOW_VALUE_OPTIONS,
        WORKFLOW_DRY_RUN_OPTION
      ],
      examples: [
        {
          description: 'Add a required string variable',
          args: [
            'workflow',
            'variable',
            'add',
            '--key',
            'city',
            '--value-type',
            'string',
            '--required'
          ]
        }
      ],
      execute: ({ options, container }) => {
        const key = requireNonEmptyOption({ options, key: 'key', flagName: '--key' });
        const valueType = requireNonEmptyOption({
          options,
          key: 'valueType',
          flagName: '--value-type'
        });
        if (!VALUE_TYPE_SET.has(valueType)) {
          throw new CliArgumentError(`Invalid --value-type "${valueType}".`);
        }
        const varType = optionalNonEmptyOption(options, 'type');
        if (varType !== undefined && !VARIABLE_TYPE_SET.has(varType)) {
          throw new CliArgumentError(`Invalid --type "${varType}".`);
        }
        if (countActiveValueOptions(options) > 1) {
          throw new CliArgumentError(
            'Value options (--value/--value-json/--value-file/--value-env) are exclusive.'
          );
        }
        return container.workflowLocalService.variableAdd({
          dir: resolveWorkflowDir(options, container.env),
          locale: resolveWorkflowLocale(options, container.env),
          key,
          valueType: z.enum(WorkflowIOValueTypeEnum).parse(valueType),
          type: varType,
          label: optionalNonEmptyOption(options, 'label'),
          description: typeof options.description === 'string' ? options.description : undefined,
          required: options.required === true,
          valueInput: extractValueInput(options),
          configInput: parseVariableConfigOptions(options),
          dryRun: options.dryRun === true
        });
      }
    },

    {
      path: ['workflow', 'variable', 'update'],
      summary: 'Update a global variable in local workflow.json',
      risk: 'write',
      authModes: ['none'],
      options: [
        WORKFLOW_DIR_OPTION,
        WORKFLOW_LOCALE_OPTION,
        {
          name: 'key',
          flags: '--key <key>',
          takesValue: true,
          description: 'Existing variable key'
        },
        { name: 'newKey', flags: '--new-key <key>', takesValue: true, description: 'New key' },
        {
          name: 'type',
          flags: '--type <type>',
          takesValue: true,
          description: 'Variable input type'
        },
        {
          name: 'valueType',
          flags: '--value-type <type>',
          takesValue: true,
          description: 'Workflow IO value type'
        },
        {
          name: 'label',
          flags: '--label <label>',
          takesValue: true,
          description: 'Variable label'
        },
        {
          name: 'description',
          flags: '--description <text>',
          takesValue: true,
          description: 'Variable description'
        },
        {
          name: 'required',
          flags: '--required',
          takesValue: false,
          description: 'Mark variable as required'
        },
        {
          name: 'optional',
          flags: '--optional',
          takesValue: false,
          description: 'Mark variable as optional'
        },
        ...VARIABLE_CONFIG_OPTIONS,
        ...WORKFLOW_VALUE_OPTIONS,
        WORKFLOW_DRY_RUN_OPTION
      ],
      examples: [
        {
          description: 'Update variable label',
          args: ['workflow', 'variable', 'update', '--key', 'city', '--label', 'Target City']
        }
      ],
      execute: ({ options, container }) => {
        const key = requireNonEmptyOption({ options, key: 'key', flagName: '--key' });
        if (options.required === true && options.optional === true) {
          throw new CliArgumentError('--required and --optional are mutually exclusive.');
        }
        if (countActiveValueOptions(options) > 1) {
          throw new CliArgumentError('Value options are mutually exclusive.');
        }
        const valueType = optionalNonEmptyOption(options, 'valueType');
        if (valueType !== undefined && !VALUE_TYPE_SET.has(valueType)) {
          throw new CliArgumentError(`Invalid --value-type "${valueType}".`);
        }
        const varType = optionalNonEmptyOption(options, 'type');
        if (varType !== undefined && !VARIABLE_TYPE_SET.has(varType)) {
          throw new CliArgumentError(`Invalid --type "${varType}".`);
        }
        const configInput = parseVariableConfigOptions(options);
        const hasUpdate = [
          options.newKey,
          options.type,
          options.valueType,
          options.label,
          options.description,
          options.required,
          options.optional,
          options.configJson,
          options.configFile,
          options.optionsJson,
          options.min,
          options.max,
          options.maxLength,
          options.timeGranularity,
          options.value,
          options.valueJson,
          options.valueFile,
          options.valueEnv
        ].some((item) => item !== undefined);
        if (!hasUpdate) {
          throw new CliArgumentError('At least one update option is required.');
        }

        return container.workflowLocalService.variableUpdate({
          dir: resolveWorkflowDir(options, container.env),
          locale: resolveWorkflowLocale(options, container.env),
          key,
          newKey: optionalNonEmptyOption(options, 'newKey'),
          valueType: valueType ? z.enum(WorkflowIOValueTypeEnum).parse(valueType) : undefined,
          type: varType,
          label: optionalNonEmptyOption(options, 'label'),
          description: typeof options.description === 'string' ? options.description : undefined,
          required: options.required === true ? true : undefined,
          optional: options.optional === true ? true : undefined,
          valueInput: extractValueInput(options),
          configInput,
          dryRun: options.dryRun === true
        });
      }
    },

    {
      path: ['workflow', 'variable', 'remove'],
      summary: 'Remove a global variable from local workflow.json',
      risk: 'write',
      authModes: ['none'],
      options: [
        WORKFLOW_DIR_OPTION,
        WORKFLOW_LOCALE_OPTION,
        { name: 'key', flags: '--key <key>', takesValue: true, description: 'Variable key' },
        WORKFLOW_DRY_RUN_OPTION
      ],
      examples: [
        {
          description: 'Remove variable "city"',
          args: ['workflow', 'variable', 'remove', '--key', 'city']
        }
      ],
      execute: ({ options, container }) =>
        container.workflowLocalService.variableRemove({
          dir: resolveWorkflowDir(options, container.env),
          locale: resolveWorkflowLocale(options, container.env),
          key: requireNonEmptyOption({ options, key: 'key', flagName: '--key' }),
          dryRun: options.dryRun === true
        })
    }
  ];
}
