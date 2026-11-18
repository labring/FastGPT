import z from 'zod';
import { WorkflowIOValueTypeEnum } from '@fastgpt/global/core/workflow/constants';
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
} from '../workflow/shared';

const VALUE_TYPE_SET = new Set<string>(Object.values(WorkflowIOValueTypeEnum));
const INPUT_MODE_SET = new Set<string>(['literal', 'reference', 'both']);

/**
 * 节点输入、输出与工具挂载命令组：input / output / tool。
 */
export function createWorkflowIoToolCommandSpecs(): CliCommandSpec[] {
  return [
    {
      path: ['workflow-build', 'input', 'list'],
      summary: 'List all inputs of a workflow node',
      risk: 'read',
      authModes: ['none'],
      options: [
        WORKFLOW_DIR_OPTION,
        { name: 'node', flags: '--node <nodeId>', takesValue: true, description: 'Node ID' }
      ],
      examples: [
        {
          description: 'List inputs on chat1',
          args: ['workflow-build', 'input', 'list', '--node', 'chat1']
        }
      ],
      execute: ({ options, container }) =>
        container.workflowLocalService.inputList({
          dir: resolveWorkflowDir(options, container.env),
          nodeId: requireNonEmptyOption({ options, key: 'node', flagName: '--node' })
        })
    },

    {
      path: ['workflow-build', 'input', 'show'],
      summary: 'Show details of a single node input (redacting password values)',
      risk: 'read',
      authModes: ['none'],
      options: [
        WORKFLOW_DIR_OPTION,
        { name: 'node', flags: '--node <nodeId>', takesValue: true, description: 'Node ID' },
        { name: 'key', flags: '--key <inputKey>', takesValue: true, description: 'Input key' }
      ],
      examples: [
        {
          description: 'Inspect userChatInput on chat1',
          args: ['workflow-build', 'input', 'show', '--node', 'chat1', '--key', 'userChatInput']
        }
      ],
      execute: ({ options, container }) =>
        container.workflowLocalService.inputShow({
          dir: resolveWorkflowDir(options, container.env),
          nodeId: requireNonEmptyOption({ options, key: 'node', flagName: '--node' }),
          key: requireNonEmptyOption({ options, key: 'key', flagName: '--key' })
        })
    },

    {
      path: ['workflow-build', 'input', 'add'],
      summary: 'Add a dynamic input field to a workflow node',
      risk: 'write',
      authModes: ['none'],
      options: [
        WORKFLOW_DIR_OPTION,
        WORKFLOW_LOCALE_OPTION,
        { name: 'node', flags: '--node <nodeId>', takesValue: true, description: 'Node ID' },
        { name: 'key', flags: '--key <inputKey>', takesValue: true, description: 'New input key' },
        {
          name: 'valueType',
          flags: '--value-type <type>',
          takesValue: true,
          description: 'Workflow value type'
        },
        {
          name: 'mode',
          flags: '--mode <mode>',
          takesValue: true,
          description: 'Input mode: literal, reference, or both'
        },
        { name: 'label', flags: '--label <label>', takesValue: true, description: 'Input label' },
        {
          name: 'description',
          flags: '--description <text>',
          takesValue: true,
          description: 'Input description'
        },
        {
          name: 'required',
          flags: '--required',
          takesValue: false,
          description: 'Mark input as required'
        },
        WORKFLOW_DRY_RUN_OPTION
      ],
      examples: [
        {
          description: 'Add a dynamic string input to code1',
          args: [
            'workflow-build',
            'input',
            'add',
            '--node',
            'code1',
            '--key',
            'query',
            '--value-type',
            'string',
            '--mode',
            'both'
          ]
        }
      ],
      execute: ({ options, container }) => {
        const valueType = requireNonEmptyOption({
          options,
          key: 'valueType',
          flagName: '--value-type'
        });
        if (!VALUE_TYPE_SET.has(valueType)) {
          throw new CliArgumentError(`Invalid --value-type "${valueType}".`);
        }
        const mode = requireNonEmptyOption({ options, key: 'mode', flagName: '--mode' });
        if (!INPUT_MODE_SET.has(mode)) {
          throw new CliArgumentError('--mode must be one of: literal, reference, both.');
        }
        return container.workflowLocalService.inputAdd({
          dir: resolveWorkflowDir(options, container.env),
          locale: resolveWorkflowLocale(options, container.env),
          nodeId: requireNonEmptyOption({ options, key: 'node', flagName: '--node' }),
          key: requireNonEmptyOption({ options, key: 'key', flagName: '--key' }),
          valueType: z.enum(WorkflowIOValueTypeEnum).parse(valueType),
          mode: mode as 'literal' | 'reference' | 'both',
          label: optionalNonEmptyOption(options, 'label'),
          description: typeof options.description === 'string' ? options.description : undefined,
          required: options.required === true,
          dryRun: options.dryRun === true
        });
      }
    },

    {
      path: ['workflow-build', 'input', 'remove'],
      summary: 'Remove a dynamic input field from a workflow node',
      risk: 'write',
      authModes: ['none'],
      options: [
        WORKFLOW_DIR_OPTION,
        WORKFLOW_LOCALE_OPTION,
        { name: 'node', flags: '--node <nodeId>', takesValue: true, description: 'Node ID' },
        {
          name: 'key',
          flags: '--key <inputKey>',
          takesValue: true,
          description: 'Dynamic input key'
        },
        WORKFLOW_DRY_RUN_OPTION
      ],
      examples: [
        {
          description: 'Remove dynamic input query from code1',
          args: ['workflow-build', 'input', 'remove', '--node', 'code1', '--key', 'query']
        }
      ],
      execute: ({ options, container }) =>
        container.workflowLocalService.inputRemove({
          dir: resolveWorkflowDir(options, container.env),
          locale: resolveWorkflowLocale(options, container.env),
          nodeId: requireNonEmptyOption({ options, key: 'node', flagName: '--node' }),
          key: requireNonEmptyOption({ options, key: 'key', flagName: '--key' }),
          dryRun: options.dryRun === true
        })
    },

    {
      path: ['workflow-build', 'input', 'set'],
      summary: 'Set a literal value on a workflow node input',
      risk: 'write',
      authModes: ['none'],
      options: [
        WORKFLOW_DIR_OPTION,
        WORKFLOW_LOCALE_OPTION,
        { name: 'node', flags: '--node <nodeId>', takesValue: true, description: 'Node ID' },
        { name: 'key', flags: '--key <inputKey>', takesValue: true, description: 'Input key' },
        ...WORKFLOW_VALUE_OPTIONS,
        WORKFLOW_DRY_RUN_OPTION
      ],
      examples: [
        {
          description: 'Set systemPrompt on chat1',
          args: [
            'workflow-build',
            'input',
            'set',
            '--node',
            'chat1',
            '--key',
            'systemPrompt',
            '--value',
            'Be concise.'
          ]
        }
      ],
      execute: ({ options, container }) => {
        if (countActiveValueOptions(options) !== 1) {
          throw new CliArgumentError(
            'Exactly one of --value, --value-json, --value-file, or --value-env is required.'
          );
        }
        return container.workflowLocalService.inputSet({
          dir: resolveWorkflowDir(options, container.env),
          locale: resolveWorkflowLocale(options, container.env),
          nodeId: requireNonEmptyOption({ options, key: 'node', flagName: '--node' }),
          key: requireNonEmptyOption({ options, key: 'key', flagName: '--key' }),
          valueInput: extractValueInput(options),
          dryRun: options.dryRun === true
        });
      }
    },

    {
      path: ['workflow-build', 'input', 'ref'],
      summary: 'Bind a node input to an upstream node output reference (node.output)',
      risk: 'write',
      authModes: ['none'],
      options: [
        WORKFLOW_DIR_OPTION,
        WORKFLOW_LOCALE_OPTION,
        { name: 'node', flags: '--node <nodeId>', takesValue: true, description: 'Node ID' },
        { name: 'key', flags: '--key <inputKey>', takesValue: true, description: 'Input key' },
        {
          name: 'from',
          flags: '--from <node.output>',
          takesValue: true,
          description: 'Variable reference as node.output'
        },
        WORKFLOW_DRY_RUN_OPTION
      ],
      examples: [
        {
          description: 'Bind userChatInput to workflowStart userChatInput',
          args: [
            'workflow-build',
            'input',
            'ref',
            '--node',
            'chat1',
            '--key',
            'userChatInput',
            '--from',
            'workflowStartNodeId.userChatInput'
          ]
        }
      ],
      execute: ({ options, container }) =>
        container.workflowLocalService.inputRef({
          dir: resolveWorkflowDir(options, container.env),
          locale: resolveWorkflowLocale(options, container.env),
          nodeId: requireNonEmptyOption({ options, key: 'node', flagName: '--node' }),
          key: requireNonEmptyOption({ options, key: 'key', flagName: '--key' }),
          from: requireNonEmptyOption({ options, key: 'from', flagName: '--from' }),
          dryRun: options.dryRun === true
        })
    },

    {
      path: ['workflow-build', 'input', 'unset'],
      summary: 'Clear the configured value or reference of a node input',
      risk: 'write',
      authModes: ['none'],
      options: [
        WORKFLOW_DIR_OPTION,
        WORKFLOW_LOCALE_OPTION,
        { name: 'node', flags: '--node <nodeId>', takesValue: true, description: 'Node ID' },
        { name: 'key', flags: '--key <inputKey>', takesValue: true, description: 'Input key' },
        WORKFLOW_DRY_RUN_OPTION
      ],
      examples: [
        {
          description: 'Unset systemPrompt on chat1',
          args: ['workflow-build', 'input', 'unset', '--node', 'chat1', '--key', 'systemPrompt']
        }
      ],
      execute: ({ options, container }) =>
        container.workflowLocalService.inputUnset({
          dir: resolveWorkflowDir(options, container.env),
          locale: resolveWorkflowLocale(options, container.env),
          nodeId: requireNonEmptyOption({ options, key: 'node', flagName: '--node' }),
          key: requireNonEmptyOption({ options, key: 'key', flagName: '--key' }),
          dryRun: options.dryRun === true
        })
    },

    {
      path: ['workflow-build', 'input', 'available'],
      summary: 'List valid upstream variable references available for a node input',
      risk: 'read',
      authModes: ['none'],
      options: [
        WORKFLOW_DIR_OPTION,
        { name: 'node', flags: '--node <nodeId>', takesValue: true, description: 'Node ID' },
        { name: 'key', flags: '--key <inputKey>', takesValue: true, description: 'Input key' }
      ],
      examples: [
        {
          description: 'List available references for chat1 userChatInput',
          args: [
            'workflow-build',
            'input',
            'available',
            '--node',
            'chat1',
            '--key',
            'userChatInput'
          ]
        }
      ],
      execute: ({ options, container }) =>
        container.workflowLocalService.inputAvailable({
          dir: resolveWorkflowDir(options, container.env),
          nodeId: requireNonEmptyOption({ options, key: 'node', flagName: '--node' }),
          key: requireNonEmptyOption({ options, key: 'key', flagName: '--key' })
        })
    },

    {
      path: ['workflow-build', 'output', 'list'],
      summary: 'List outputs of a workflow node',
      risk: 'read',
      authModes: ['none'],
      options: [
        WORKFLOW_DIR_OPTION,
        { name: 'node', flags: '--node <nodeId>', takesValue: true, description: 'Node ID' }
      ],
      examples: [
        {
          description: 'List outputs on code1',
          args: ['workflow-build', 'output', 'list', '--node', 'code1']
        }
      ],
      execute: ({ options, container }) =>
        container.workflowLocalService.outputList({
          dir: resolveWorkflowDir(options, container.env),
          nodeId: requireNonEmptyOption({ options, key: 'node', flagName: '--node' })
        })
    },

    {
      path: ['workflow-build', 'output', 'add'],
      summary: 'Add a dynamic output field to a workflow node',
      risk: 'write',
      authModes: ['none'],
      options: [
        WORKFLOW_DIR_OPTION,
        WORKFLOW_LOCALE_OPTION,
        { name: 'node', flags: '--node <nodeId>', takesValue: true, description: 'Node ID' },
        { name: 'key', flags: '--key <outputKey>', takesValue: true, description: 'Output key' },
        {
          name: 'valueType',
          flags: '--value-type <type>',
          takesValue: true,
          description: 'Workflow value type'
        },
        { name: 'label', flags: '--label <label>', takesValue: true, description: 'Output label' },
        {
          name: 'description',
          flags: '--description <text>',
          takesValue: true,
          description: 'Output description'
        },
        WORKFLOW_DRY_RUN_OPTION
      ],
      examples: [
        {
          description: 'Add a dynamic string output to code1',
          args: [
            'workflow-build',
            'output',
            'add',
            '--node',
            'code1',
            '--key',
            'summary',
            '--value-type',
            'string'
          ]
        }
      ],
      execute: ({ options, container }) => {
        const valueType = requireNonEmptyOption({
          options,
          key: 'valueType',
          flagName: '--value-type'
        });
        if (!VALUE_TYPE_SET.has(valueType)) {
          throw new CliArgumentError(`Invalid --value-type "${valueType}".`);
        }
        return container.workflowLocalService.outputAdd({
          dir: resolveWorkflowDir(options, container.env),
          locale: resolveWorkflowLocale(options, container.env),
          nodeId: requireNonEmptyOption({ options, key: 'node', flagName: '--node' }),
          key: requireNonEmptyOption({ options, key: 'key', flagName: '--key' }),
          valueType: z.enum(WorkflowIOValueTypeEnum).parse(valueType),
          label: optionalNonEmptyOption(options, 'label'),
          description: typeof options.description === 'string' ? options.description : undefined,
          dryRun: options.dryRun === true
        });
      }
    },

    {
      path: ['workflow-build', 'output', 'remove'],
      summary: 'Remove a dynamic output field from a workflow node',
      risk: 'write',
      authModes: ['none'],
      options: [
        WORKFLOW_DIR_OPTION,
        WORKFLOW_LOCALE_OPTION,
        { name: 'node', flags: '--node <nodeId>', takesValue: true, description: 'Node ID' },
        { name: 'key', flags: '--key <outputKey>', takesValue: true, description: 'Output key' },
        WORKFLOW_DRY_RUN_OPTION
      ],
      examples: [
        {
          description: 'Remove dynamic output summary from code1',
          args: ['workflow-build', 'output', 'remove', '--node', 'code1', '--key', 'summary']
        }
      ],
      execute: ({ options, container }) =>
        container.workflowLocalService.outputRemove({
          dir: resolveWorkflowDir(options, container.env),
          locale: resolveWorkflowLocale(options, container.env),
          nodeId: requireNonEmptyOption({ options, key: 'node', flagName: '--node' }),
          key: requireNonEmptyOption({ options, key: 'key', flagName: '--key' }),
          dryRun: options.dryRun === true
        })
    },

    {
      path: ['workflow-build', 'tool', 'list'],
      summary: 'List tool nodes attached to a tool-call node',
      risk: 'read',
      authModes: ['none'],
      options: [
        WORKFLOW_DIR_OPTION,
        {
          name: 'toolCall',
          flags: '--tool-call <nodeId>',
          takesValue: true,
          description: 'Tool-call node ID'
        }
      ],
      examples: [
        {
          description: 'List attached tools for tools1',
          args: ['workflow-build', 'tool', 'list', '--tool-call', 'tools1']
        }
      ],
      execute: ({ options, container }) =>
        container.workflowLocalService.toolList({
          dir: resolveWorkflowDir(options, container.env),
          toolCallNodeId: requireNonEmptyOption({
            options,
            key: 'toolCall',
            flagName: '--tool-call'
          })
        })
    },

    {
      path: ['workflow-build', 'tool', 'attach'],
      summary: 'Attach a new or existing tool node to a tool-call node',
      risk: 'write',
      authModes: ['none'],
      options: [
        WORKFLOW_DIR_OPTION,
        WORKFLOW_LOCALE_OPTION,
        {
          name: 'toolCall',
          flags: '--tool-call <nodeId>',
          takesValue: true,
          description: 'Tool-call node ID'
        },
        {
          name: 'template',
          flags: '--template <ref>',
          takesValue: true,
          description: 'Create tool node from template'
        },
        {
          name: 'toolNode',
          flags: '--tool-node <nodeId>',
          takesValue: true,
          description: 'Attach existing tool node ID'
        },
        {
          name: 'id',
          flags: '--id <nodeId>',
          takesValue: true,
          description: 'New tool node ID (with --template)'
        },
        {
          name: 'position',
          flags: '--position <x,y>',
          takesValue: true,
          description: 'Canvas position as x,y'
        },
        WORKFLOW_DRY_RUN_OPTION
      ],
      examples: [
        {
          description: 'Attach a new dataset-search tool to tools1',
          args: [
            'workflow-build',
            'tool',
            'attach',
            '--tool-call',
            'tools1',
            '--template',
            'builtin:dataset-search',
            '--id',
            'kb1'
          ]
        }
      ],
      execute: ({ options, container }) => {
        const template = optionalNonEmptyOption(options, 'template');
        const toolNode = optionalNonEmptyOption(options, 'toolNode');
        const id = optionalNonEmptyOption(options, 'id');
        if (Boolean(template) === Boolean(toolNode)) {
          throw new CliArgumentError('Specify exactly one of --template or --tool-node.');
        }
        if (template && !id) {
          throw new CliArgumentError('--id is required when using --template.');
        }
        if (toolNode && id) {
          throw new CliArgumentError('--id can only be used with --template.');
        }
        return container.workflowLocalService.toolAttach({
          dir: resolveWorkflowDir(options, container.env),
          locale: resolveWorkflowLocale(options, container.env),
          toolCallNodeId: requireNonEmptyOption({
            options,
            key: 'toolCall',
            flagName: '--tool-call'
          }),
          template,
          toolNodeId: toolNode,
          id,
          position: optionalNonEmptyOption(options, 'position'),
          dryRun: options.dryRun === true
        });
      }
    },

    {
      path: ['workflow-build', 'tool', 'detach'],
      summary: 'Detach a tool node from a tool-call node',
      risk: 'write',
      authModes: ['none'],
      options: [
        WORKFLOW_DIR_OPTION,
        WORKFLOW_LOCALE_OPTION,
        {
          name: 'toolCall',
          flags: '--tool-call <nodeId>',
          takesValue: true,
          description: 'Tool-call node ID'
        },
        {
          name: 'toolNode',
          flags: '--tool-node <nodeId>',
          takesValue: true,
          description: 'Attached tool node ID'
        },
        WORKFLOW_DRY_RUN_OPTION
      ],
      examples: [
        {
          description: 'Detach tool kb1 from tools1',
          args: ['workflow-build', 'tool', 'detach', '--tool-call', 'tools1', '--tool-node', 'kb1']
        }
      ],
      execute: ({ options, container }) =>
        container.workflowLocalService.toolDetach({
          dir: resolveWorkflowDir(options, container.env),
          locale: resolveWorkflowLocale(options, container.env),
          toolCallNodeId: requireNonEmptyOption({
            options,
            key: 'toolCall',
            flagName: '--tool-call'
          }),
          toolNodeId: requireNonEmptyOption({
            options,
            key: 'toolNode',
            flagName: '--tool-node'
          }),
          dryRun: options.dryRun === true
        })
    }
  ];
}
