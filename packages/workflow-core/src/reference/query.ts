import type { WorkflowDocument } from '@fastgpt/global/core/workflow/type/document';
import { VARIABLE_NODE_ID, WorkflowIOValueTypeEnum } from '@fastgpt/global/core/workflow/constants';
import { areWorkflowValueTypesCompatible } from '@fastgpt/global/common/workflow/reference';
import { getInput, assertInputMode } from './service';

/** 返回对指定输入类型兼容且在当前节点上游可达的输出和全局变量。 */
export const getAvailableInputReferences = ({
  document,
  nodeId,
  inputKey
}: {
  document: WorkflowDocument;
  nodeId: string;
  inputKey: string;
}) => {
  const { input, inputModes } = getInput({ document, nodeId, inputKey });
  assertInputMode({ inputKey, inputModes, nodeId, mode: 'reference' });
  const upstreamNodeIds = new Set<string>();
  const pending = document.executionEdges
    .filter((edge) => edge.target.nodeId === nodeId)
    .map((edge) => edge.source.nodeId);
  while (pending.length > 0) {
    const current = pending.shift()!;
    if (upstreamNodeIds.has(current)) continue;
    upstreamNodeIds.add(current);
    pending.push(
      ...document.executionEdges
        .filter((edge) => edge.target.nodeId === current)
        .map((edge) => edge.source.nodeId)
    );
  }

  const nodeOutputs = document.nodes
    .filter((node) => upstreamNodeIds.has(node.nodeId))
    .flatMap((node) =>
      node.outputs
        .filter(
          (output) =>
            input.valueType === undefined ||
            input.valueType === WorkflowIOValueTypeEnum.any ||
            output.valueType === undefined ||
            output.valueType === WorkflowIOValueTypeEnum.any ||
            areWorkflowValueTypesCompatible({
              expected: input.valueType,
              actual: output.valueType
            })
        )
        .map((output) => ({
          ref: { nodeId: node.nodeId, outputKey: output.key },
          label: output.label,
          valueType: output.valueType,
          source: 'node' as const
        }))
    );
  const variables = (document.chatConfig.variables ?? [])
    .filter(
      (variable) =>
        input.valueType === undefined ||
        input.valueType === WorkflowIOValueTypeEnum.any ||
        variable.valueType === undefined ||
        variable.valueType === WorkflowIOValueTypeEnum.any ||
        areWorkflowValueTypesCompatible({
          expected: input.valueType,
          actual: variable.valueType
        })
    )
    .map((variable) => ({
      ref: { nodeId: VARIABLE_NODE_ID, outputKey: variable.key },
      label: variable.label,
      valueType: variable.valueType,
      source: 'variable' as const
    }));
  return [...variables, ...nodeOutputs];
};
