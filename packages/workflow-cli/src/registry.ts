import z from 'zod';
import { VariableInputEnum, WorkflowIOValueTypeEnum } from '@fastgpt/workflow-core';
import { buildDocument, importDocument, initDocument, inspectDocument } from './commands/document';
import {
  addInput,
  listAvailableInputReferences,
  listInputs,
  refInput,
  removeInput,
  setInput,
  showInput,
  unsetInputValue
} from './commands/input';
import {
  addNode,
  cloneNode,
  listNodes,
  moveNode,
  removeNode,
  showNode,
  updateNode,
  insertNode
} from './commands/node';
import { connectEdge, disconnectEdge, listEdges, reconnectEdge } from './commands/edge';
import { setMeta, showMeta } from './commands/meta';
import { getConfig, listConfig, setConfig, unsetConfig } from './commands/config';
import { addVariable, listVariables, removeVariable, updateVariable } from './commands/variable';
import { listTemplates, showTemplate } from './commands/template';
import { validateDocument } from './commands/validate';
import { addOutput, listOutputs, removeOutput } from './commands/output';
import { attachTool, detachTool, listTools } from './commands/tool';
import { listChildren } from './commands/container';
import type { CliCommandDefinition, CliOptionDefinition } from './type';

const option = (
  name: string,
  description: string,
  config: Partial<Pick<CliOptionDefinition, 'value' | 'required'>> = {}
): CliOptionDefinition => ({
  name,
  description,
  value: config.value ?? true,
  required: config.required
});

const emptySchema = z.object({}).strict();
const valueOptionShape = {
  value: z.string().optional(),
  valueJson: z.string().optional(),
  valueFile: z.string().optional(),
  valueEnv: z.string().optional()
};
const valueOptions = [
  option('--value', 'Scalar value'),
  option('--value-json', 'JSON value'),
  option('--value-file', 'Read a UTF-8 value from a file'),
  option('--value-env', 'Read a value from an environment variable')
];
const getValueOptionCount = (value: Record<string, unknown>) =>
  [value.value, value.valueJson, value.valueFile, value.valueEnv].filter(
    (item) => item !== undefined
  ).length;
const variableTypeSchema = z.enum([...Object.values(VariableInputEnum), 'external']);
const variableConfigOptionShape = {
  configJson: z.string().min(1).optional(),
  configFile: z.string().min(1).optional(),
  optionsJson: z.string().min(1).optional(),
  min: z.string().min(1).optional(),
  max: z.string().min(1).optional(),
  maxLength: z.string().min(1).optional(),
  timeGranularity: z.enum(['day', 'hour', 'minute', 'second']).optional()
};
const variableConfigOptions = [
  option('--config-json', 'Type-specific variable config as JSON'),
  option('--config-file', 'Read type-specific variable config from a JSON file'),
  option('--options-json', 'Select options as a JSON array'),
  option('--min', 'Minimum numeric value'),
  option('--max', 'Maximum numeric value'),
  option('--max-length', 'Maximum text length'),
  option('--time-granularity', 'Time granularity: day, hour, minute or second')
];
const getVariableConfigFileOptionCount = (value: Record<string, unknown>) =>
  [value.configJson, value.configFile].filter((item) => item !== undefined).length;
