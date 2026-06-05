import { WorkflowIOValueTypeEnum } from '@fastgpt/global/core/workflow/constants';
import { nodeInputIsReference } from '@fastgpt/global/core/workflow/utils';
import type { FlowNodeInputItemType } from '@fastgpt/global/core/workflow/type/io';
import { FlowNodeInputTypeEnum } from '@fastgpt/global/core/workflow/node/constant';

const primitiveValueTypes = new Set<WorkflowIOValueTypeEnum>([
  WorkflowIOValueTypeEnum.string,
  WorkflowIOValueTypeEnum.number,
  WorkflowIOValueTypeEnum.boolean
]);

const debugFormInputTypes = new Set<FlowNodeInputTypeEnum>([
  FlowNodeInputTypeEnum.input,
  FlowNodeInputTypeEnum.textarea,
  FlowNodeInputTypeEnum.numberInput,
  FlowNodeInputTypeEnum.switch,
  FlowNodeInputTypeEnum.select,
  FlowNodeInputTypeEnum.multipleSelect,
  FlowNodeInputTypeEnum.JSONEditor,
  FlowNodeInputTypeEnum.selectLLMModel,
  FlowNodeInputTypeEnum.fileSelect,
  FlowNodeInputTypeEnum.timePointSelect,
  FlowNodeInputTypeEnum.timeRangeSelect,
  FlowNodeInputTypeEnum.password
]);

const hasInputValue = (value: unknown) => {
  if (value === undefined || value === null || value === '') return false;
  if (Array.isArray(value)) return value.length > 0;

  return true;
};

/**
 * 返回节点调试表单可使用的普通输入类型。
 *
 * 节点编辑器里有 `reference`、隐藏项和配置弹窗等特殊渲染类型；调试表单只需要让用户补运行值，
 * 因此必须降级到普通表单控件，避免把配置型输入兜底渲染成空白 textarea。
 */
export const getDebugInputRenderTypeList = (input: FlowNodeInputItemType) =>
  input.renderTypeList.filter((type) => debugFormInputTypes.has(type));

export const checkInputShouldRenderInDebug = (
  input: FlowNodeInputItemType,
  options?: {
    showValuedInputs?: boolean;
  }
) => {
  if (getDebugInputRenderTypeList(input).length === 0) return false;
  if (!input.label && !input.debugLabel) return false;

  if (options?.showValuedInputs) return true;
  if (nodeInputIsReference(input)) return true;
  if (!hasInputValue(input.value)) return true;

  return false;
};

export const getDebugInputFormValue = (input: FlowNodeInputItemType) => {
  if (nodeInputIsReference(input)) return undefined;

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
