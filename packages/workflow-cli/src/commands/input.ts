import { option } from '../commandOptions';
import z from 'zod';
import { WorkflowIOValueTypeEnum } from '@fastgpt/global/core/workflow/constants';
import { FlowNodeInputTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { getAvailableInputReferences } from '@fastgpt/workflow-core/reference/query';
import { parseVariableRef } from '@fastgpt/workflow-core/reference/type';
import { CliArgumentError } from '../error';
import { readWorkflowFile } from '../io/workflowFile';
import type { CliContext, CliResult, CliCommandDefinition } from '../type';
import { readInputValue, requireString, runMutation } from './helpers';

export const listInputs = async (
  input: Record<string, unknown>,
  context: CliContext
): Promise<CliResult> => {
  const nodeId = requireString(input, 'node');
  const document = await readWorkflowFile(context.dir);
  const node = document.nodes.find((item) => item.nodeId === nodeId);
  if (!node) throw new CliArgumentError('Node not found', { nodeId });
  return { changed: false, result: node.inputs };
};

export const addInput = async (
  input: Record<string, unknown>,
  context: CliContext
): Promise<CliResult> => {
  const key = requireString(input, 'key');
  const mode = requireString(input, 'mode');
  const renderTypeList =
    mode === 'reference'
      ? [FlowNodeInputTypeEnum.reference]
      : mode === 'both'
        ? [FlowNodeInputTypeEnum.input, FlowNodeInputTypeEnum.reference]
        : [FlowNodeInputTypeEnum.input];
  return runMutation({
    input,
    context,
    command: {
      type: 'input.add',
      nodeId: requireString(input, 'node'),
      input: {
        key,
        label: typeof input.label === 'string' ? input.label : key,
        description: typeof input.description === 'string' ? input.description : undefined,
        valueType: requireString(input, 'valueType') as WorkflowIOValueTypeEnum,
        renderTypeList,
        required: input.required === true,
        canEdit: true
      }
    }
  });
};

export const removeInput = async (
  input: Record<string, unknown>,
  context: CliContext
): Promise<CliResult> =>
  runMutation({
    input,
    context,
    command: {
      type: 'input.remove',
      nodeId: requireString(input, 'node'),
      inputKey: requireString(input, 'key')
    }
  });

export const setInput = async (
  input: Record<string, unknown>,
  context: CliContext
): Promise<CliResult> => {
  const nodeId = requireString(input, 'node');
  const inputKey = requireString(input, 'key');
  const document = await readWorkflowFile(context.dir);
  const nodeInput = document.nodes
    .find((node) => node.nodeId === nodeId)
    ?.inputs.find((item) => item.key === inputKey);
  const value = await readInputValue({ input, context, valueType: nodeInput?.valueType });
  return runMutation({
    input,
    context,
    command: { type: 'input.set', nodeId, inputKey, value }
  });
};

export const refInput = async (
  input: Record<string, unknown>,
  context: CliContext
): Promise<CliResult> =>
  runMutation({
    input,
    context,
    command: {
      type: 'input.ref',
      nodeId: requireString(input, 'node'),
      inputKey: requireString(input, 'key'),
      ref: parseVariableRef(requireString(input, 'from'))
    }
  });

const findInput = async (input: Record<string, unknown>, context: CliContext) => {
  const nodeId = requireString(input, 'node');
  const inputKey = requireString(input, 'key');
  const document = await readWorkflowFile(context.dir);
  const nodeInput = document.nodes
    .find((node) => node.nodeId === nodeId)
    ?.inputs.find((item) => item.key === inputKey);
  if (!nodeInput) throw new CliArgumentError('Input not found', { nodeId, inputKey });
  return { document, nodeId, inputKey, nodeInput };
};

export const showInput = async (
  input: Record<string, unknown>,
  context: CliContext
): Promise<CliResult> => {
  const { nodeInput } = await findInput(input, context);
  const isSecret = nodeInput.renderTypeList.includes(FlowNodeInputTypeEnum.password);
  return {
    changed: false,
    result: isSecret
      ? { ...nodeInput, value: undefined, configured: nodeInput.value !== undefined }
      : nodeInput
  };
};

export const unsetInputValue = async (
  input: Record<string, unknown>,
  context: CliContext
): Promise<CliResult> =>
  runMutation({
    input,
    context,
    command: {
      type: 'input.unset',
      nodeId: requireString(input, 'node'),
      inputKey: requireString(input, 'key')
    }
  });

export const listAvailableInputReferences = async (
  input: Record<string, unknown>,
  context: CliContext
): Promise<CliResult> => {
  const { document, nodeId, inputKey } = await findInput(input, context);
  return {
    changed: false,
    result: getAvailableInputReferences({ document, nodeId, inputKey })
  };
};

/** input 命令定义与执行逻辑在同一模块维护；注册器只负责收集。 */
export const inputCommands: CliCommandDefinition[] = [
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
  }
];