export const cliCommandRegistry: CliCommandDefinition[] = [
  {
    path: ['init'],
    introducedIn: 'PR1',
    kind: 'localMutation',
    inputSchema: z
      .object({ name: z.string().min(1).optional(), dryRun: z.literal(true).optional() })
      .strict(),
    options: [
      option('--name', 'Workflow name'),
      option('--dry-run', 'Return the initialized document without writing', { value: false })
    ],
    supportsDryRun: true,
    confirm: 'none',
    handler: initDocument
  },
  {
    path: ['build'],
    introducedIn: 'PR1',
    kind: 'artifact',
    inputSchema: z.object({ output: z.string().min(1) }).strict(),
    options: [option('--output', 'StoreWorkflow output path', { required: true })],
    supportsDryRun: false,
    confirm: 'none',
    handler: buildDocument
  },
  {
    path: ['import'],
    introducedIn: 'PR2',
    kind: 'localMutation',
    inputSchema: z
      .object({ input: z.string().min(1), dryRun: z.literal(true).optional() })
      .strict(),
    options: [
      option('--input', 'StoreWorkflow input path', { required: true }),
      option('--dry-run', 'Return the imported document without writing', { value: false })
    ],
    supportsDryRun: true,
    confirm: 'none',
    handler: importDocument
  },
  {
    path: ['inspect'],
    introducedIn: 'PR2',
    kind: 'query',
    inputSchema: emptySchema,
    options: [],
    supportsDryRun: false,
    confirm: 'none',
    handler: inspectDocument
  },
  {
    path: ['meta', 'show'],
    introducedIn: 'PR2',
    kind: 'query',
    inputSchema: emptySchema,
    options: [],
    supportsDryRun: false,
    confirm: 'none',
    handler: showMeta
  },
  {
    path: ['meta', 'set'],
    introducedIn: 'PR2',
    kind: 'localMutation',
    inputSchema: z
      .object({
        name: z.string().min(1).optional(),
        intro: z.string().optional(),
        dryRun: z.literal(true).optional()
      })
      .strict()
      .refine((value) => value.name !== undefined || value.intro !== undefined),
    options: [
      option('--name', 'Application name'),
      option('--intro', 'Application introduction'),
      option('--dry-run', 'Return changes without writing', { value: false })
    ],
    supportsDryRun: true,
    confirm: 'none',
    handler: setMeta
  },
  {
    path: ['config', 'list'],
    introducedIn: 'PR2',
    kind: 'query',
    inputSchema: emptySchema,
    options: [],
    supportsDryRun: false,
    confirm: 'none',
    handler: listConfig
  },
  {
    path: ['config', 'get'],
    introducedIn: 'PR2',
    kind: 'query',
    inputSchema: z.object({ path: z.string().min(1) }).strict(),
    options: [option('--path', 'Allowlisted ChatConfig path', { required: true })],
    supportsDryRun: false,
    confirm: 'none',
    handler: getConfig
  },
  {
    path: ['config', 'set'],
    introducedIn: 'PR2',
    kind: 'localMutation',
    inputSchema: z
      .object({
        path: z.string().min(1),
        ...valueOptionShape,
        dryRun: z.literal(true).optional()
      })
      .strict()
      .refine((value) => getValueOptionCount(value) === 1),
    options: [
      option('--path', 'Allowlisted ChatConfig path', { required: true }),
      ...valueOptions,
      option('--dry-run', 'Return changes without writing', { value: false })
    ],
    supportsDryRun: true,
    confirm: 'none',
    handler: setConfig
  },
  {
    path: ['config', 'unset'],
    introducedIn: 'PR2',
    kind: 'localMutation',
    inputSchema: z.object({ path: z.string().min(1), dryRun: z.literal(true).optional() }).strict(),
    options: [
      option('--path', 'Allowlisted ChatConfig path', { required: true }),
      option('--dry-run', 'Return changes without writing', { value: false })
    ],
    supportsDryRun: true,
    confirm: 'none',
    handler: unsetConfig
  },
  {
    path: ['variable', 'list'],
    introducedIn: 'PR2',
    kind: 'query',
    inputSchema: emptySchema,
    options: [],
    supportsDryRun: false,
    confirm: 'none',
    handler: listVariables
  },
  {
    path: ['variable', 'add'],
    introducedIn: 'PR2',
    kind: 'localMutation',
    inputSchema: z
      .object({
        key: z.string().min(1),
        type: variableTypeSchema.optional(),
        valueType: z.enum(WorkflowIOValueTypeEnum),
        label: z.string().min(1).optional(),
        description: z.string().optional(),
        required: z.literal(true).optional(),
        ...variableConfigOptionShape,
        ...valueOptionShape,
        dryRun: z.literal(true).optional()
      })
      .strict()
      .superRefine((value, context) => {
        if (getValueOptionCount(value) > 1) {
          context.addIssue({ code: 'custom', message: 'Value options are exclusive' });
        }
        if (getVariableConfigFileOptionCount(value) > 1) {
          context.addIssue({ code: 'custom', message: 'Config options are exclusive' });
        }
      }),
    options: [
      option('--key', 'Variable key', { required: true }),
      option('--type', 'Variable input type; external is an alias for custom'),
      option('--value-type', 'Workflow value type', { required: true }),
      option('--label', 'Variable label'),
      option('--description', 'Variable description'),
      option('--required', 'Mark the variable as required', { value: false }),
      ...variableConfigOptions,
      ...valueOptions,
      option('--dry-run', 'Return changes without writing', { value: false })
    ],
    supportsDryRun: true,
    confirm: 'none',
    handler: addVariable
  },
  {
    path: ['variable', 'update'],
    introducedIn: 'PR2',
    kind: 'localMutation',
    inputSchema: z
      .object({
        key: z.string().min(1),
        newKey: z.string().min(1).optional(),
        type: variableTypeSchema.optional(),
        valueType: z.enum(WorkflowIOValueTypeEnum).optional(),
        label: z.string().min(1).optional(),
        description: z.string().optional(),
        required: z.literal(true).optional(),
        optional: z.literal(true).optional(),
        ...variableConfigOptionShape,
        ...valueOptionShape,
        dryRun: z.literal(true).optional()
      })
      .strict()
      .superRefine((value, context) => {
        if (value.required && value.optional) {
          context.addIssue({ code: 'custom', message: '--required and --optional are exclusive' });
        }
        if (getValueOptionCount(value) > 1) {
          context.addIssue({ code: 'custom', message: 'Value options are exclusive' });
        }
        if (getVariableConfigFileOptionCount(value) > 1) {
          context.addIssue({ code: 'custom', message: 'Config options are exclusive' });
        }
        if (
          [
            value.newKey,
            value.type,
            value.valueType,
            value.label,
            value.description,
            value.required,
            value.optional,
            value.configJson,
            value.configFile,
            value.optionsJson,
            value.min,
            value.max,
            value.maxLength,
            value.timeGranularity,
            value.value,
            value.valueJson,
            value.valueFile,
            value.valueEnv
          ].every((item) => item === undefined)
        ) {
          context.addIssue({ code: 'custom', message: 'At least one update field is required' });
        }
      }),
    options: [
      option('--key', 'Existing variable key', { required: true }),
      option('--new-key', 'New variable key'),
      option('--type', 'Variable input type; external is an alias for custom'),
      option('--value-type', 'Workflow value type'),
      option('--label', 'Variable label'),
      option('--description', 'Variable description'),
      option('--required', 'Mark the variable as required', { value: false }),
      option('--optional', 'Mark the variable as optional', { value: false }),
      ...variableConfigOptions,
      ...valueOptions,
      option('--dry-run', 'Return changes without writing', { value: false })
    ],
    supportsDryRun: true,
    confirm: 'none',
    handler: updateVariable
  },
  {
    path: ['variable', 'remove'],
    introducedIn: 'PR2',
    kind: 'localMutation',
    inputSchema: z.object({ key: z.string().min(1), dryRun: z.literal(true).optional() }).strict(),
    options: [
      option('--key', 'Variable key', { required: true }),
      option('--dry-run', 'Return changes without writing', { value: false })
    ],
    supportsDryRun: true,
    confirm: 'none',
    handler: removeVariable
  },
  {
    path: ['template', 'list'],
    introducedIn: 'PR1',
    kind: 'query',
    inputSchema: z.object({ source: z.literal('builtin').optional() }).strict(),
    options: [option('--source', 'Template source; PR1 supports builtin only')],
    supportsDryRun: false,
    confirm: 'none',
    handler: listTemplates
  },
  {
    path: ['template', 'show'],
    introducedIn: 'PR1',
    kind: 'query',
    inputSchema: z.object({ template: z.string().min(1) }).strict(),
    options: [option('--template', 'Explicit template reference', { required: true })],
    supportsDryRun: false,
    confirm: 'none',
    handler: showTemplate
  },
  {
    path: ['node', 'list'],
    introducedIn: 'PR1',
    kind: 'query',
    inputSchema: z.object({ type: z.string().optional(), parent: z.string().optional() }).strict(),
    options: [
      option('--type', 'Filter by flow node type'),
      option('--parent', 'Filter by parent node')
    ],
    supportsDryRun: false,
    confirm: 'none',
    handler: listNodes
  },
  {
    path: ['node', 'show'],
    introducedIn: 'PR1',
    kind: 'query',
    inputSchema: z.object({ node: z.string().min(1) }).strict(),
    options: [option('--node', 'Node ID', { required: true })],
    supportsDryRun: false,
    confirm: 'none',
    handler: showNode
  },
  {
    path: ['node', 'add'],
    introducedIn: 'PR1',
    kind: 'localMutation',
    inputSchema: z
      .object({
        node: z.string().min(1),
        template: z.string().min(1),
        name: z.string().min(1).optional(),
        after: z.string().optional(),
        parent: z.string().min(1).optional(),
        position: z.string().optional(),
        dryRun: z.literal(true).optional()
      })
      .strict(),
    options: [
      option('--node', 'New node ID', { required: true }),
      option('--template', 'Template reference', { required: true }),
      option('--name', 'Node name'),
      option('--after', 'Connect from a semantic source port'),
      option('--parent', 'Create inside a container'),
      option('--position', 'Canvas position as x,y'),
      option('--dry-run', 'Return changes without writing', { value: false })
    ],
    supportsDryRun: true,
    confirm: 'none',
    handler: addNode
  },
  {
    path: ['node', 'update'],
    introducedIn: 'PR2',
    kind: 'localMutation',
    inputSchema: z
      .object({
        node: z.string().min(1),
        name: z.string().min(1).optional(),
        position: z.string().optional(),
        catchError: z.literal(true).optional(),
        noCatchError: z.literal(true).optional(),
        dryRun: z.literal(true).optional()
      })
      .strict()
      .superRefine((value, context) => {
        if (value.catchError && value.noCatchError) {
          context.addIssue({ code: 'custom', message: 'Catch error options are exclusive' });
        }
        if (
          value.name === undefined &&
          value.position === undefined &&
          value.catchError === undefined &&
          value.noCatchError === undefined
        ) {
          context.addIssue({ code: 'custom', message: 'At least one update is required' });
        }
      }),
    options: [
      option('--node', 'Node ID', { required: true }),
      option('--name', 'Node name'),
      option('--position', 'Canvas position as x,y'),
      option('--catch-error', 'Enable catch execution port', { value: false }),
      option('--no-catch-error', 'Disable catch execution port', { value: false }),
      option('--dry-run', 'Return changes without writing', { value: false })
    ],
    supportsDryRun: true,
    confirm: 'none',
    handler: updateNode
  },
  {
    path: ['node', 'move'],
    introducedIn: 'PR3',
    kind: 'localMutation',
    inputSchema: z
      .object({
        node: z.string().min(1),
        position: z.string().min(1).optional(),
        parent: z.string().min(1).optional(),
        root: z.literal(true).optional(),
        dryRun: z.literal(true).optional()
      })
      .strict()
      .superRefine((value, context) => {
        if (value.parent && value.root) {
          context.addIssue({ code: 'custom', message: '--parent and --root are exclusive' });
        }
        if (!value.position && !value.parent && !value.root) {
          context.addIssue({ code: 'custom', message: 'A move target is required' });
        }
      }),
    options: [
      option('--node', 'Node ID', { required: true }),
      option('--position', 'Canvas position as x,y'),
      option('--parent', 'Move into a container'),
      option('--root', 'Move to root scope', { value: false }),
      option('--dry-run', 'Return changes without writing', { value: false })
    ],
    supportsDryRun: true,
    confirm: 'none',
    handler: moveNode
  },
  {
    path: ['node', 'insert'],
    introducedIn: 'PR3',
    kind: 'localMutation',
    inputSchema: z
      .object({
        from: z.string().min(1),
        to: z.string().min(1),
        template: z.string().min(1),
        id: z.string().min(1),
        position: z.string().optional(),
        dryRun: z.literal(true).optional()
      })
      .strict(),
    options: [
      option('--from', 'Existing execution source port', { required: true }),
      option('--to', 'Existing execution target port', { required: true }),
      option('--template', 'Inserted node template', { required: true }),
      option('--id', 'Inserted node ID', { required: true }),
      option('--position', 'Canvas position as x,y'),
      option('--dry-run', 'Return changes without writing', { value: false })
    ],
    supportsDryRun: true,
    confirm: 'none',
    handler: insertNode
  },
  {
    path: ['node', 'clone'],
    introducedIn: 'PR2',
    kind: 'localMutation',
    inputSchema: z
      .object({
        node: z.string().min(1),
        id: z.string().min(1),
        position: z.string().optional(),
        offset: z.string().optional(),
        dryRun: z.literal(true).optional()
      })
      .strict()
      .refine((value) => !(value.position && value.offset)),
    options: [
      option('--node', 'Source node ID', { required: true }),
      option('--id', 'Cloned node ID', { required: true }),
      option('--position', 'Absolute canvas position as x,y'),
      option('--offset', 'Offset from source as x,y'),
      option('--dry-run', 'Return changes without writing', { value: false })
    ],
    supportsDryRun: true,
    confirm: 'none',
    handler: cloneNode
  },
  {
    path: ['node', 'remove'],
    introducedIn: 'PR2',
    kind: 'localMutation',
    inputSchema: z.object({ node: z.string().min(1), dryRun: z.literal(true).optional() }).strict(),
    options: [
      option('--node', 'Node ID', { required: true }),
      option('--dry-run', 'Return changes without writing', { value: false })
    ],
    supportsDryRun: true,
    confirm: 'none',
    handler: removeNode
  },
  {
    path: ['edge', 'list'],
    introducedIn: 'PR2',
    kind: 'query',
    inputSchema: z.object({ node: z.string().optional(), kind: z.string().optional() }).strict(),
    options: [option('--node', 'Filter by node ID'), option('--kind', 'Filter by source kind')],
    supportsDryRun: false,
    confirm: 'none',
    handler: listEdges
  },
  {
    path: ['edge', 'connect'],
    introducedIn: 'PR2',
    kind: 'localMutation',
    inputSchema: z
      .object({
        from: z.string().min(1),
        to: z.string().min(1),
        dryRun: z.literal(true).optional()
      })
      .strict(),
    options: [
      option('--from', 'Execution source port', { required: true }),
      option('--to', 'Execution target port', { required: true }),
      option('--dry-run', 'Return changes without writing', { value: false })
    ],
    supportsDryRun: true,
    confirm: 'none',
    handler: connectEdge
  },
  {
    path: ['edge', 'disconnect'],
    introducedIn: 'PR2',
    kind: 'localMutation',
    inputSchema: z
      .object({
        from: z.string().min(1),
        to: z.string().min(1),
        dryRun: z.literal(true).optional()
      })
      .strict(),
    options: [
      option('--from', 'Execution source port', { required: true }),
      option('--to', 'Execution target port', { required: true }),
      option('--dry-run', 'Return changes without writing', { value: false })
    ],
    supportsDryRun: true,
    confirm: 'none',
    handler: disconnectEdge
  },
  {
    path: ['edge', 'reconnect'],
    introducedIn: 'PR2',
    kind: 'localMutation',
    inputSchema: z
      .object({
        from: z.string().min(1),
        oldTo: z.string().min(1),
        to: z.string().min(1),
        dryRun: z.literal(true).optional()
      })
      .strict(),
    options: [
      option('--from', 'Execution source port', { required: true }),
      option('--old-to', 'Existing execution target port', { required: true }),
      option('--to', 'Replacement execution target port', { required: true }),
      option('--dry-run', 'Return changes without writing', { value: false })
    ],
    supportsDryRun: true,
    confirm: 'none',
    handler: reconnectEdge
  },
  {
    path: ['input', 'list'],
    introducedIn: 'PR3',
    kind: 'query',
    inputSchema: z.object({ node: z.string().min(1) }).strict(),
    options: [option('--node', 'Node ID', { required: true })],
    supportsDryRun: false,
    confirm: 'none',
    handler: listInputs
  },
  {
    path: ['input', 'show'],
    introducedIn: 'PR2',
    kind: 'query',
    inputSchema: z.object({ node: z.string().min(1), key: z.string().min(1) }).strict(),
    options: [
      option('--node', 'Node ID', { required: true }),
      option('--key', 'Input key', { required: true })
    ],
    supportsDryRun: false,
    confirm: 'none',
    handler: showInput
  },
  {
    path: ['input', 'add'],
    introducedIn: 'PR3',
    kind: 'localMutation',
    inputSchema: z
      .object({
        node: z.string().min(1),
        key: z.string().min(1),
        valueType: z.enum(WorkflowIOValueTypeEnum),
        mode: z.enum(['literal', 'reference', 'both']),
        label: z.string().min(1).optional(),
        description: z.string().optional(),
        required: z.literal(true).optional(),
        dryRun: z.literal(true).optional()
      })
      .strict(),
    options: [
      option('--node', 'Node ID', { required: true }),
      option('--key', 'New input key', { required: true }),
      option('--value-type', 'Workflow value type', { required: true }),
      option('--mode', 'Input mode: literal, reference or both', { required: true }),
      option('--label', 'Input label'),
      option('--description', 'Input description'),
      option('--required', 'Mark the input as required', { value: false }),
      option('--dry-run', 'Return changes without writing', { value: false })
    ],
    supportsDryRun: true,
    confirm: 'none',
    handler: addInput
  },
  {
    path: ['input', 'remove'],
    introducedIn: 'PR3',
    kind: 'localMutation',
    inputSchema: z
      .object({
        node: z.string().min(1),
        key: z.string().min(1),
        dryRun: z.literal(true).optional()
      })
      .strict(),
    options: [
      option('--node', 'Node ID', { required: true }),
      option('--key', 'Dynamic input key', { required: true }),
      option('--dry-run', 'Return changes without writing', { value: false })
    ],
    supportsDryRun: true,
    confirm: 'none',
    handler: removeInput
  },
  {
    path: ['input', 'set'],
    introducedIn: 'PR1',
    kind: 'localMutation',
    inputSchema: z
      .object({
        node: z.string().min(1),
        key: z.string().min(1),
        value: z.string().optional(),
        valueJson: z.string().optional(),
        valueFile: z.string().optional(),
        valueEnv: z.string().optional(),
        dryRun: z.literal(true).optional()
      })
      .strict()
      .superRefine((value, context) => {
        const count = [value.value, value.valueJson, value.valueFile, value.valueEnv].filter(
          (item) => item !== undefined
        ).length;
        if (count !== 1) {
          context.addIssue({
            code: 'custom',
            message: 'Exactly one of --value, --value-json, --value-file or --value-env is required'
          });
        }
      }),
    options: [
      option('--node', 'Node ID', { required: true }),
      option('--key', 'Input key', { required: true }),
      option('--value', 'Scalar value'),
      option('--value-json', 'JSON value'),
      option('--value-file', 'Read a UTF-8 value from a file'),
      option('--value-env', 'Read a value from an environment variable'),
      option('--dry-run', 'Return changes without writing', { value: false })
    ],
    supportsDryRun: true,
    confirm: 'none',
    handler: setInput
  },
  {
    path: ['input', 'ref'],
    introducedIn: 'PR1',
    kind: 'localMutation',
    inputSchema: z
      .object({
        node: z.string().min(1),
        key: z.string().min(1),
        from: z.string().min(1),
        dryRun: z.literal(true).optional()
      })
      .strict(),
    options: [
      option('--node', 'Node ID', { required: true }),
      option('--key', 'Input key', { required: true }),
      option('--from', 'Variable reference as node.output', { required: true }),
      option('--dry-run', 'Return changes without writing', { value: false })
    ],
    supportsDryRun: true,
    confirm: 'none',
    handler: refInput
  },
  {
    path: ['input', 'unset'],
    introducedIn: 'PR2',
    kind: 'localMutation',
    inputSchema: z
      .object({
        node: z.string().min(1),
        key: z.string().min(1),
        dryRun: z.literal(true).optional()
      })
      .strict(),
    options: [
      option('--node', 'Node ID', { required: true }),
      option('--key', 'Input key', { required: true }),
      option('--dry-run', 'Return changes without writing', { value: false })
    ],
    supportsDryRun: true,
    confirm: 'none',
    handler: unsetInputValue
  },
  {
    path: ['input', 'available'],
    introducedIn: 'PR2',
    kind: 'query',
    inputSchema: z.object({ node: z.string().min(1), key: z.string().min(1) }).strict(),
    options: [
      option('--node', 'Node ID', { required: true }),
      option('--key', 'Input key', { required: true })
    ],
    supportsDryRun: false,
    confirm: 'none',
    handler: listAvailableInputReferences
  },
  {
    path: ['output', 'list'],
    introducedIn: 'PR3',
    kind: 'query',
    inputSchema: z.object({ node: z.string().min(1) }).strict(),
    options: [option('--node', 'Node ID', { required: true })],
    supportsDryRun: false,
    confirm: 'none',
    handler: listOutputs
  },
  {
    path: ['output', 'add'],
    introducedIn: 'PR3',
    kind: 'localMutation',
    inputSchema: z
      .object({
        node: z.string().min(1),
        key: z.string().min(1),
        valueType: z.enum(WorkflowIOValueTypeEnum),
        label: z.string().min(1).optional(),
        description: z.string().optional(),
        dryRun: z.literal(true).optional()
      })
      .strict(),
    options: [
      option('--node', 'Node ID', { required: true }),
      option('--key', 'Output key', { required: true }),
      option('--value-type', 'Workflow value type', { required: true }),
      option('--label', 'Output label'),
      option('--description', 'Output description'),
      option('--dry-run', 'Return changes without writing', { value: false })
    ],
    supportsDryRun: true,
    confirm: 'none',
    handler: addOutput
  },
  {
    path: ['output', 'remove'],
    introducedIn: 'PR3',
    kind: 'localMutation',
    inputSchema: z
      .object({
        node: z.string().min(1),
        key: z.string().min(1),
        dryRun: z.literal(true).optional()
      })
      .strict(),
    options: [
      option('--node', 'Node ID', { required: true }),
      option('--key', 'Output key', { required: true }),
      option('--dry-run', 'Return changes without writing', { value: false })
    ],
    supportsDryRun: true,
    confirm: 'none',
    handler: removeOutput
  },
  {
    path: ['tool', 'list'],
    introducedIn: 'PR3',
    kind: 'query',
    inputSchema: z.object({ toolCall: z.string().min(1) }).strict(),
    options: [option('--tool-call', 'Tool-call node ID', { required: true })],
    supportsDryRun: false,
    confirm: 'none',
    handler: listTools
  },
  {
    path: ['tool', 'attach'],
    introducedIn: 'PR3',
    kind: 'localMutation',
    inputSchema: z
      .object({
        toolCall: z.string().min(1),
        template: z.string().min(1).optional(),
        toolNode: z.string().min(1).optional(),
        id: z.string().min(1).optional(),
        position: z.string().optional(),
        dryRun: z.literal(true).optional()
      })
      .strict()
      .superRefine((value, context) => {
        if (Boolean(value.template) === Boolean(value.toolNode)) {
          context.addIssue({ code: 'custom', message: 'Use --template or --tool-node' });
        }
        if (value.template && !value.id) {
          context.addIssue({ code: 'custom', message: '--id is required with --template' });
        }
        if (value.toolNode && value.id) {
          context.addIssue({ code: 'custom', message: '--id only applies to --template' });
        }
      }),
    options: [
      option('--tool-call', 'Tool-call node ID', { required: true }),
      option('--template', 'Create tool node from template'),
      option('--tool-node', 'Attach an existing tool node'),
      option('--id', 'New tool node ID'),
      option('--position', 'Canvas position as x,y'),
      option('--dry-run', 'Return changes without writing', { value: false })
    ],
    supportsDryRun: true,
    confirm: 'none',
    handler: attachTool
  },
  {
    path: ['tool', 'detach'],
    introducedIn: 'PR3',
    kind: 'localMutation',
    inputSchema: z
      .object({
        toolCall: z.string().min(1),
        toolNode: z.string().min(1),
        dryRun: z.literal(true).optional()
      })
      .strict(),
    options: [
      option('--tool-call', 'Tool-call node ID', { required: true }),
      option('--tool-node', 'Attached tool node ID', { required: true }),
      option('--dry-run', 'Return changes without writing', { value: false })
    ],
    supportsDryRun: true,
    confirm: 'none',
    handler: detachTool
  },
  {
    path: ['container', 'children'],
    introducedIn: 'PR3',
    kind: 'query',
    inputSchema: z.object({ node: z.string().min(1) }).strict(),
    options: [option('--node', 'Container node ID', { required: true })],
    supportsDryRun: false,
    confirm: 'none',
    handler: listChildren
  },
  {
    path: ['validate'],
    introducedIn: 'PR1',
    kind: 'query',
    inputSchema: emptySchema,
    options: [],
    supportsDryRun: false,
    confirm: 'none',
    handler: validateDocument
  }
];

export const globalCliOptions: CliOptionDefinition[] = [
  option('--dir', 'Workflow directory'),
  option('--format', 'Output format: text or json'),
  option('--locale', 'Descriptor locale'),
  option('--no-color', 'Disable ANSI color', { value: false }),
  option('--quiet', 'Suppress non-result text', { value: false }),
  option('--help', 'Show help', { value: false }),
  option('--version', 'Show version', { value: false })
];

export const getCommandName = (definition: CliCommandDefinition) => definition.path.join(' ');
