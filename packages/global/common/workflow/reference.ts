import { FlowNodeInputTypeEnum } from '../../core/workflow/node/constant';
import { VARIABLE_NODE_ID } from '../../core/workflow/constants';
import type {
  FlowNodeInputItemType,
  ReferenceArrayValueType,
  ReferenceItemValueType
} from '../../core/workflow/type/io';
import type { StoreNodeItemType } from '../../core/workflow/type/node';

export const getSelectedInputRenderType = (input: {
  renderTypeList?: FlowNodeInputItemType['renderTypeList'];
  selectedType?: FlowNodeInputItemType['selectedType'];
}) => input.selectedType ?? input.renderTypeList?.[0];

export const getSelectedInputRenderTypeIndex = (input: {
  renderTypeList?: FlowNodeInputItemType['renderTypeList'];
  selectedType?: FlowNodeInputItemType['selectedType'];
}) => {
  const selectedRenderType = getSelectedInputRenderType(input);
  const selectedRenderTypePosition = selectedRenderType
    ? input.renderTypeList?.findIndex((renderType) => renderType === selectedRenderType)
    : -1;

  return selectedRenderTypePosition !== undefined && selectedRenderTypePosition >= 0
    ? selectedRenderTypePosition
    : 0;
};

/**
 * 判断输入值是否应按工作流引用解析。
 * settingDatasetQuotePrompt 内部渲染 Reference 选择器，虽然 renderType 不是 reference，
 * 但它的值仍是 [nodeId, outputId]，运行时必须解析成知识库检索结果。
 */
export const nodeInputIsReference = (input: FlowNodeInputItemType) => {
  const renderType = getSelectedInputRenderType(input);

  if (
    renderType === FlowNodeInputTypeEnum.reference ||
    renderType === FlowNodeInputTypeEnum.settingDatasetQuotePrompt
  ) {
    return true;
  }

  return false;
};

// Check the value is a valid reference value format: [variableId, outputId]
export const isValidReferenceValueFormat = (
  value: any,
  nodesMap?:
    | Record<string, Pick<StoreNodeItemType, 'nodeId'>>
    | Map<string, Pick<StoreNodeItemType, 'nodeId'>>
): value is ReferenceItemValueType => {
  if (!(Array.isArray(value) && value.length === 2 && typeof value[0] === 'string')) {
    return false;
  }

  if (!nodesMap) return true;

  const sourceNodeId = value[0];
  if (sourceNodeId === VARIABLE_NODE_ID) return true;

  return nodesMap instanceof Map ? nodesMap.has(sourceNodeId) : !!nodesMap[sourceNodeId];
};

/*
  Check whether the value([variableId, outputId]) value is a valid reference value:
  1. The value must be an array of length 2
  2. The first item of the array must be one of VARIABLE_NODE_ID or nodeIds
*/
export const isValidReferenceValue = (
  value: any,
  nodeIds: string[]
): value is ReferenceItemValueType => {
  if (!isValidReferenceValueFormat(value)) return false;

  const validIdSet = new Set([VARIABLE_NODE_ID, ...nodeIds]);
  return validIdSet.has(value[0]);
};

/*
  Check whether the value([variableId, outputId][]) value is a valid reference value array:
  1. The value must be an array
  2. The array must contain at least one element
  3. Each element in the array must be a valid reference value
*/
export const isValidArrayReferenceValue = (
  value: any,
  nodeIds: string[]
): value is ReferenceArrayValueType => {
  if (!Array.isArray(value)) return false;

  return value.every((item) => isValidReferenceValue(item, nodeIds));
};

export const getHandleId = (
  nodeId: string,
  type: 'source' | 'source_catch' | 'target',
  key: string
) => {
  return `${nodeId}-${type}-${key}`;
};
