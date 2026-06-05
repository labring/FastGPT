import { WorkflowIOValueTypeEnum } from '@fastgpt/global/core/workflow/constants';
import { nodeInputIsReference } from '@fastgpt/global/core/workflow/utils';
import type { FlowNodeInputItemType } from '@fastgpt/global/core/workflow/type/io';
import {
  workflowReferenceValueIsSelectable,
  type WorkflowReferenceSourceNode
} from '@/web/core/workflow/utils';

const primitiveValueTypes = new Set<WorkflowIOValueTypeEnum>([
  WorkflowIOValueTypeEnum.string,
  WorkflowIOValueTypeEnum.number,
  WorkflowIOValueTypeEnum.boolean
]);

const inputReferenceValueIsValid = ({
  input,
  referenceSourceNodes = []
}: {
  input: FlowNodeInputItemType;
  referenceSourceNodes?: WorkflowReferenceSourceNode[];
}) => {
  return workflowReferenceValueIsSelectable({
    value: input.value,
    sourceNodes: referenceSourceNodes,
    valueType: input.valueType
  });
};

/**
 * 节点调试只补两类输入：插件入口的全部参数，以及普通节点里引用上游输出的参数。
 * 其他已配置好的节点参数保持原值，不因空值或默认值额外展示调试输入框。
 */
export const checkInputShouldRenderInDebug = (
  input: FlowNodeInputItemType,
  options?: {
    showAllInputs?: boolean;
    referenceSourceNodes?: WorkflowReferenceSourceNode[];
  }
) => {
  if (options?.showAllInputs) return true;
  if (
    nodeInputIsReference(input) &&
    inputReferenceValueIsValid({
      input,
      referenceSourceNodes: options?.referenceSourceNodes
    })
  ) {
    return true;
  }

  return false;
};

export const getDebugInputFormValue = (input: FlowNodeInputItemType) => {
  if (nodeInputIsReference(input)) return undefined;

  const value = input.value;
  if (typeof value === 'object' && value !== null) {
    return JSON.stringify(value, null, 2);
  }

  return value;
};

export const getDebugInputFormProps = (input: FlowNodeInputItemType) => {
  const props = { ...input };
  delete props.value;
  delete props.defaultValue;

  return props;
};

const parseDebugInputFormValue = (input: FlowNodeInputItemType, value: any) => {
  if (primitiveValueTypes.has(input.valueType as WorkflowIOValueTypeEnum)) {
    return value;
  }

  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
};

export const getDebugRuntimeInputs = ({
  inputs,
  nodeVariables = {}
}: {
  inputs: FlowNodeInputItemType[];
  nodeVariables?: Record<string, any>;
}) => {
  return inputs.map((input) => {
    if (!Object.prototype.hasOwnProperty.call(nodeVariables, input.key)) {
      return input;
    }

    return {
      ...input,
      value: parseDebugInputFormValue(input, nodeVariables[input.key])
    };
  });
};
