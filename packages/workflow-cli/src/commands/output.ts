import { option } from '../commandOptions';
import z from 'zod';
import { WorkflowIOValueTypeEnum } from '@fastgpt/global/core/workflow/constants';
import { FlowNodeOutputTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { readWorkflowFile } from '../io/workflowFile';
import type { CliContext, CliResult, CliCommandDefinition } from '../type';
import { requireString, runMutation } from './helpers';

export const listOutputs = async (
  input: Record<string, unknown>,
  context: CliContext
): Promise<CliResult> => {
  const nodeId = requireString(input, 'node');
  const document = await readWorkflowFile(context.dir);
  const node = document.nodes.find((item) => item.nodeId === nodeId);
  return { changed: false, result: node?.outputs ?? [] };
};

export const addOutput = async (
  input: Record<string, unknown>,
  context: CliContext
): Promise<CliResult> => {
  const key = requireString(input, 'key');
  return runMutation({
    input,
    context,
    command: {
      type: 'output.add',
      nodeId: requireString(input, 'node'),
      output: {
        id: key,
        key,
        type: FlowNodeOutputTypeEnum.dynamic,
        valueType: requireString(input, 'valueType') as WorkflowIOValueTypeEnum,
        label: typeof input.label === 'string' ? input.label : key,
        description: typeof input.description === 'string' ? input.description : undefined
      }
    }
  });
};

export const removeOutput = async (
  input: Record<string, unknown>,
  context: CliContext
): Promise<CliResult> =>
  runMutation({
    input,
    context,
    command: {
      type: 'output.remove',
      nodeId: requireString(input, 'node'),
      outputKey: requireString(input, 'key')
    }
  });

/** output 命令定义与执行逻辑在同一模块维护；注册器只负责收集。 */
export const outputCommands: CliCommandDefinition[] = [
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
  }
];
