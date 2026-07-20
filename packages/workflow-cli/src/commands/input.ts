import type { WorkflowIOValueTypeEnum } from '@fastgpt/workflow-core';
import {
  FlowNodeInputTypeEnum,
  getAvailableInputReferences,
  parseVariableRef
} from '@fastgpt/workflow-core';
import { CliArgumentError } from '../error';
import { readWorkflowFile } from '../io/workflowFile';
import type { CliContext, CliResult } from '../type';
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
