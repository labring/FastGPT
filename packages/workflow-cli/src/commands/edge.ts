import { option } from '../commandOptions';
import z from 'zod';
import {
  parseExecutionSourcePortRef,
  parseExecutionTargetPortRef
} from '@fastgpt/workflow-core/edge/parser';
import { type WorkflowExecutionEdge } from '@fastgpt/global/core/workflow/type/edge';
import { readWorkflowFile } from '../io/workflowFile';
import type { CliContext, CliResult, CliCommandDefinition } from '../type';
import { requireString, runMutation } from './helpers';

const parseEdge = (from: string, to: string): WorkflowExecutionEdge => ({
  source: parseExecutionSourcePortRef(from),
  target: parseExecutionTargetPortRef(to)
});

export const listEdges = async (
  input: Record<string, unknown>,
  context: CliContext
): Promise<CliResult> => {
  const document = await readWorkflowFile(context.dir);
  return {
    changed: false,
    result: document.executionEdges.filter(
      (edge) =>
        (input.node === undefined ||
          edge.source.nodeId === input.node ||
          edge.target.nodeId === input.node) &&
        (input.kind === undefined || edge.source.kind === input.kind)
    )
  };
};

export const connectEdge = async (
  input: Record<string, unknown>,
  context: CliContext
): Promise<CliResult> =>
  runMutation({
    input,
    context,
    command: {
      type: 'edge.connect',
      edge: parseEdge(requireString(input, 'from'), requireString(input, 'to'))
    }
  });

export const disconnectEdge = async (
  input: Record<string, unknown>,
  context: CliContext
): Promise<CliResult> =>
  runMutation({
    input,
    context,
    command: {
      type: 'edge.disconnect',
      edge: parseEdge(requireString(input, 'from'), requireString(input, 'to'))
    }
  });

export const reconnectEdge = async (
  input: Record<string, unknown>,
  context: CliContext
): Promise<CliResult> => {
  const from = requireString(input, 'from');
  return runMutation({
    input,
    context,
    command: {
      type: 'edge.reconnect',
      oldEdge: parseEdge(from, requireString(input, 'oldTo')),
      newEdge: parseEdge(from, requireString(input, 'to'))
    }
  });
};

/** edge 命令定义与执行逻辑在同一模块维护；注册器只负责收集。 */
export const edgeCommands: CliCommandDefinition[] = [
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
  }
];
