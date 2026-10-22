import { option } from '../commandOptions';
import z from 'zod';
import {
  parseExecutionSourcePortRef,
  parseExecutionTargetPortRef
} from '@fastgpt/workflow-core/edge/parser';
import { parseNodeTemplateRef } from '@fastgpt/workflow-core/template/type';
import { CliArgumentError } from '../error';
import { readWorkflowFile } from '../io/workflowFile';
import type { CliContext, CliResult, CliCommandDefinition } from '../type';
import { requireString, runMutation } from './helpers';
import { findDescriptorForNode } from './template';

export const listNodes = async (
  input: Record<string, unknown>,
  context: CliContext
): Promise<CliResult> => {
  const document = await readWorkflowFile(context.dir);
  return {
    changed: false,
    result: document.nodes.filter(
      (node) =>
        (input.type === undefined || node.flowNodeType === input.type) &&
        (input.parent === undefined || node.parentNodeId === input.parent)
    )
  };
};

export const showNode = async (
  input: Record<string, unknown>,
  context: CliContext
): Promise<CliResult> => {
  const nodeId = requireString(input, 'node');
  const document = await readWorkflowFile(context.dir);
  const node = document.nodes.find((item) => item.nodeId === nodeId);
  if (!node) throw new CliArgumentError('Node not found', { nodeId });
  return {
    changed: false,
    result: {
      node,
      descriptor: await findDescriptorForNode(node.flowNodeType, context),
      executionEdges: document.executionEdges.filter(
        (edge) => edge.source.nodeId === nodeId || edge.target.nodeId === nodeId
      )
    }
  };
};

export const parsePosition = (value: unknown) => {
  if (value === undefined) return undefined;
  if (typeof value !== 'string') throw new CliArgumentError('Position must be x,y');
  const [x, y, extra] = value.split(',').map(Number);
  if (extra !== undefined || !Number.isFinite(x) || !Number.isFinite(y)) {
    throw new CliArgumentError('Position must be x,y');
  }
  return { x, y };
};

export const updateNode = async (
  input: Record<string, unknown>,
  context: CliContext
): Promise<CliResult> => {
  let catchError: boolean | undefined;
  if (input.catchError === true) catchError = true;
  if (input.noCatchError === true) catchError = false;
  return runMutation({
    input,
    context,
    command: {
      type: 'node.update',
      nodeId: requireString(input, 'node'),
      name: typeof input.name === 'string' ? input.name : undefined,
      position: parsePosition(input.position),
      catchError
    }
  });
};

export const moveNode = async (
  input: Record<string, unknown>,
  context: CliContext
): Promise<CliResult> =>
  runMutation({
    input,
    context,
    command: {
      type: 'node.move',
      nodeId: requireString(input, 'node'),
      position: parsePosition(input.position),
      parentNodeId:
        typeof input.parent === 'string' ? input.parent : input.root === true ? null : undefined
    }
  });

export const cloneNode = async (
  input: Record<string, unknown>,
  context: CliContext
): Promise<CliResult> =>
  runMutation({
    input,
    context,
    command: {
      type: 'node.clone',
      sourceNodeId: requireString(input, 'node'),
      nodeId: requireString(input, 'id'),
      position: parsePosition(input.position),
      offset: parsePosition(input.offset)
    }
  });

export const removeNode = async (
  input: Record<string, unknown>,
  context: CliContext
): Promise<CliResult> =>
  runMutation({
    input,
    context,
    command: { type: 'node.remove', nodeId: requireString(input, 'node') }
  });

export const addNode = async (
  input: Record<string, unknown>,
  context: CliContext
): Promise<CliResult> => {
  const after = input.after;
  if (after !== undefined && typeof after !== 'string') {
    throw new CliArgumentError('--after must be an execution source');
  }
  return runMutation({
    input,
    context,
    command: {
      type: 'node.add',
      nodeId: requireString(input, 'node'),
      template: parseNodeTemplateRef(requireString(input, 'template')),
      name: typeof input.name === 'string' ? input.name : undefined,
      position: parsePosition(input.position),
      parentNodeId: typeof input.parent === 'string' ? input.parent : undefined,
      connectFrom: after ? parseExecutionSourcePortRef(after) : undefined
    }
  });
};

export const insertNode = async (
  input: Record<string, unknown>,
  context: CliContext
): Promise<CliResult> => {
  const target = parseExecutionTargetPortRef(requireString(input, 'to'));
  if (target.kind !== 'target') {
    throw new CliArgumentError('node insert only supports a normal target port');
  }
  return runMutation({
    input,
    context,
    command: {
      type: 'node.insert',
      nodeId: requireString(input, 'id'),
      template: parseNodeTemplateRef(requireString(input, 'template')),
      from: parseExecutionSourcePortRef(requireString(input, 'from')),
      to: target,
      position: parsePosition(input.position)
    }
  });
};

/** node 命令定义与执行逻辑在同一模块维护；注册器只负责收集。 */
export const nodeCommands: CliCommandDefinition[] = [
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
  }
];
