import {
  parseExecutionSourcePortRef,
  parseExecutionTargetPortRef,
  parseNodeTemplateRef
} from '@fastgpt/workflow-core';
import { CliArgumentError } from '../error';
import { readWorkflowFile } from '../io/workflowFile';
import type { CliContext, CliResult } from '../type';
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
