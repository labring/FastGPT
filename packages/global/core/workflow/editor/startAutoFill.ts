import { NodeInputKeyEnum, NodeOutputKeyEnum } from '../constants';
import { nodeInputIsReference } from '../utils';
import { isEqual } from 'lodash-es';
import type {
  FlowNodeInputItemType,
  FlowNodeOutputItemType,
  ReferenceItemValueType,
  ReferenceValueType
} from '../type/io';

/** 判断引用输入是否仍为空占位；失效引用保留给引用检查处理。 */
const isUnsetReferenceValue = (value: unknown) => {
  if (value === undefined || value === null || value === '') return true;
  if (!Array.isArray(value)) return true;
  if (value.length === 0) return true;
  if (value.length === 2 && !Array.isArray(value[0])) {
    const [refNodeId, refOutputId] = value;
    if (typeof refNodeId !== 'string') return true;
    return !refNodeId || !refOutputId;
  }
  return false;
};

/** 根据流程开始输出计算目标输入的默认引用值。 */
export const getWorkflowStartAutoFillValue = ({
  inputKey,
  workflowStartNodeId,
  hasUserFilesOutput
}: {
  inputKey: string;
  workflowStartNodeId: string;
  hasUserFilesOutput: boolean;
}): ReferenceValueType | undefined => {
  if (inputKey === NodeInputKeyEnum.userChatInput) {
    return [workflowStartNodeId, NodeOutputKeyEnum.userChatInput];
  }

  if (inputKey === NodeInputKeyEnum.datasetSearchInput) {
    const refs: ReferenceItemValueType[] = [[workflowStartNodeId, NodeOutputKeyEnum.userChatInput]];
    if (hasUserFilesOutput) refs.push([workflowStartNodeId, NodeOutputKeyEnum.userFiles]);
    return refs;
  }

  if (inputKey === NodeInputKeyEnum.fileUrlList) {
    return hasUserFilesOutput ? [[workflowStartNodeId, NodeOutputKeyEnum.userFiles]] : undefined;
  }

  return undefined;
};

/** 为空白引用输入自动填充流程开始上游输出。 */
export const applyWorkflowStartInputAutoFill = ({
  inputs,
  workflowStartNodeId,
  workflowStartOutputs
}: {
  inputs: FlowNodeInputItemType[];
  workflowStartNodeId: string;
  workflowStartOutputs: FlowNodeOutputItemType[];
}): FlowNodeInputItemType[] => {
  const hasUserFilesOutput = workflowStartOutputs.some(
    (output) => output.id === NodeOutputKeyEnum.userFiles
  );

  return inputs.map((input) => {
    if (!nodeInputIsReference(input) || !isUnsetReferenceValue(input.value)) return input;
    const autoFillValue = getWorkflowStartAutoFillValue({
      inputKey: input.key,
      workflowStartNodeId,
      hasUserFilesOutput
    });
    return autoFillValue === undefined ? input : { ...input, value: autoFillValue };
  });
};

/** 判断当前值是否由流程开始自动填充产生。 */
export const isWorkflowStartAutoFilledValue = ({
  inputKey,
  value,
  workflowStartNodeId,
  hasUserFilesOutput
}: {
  inputKey: string;
  value: unknown;
  workflowStartNodeId: string;
  hasUserFilesOutput: boolean;
}) => {
  const autoFillValue = getWorkflowStartAutoFillValue({
    inputKey,
    workflowStartNodeId,
    hasUserFilesOutput
  });
  if (autoFillValue === undefined) return false;
  return isEqual(value, autoFillValue);
};
