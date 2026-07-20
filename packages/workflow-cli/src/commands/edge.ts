import {
  parseExecutionSourcePortRef,
  parseExecutionTargetPortRef,
  type WorkflowExecutionEdge
} from '@fastgpt/workflow-core';
import { readWorkflowFile } from '../io/workflowFile';
import type { CliContext, CliResult } from '../type';
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
