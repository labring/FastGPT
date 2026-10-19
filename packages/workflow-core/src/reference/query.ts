import type { WorkflowDocument } from '@fastgpt/global/core/workflow/type/document';
import { VARIABLE_NODE_ID, WorkflowIOValueTypeEnum } from '@fastgpt/global/core/workflow/constants';
import {
  areWorkflowValueTypesCompatible,
  getWorkflowReferenceVariables
} from '@fastgpt/global/common/workflow/reference';
import { getInput, assertInputMode, getInputReferenceSourceNodes } from './service';

/** 返回类型兼容且在输入作用域内可见的节点输出及用户、系统变量。 */
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
  const nodeOutputs = getInputReferenceSourceNodes({ document, nodeId, input }).flatMap((node) =>
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
  const variables = getWorkflowReferenceVariables({ chatConfig: document.chatConfig })
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
