import { WorkflowIOValueTypeEnum } from '@fastgpt/global/core/workflow/constants';
import { checkInputIsReference } from '@fastgpt/global/core/workflow/utils';
import type { FlowNodeInputItemType } from '@fastgpt/global/core/workflow/type/io';

const primitiveValueTypes = new Set<WorkflowIOValueTypeEnum>([
  WorkflowIOValueTypeEnum.string,
  WorkflowIOValueTypeEnum.number,
  WorkflowIOValueTypeEnum.boolean
]);

export const getDebugInputFormValue = (input: FlowNodeInputItemType) => {
  if (checkInputIsReference(input)) return undefined;

  const value = input.value ?? input.defaultValue;
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
