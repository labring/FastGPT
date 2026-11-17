import { FlowNodeInputTypeEnum } from '../../../workflow/node/constant';
import { VARIABLE_NODE_ID, WorkflowIOValueTypeEnum } from '../../../workflow/constants';
import type { FlowNodeInputItemType } from '../../../workflow/type/io';
import { getToolInputManualRenderType } from '../../formEdit/utils';

/** 参数 key 是否属于已知子工具，只按完整工具名匹配，不做拆分。 */
export const isToolSetInputBindingKey = (key: string, toolNames: string[]) =>
  toolNames.some((toolName) => key.length > toolName.length + 1 && key.startsWith(`${toolName}.`));

/** 从工具集配置中读取子工具名称，供绑定 key 匹配使用。 */
export const getToolSetConfigToolNames = (toolConfig: unknown): string[] => {
  if (!toolConfig || typeof toolConfig !== 'object') return [];
  const config = toolConfig as Record<string, unknown>;
  const toolSet = (config.httpToolSet ?? config.mcpToolSet ?? config.systemToolSet) as
    | { toolList?: unknown }
    | undefined;
  if (!Array.isArray(toolSet?.toolList)) return [];

  return toolSet.toolList.flatMap((tool) =>
    tool && typeof tool === 'object' && typeof (tool as { name?: unknown }).name === 'string'
      ? [(tool as { name: string }).name]
      : []
  );
};

/** 全局变量引用值：[VARIABLE_NODE_ID, variableKey]。 */
export const isGlobalVariableReferenceValue = (
  value: unknown
): value is [typeof VARIABLE_NODE_ID, string] =>
  Array.isArray(value) &&
  value.length === 2 &&
  value[0] === VARIABLE_NODE_ID &&
  typeof value[1] === 'string';

/** 读取工具集已保存的手工/引用参数值（key 为 `${toolName}.${paramKey}`）。 */
export const getToolSetInputValuesFromInputs = ({
  inputs,
  toolNames
}: {
  inputs: FlowNodeInputItemType[];
  toolNames: string[];
}) =>
  inputs.reduce<Record<string, unknown>>((acc, input) => {
    if (isToolSetInputBindingKey(input.key, toolNames) && input.value !== undefined) {
      acc[input.key] = input.value;
    }
    return acc;
  }, {});

/** 构造工具集参数配置输入；作为节点/工具上的配置载体，运行时按子工具输入控件注入。 */
export const buildToolSetManualInput = ({
  key,
  value,
  valueType = WorkflowIOValueTypeEnum.any
}: {
  key: string;
  value: unknown;
  valueType?: WorkflowIOValueTypeEnum;
}): FlowNodeInputItemType => {
  const isReference = isGlobalVariableReferenceValue(value);
  return {
    key,
    label: key,
    valueType,
    renderTypeList: [isReference ? FlowNodeInputTypeEnum.reference : FlowNodeInputTypeEnum.input],
    selectedType: isReference ? FlowNodeInputTypeEnum.reference : FlowNodeInputTypeEnum.input,
    canAgentGenerated: false,
    canEdit: false,
    required: false,
    value
  };
};

/** 取出某个子工具自己的参数值，去掉工具名前缀；未配置的参数不返回。 */
export const pickToolSetChildValues = ({
  toolName,
  values
}: {
  toolName: string;
  values?: Record<string, unknown>;
}) => {
  const prefix = `${toolName}.`;
  return Object.fromEntries(
    Object.entries(values ?? {}).flatMap(([key, value]) =>
      key.startsWith(prefix) && key.length > prefix.length && value !== undefined
        ? [[key.slice(prefix.length), value] as const]
        : []
    )
  );
};

/**
 * 把手工/引用参数值写入子工具输入，模型不再生成这些参数。
 * 全局变量引用切到 reference；普通值使用子工具默认手动控件，文本变量由调度层替换。
 */
export const applyToolSetInputValues = ({
  inputs,
  values
}: {
  inputs: FlowNodeInputItemType[];
  values?: Record<string, unknown>;
}) => {
  if (!values || Object.keys(values).length === 0) return inputs;

  return inputs.map((input) => {
    if (
      !Object.prototype.hasOwnProperty.call(values, input.key) ||
      values[input.key] === undefined
    ) {
      return input;
    }

    const value = values[input.key];
    if (isGlobalVariableReferenceValue(value)) {
      return {
        ...input,
        renderTypeList: Array.from(
          new Set([FlowNodeInputTypeEnum.reference, ...(input.renderTypeList ?? [])])
        ),
        selectedType: FlowNodeInputTypeEnum.reference,
        value
      };
    }

    const manualType = getToolInputManualRenderType(input);
    if (!manualType) return { ...input, value };

    return {
      ...input,
      renderTypeList: Array.from(new Set([manualType, ...(input.renderTypeList ?? [])])),
      selectedType: manualType,
      value
    };
  });
};
