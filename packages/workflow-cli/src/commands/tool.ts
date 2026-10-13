import { parseNodeTemplateRef } from '@fastgpt/workflow-core';
import { readWorkflowFile } from '../io/workflowFile';
import type { CliContext, CliResult } from '../type';
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
