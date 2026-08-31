import type { WorkflowIOValueTypeEnum } from '@fastgpt/workflow-core';
import { FlowNodeOutputTypeEnum } from '@fastgpt/workflow-core';
import { readWorkflowFile } from '../io/workflowFile';
import type { CliContext, CliResult } from '../type';
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
