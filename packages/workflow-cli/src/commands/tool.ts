import { option } from '../commandOptions';
import z from 'zod';
import { parseNodeTemplateRef } from '@fastgpt/workflow-core/template/type';
import { readWorkflowFile } from '../io/workflowFile';
import type { CliContext, CliResult, CliCommandDefinition } from '../type';
import { requireString, runMutation } from './helpers';
import { parsePosition } from './node';

export const listTools = async (
  input: Record<string, unknown>,
  context: CliContext
): Promise<CliResult> => {
  const toolCallNodeId = requireString(input, 'toolCall');
  const document = await readWorkflowFile(context.dir);
  return {
    changed: false,
    result: document.executionEdges
      .filter(
        (edge) => edge.source.kind === 'selectedTools' && edge.source.nodeId === toolCallNodeId
      )
      .map((edge) => document.nodes.find((node) => node.nodeId === edge.target.nodeId))
      .filter(Boolean)
  };
};

export const attachTool = async (
  input: Record<string, unknown>,
  context: CliContext
): Promise<CliResult> =>
  runMutation({
    input,
    context,
    command: {
      type: 'tool.attach',
      toolCallNodeId: requireString(input, 'toolCall'),
      toolNodeId: typeof input.toolNode === 'string' ? input.toolNode : undefined,
      template:
        typeof input.template === 'string' ? parseNodeTemplateRef(input.template) : undefined,
      newNodeId: typeof input.id === 'string' ? input.id : undefined,
      position: parsePosition(input.position)
    }
  });

export const detachTool = async (
  input: Record<string, unknown>,
  context: CliContext
): Promise<CliResult> =>
  runMutation({
    input,
    context,
    command: {
      type: 'tool.detach',
      toolCallNodeId: requireString(input, 'toolCall'),
      toolNodeId: requireString(input, 'toolNode')
    }
  });

/** tool 命令定义与执行逻辑在同一模块维护；注册器只负责收集。 */
export const toolCommands: CliCommandDefinition[] = [
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
  }
];
