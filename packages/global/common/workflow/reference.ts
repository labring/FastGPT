import { FlowNodeInputTypeEnum } from '../../core/workflow/node/constant';
import { VARIABLE_NODE_ID, WorkflowIOValueTypeEnum } from '../../core/workflow/constants';
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

const workflowReferenceSourceTypeMap: Record<WorkflowIOValueTypeEnum, WorkflowIOValueTypeEnum[]> = {
  [WorkflowIOValueTypeEnum.string]: [WorkflowIOValueTypeEnum.string],
  [WorkflowIOValueTypeEnum.number]: [WorkflowIOValueTypeEnum.number],
  [WorkflowIOValueTypeEnum.boolean]: [WorkflowIOValueTypeEnum.boolean],
  [WorkflowIOValueTypeEnum.object]: [WorkflowIOValueTypeEnum.object],
  [WorkflowIOValueTypeEnum.arrayString]: [
    WorkflowIOValueTypeEnum.string,
    WorkflowIOValueTypeEnum.arrayString,
    WorkflowIOValueTypeEnum.arrayAny
  ],
  [WorkflowIOValueTypeEnum.arrayNumber]: [
    WorkflowIOValueTypeEnum.number,
    WorkflowIOValueTypeEnum.arrayNumber,
    WorkflowIOValueTypeEnum.arrayAny
  ],
  [WorkflowIOValueTypeEnum.arrayBoolean]: [
    WorkflowIOValueTypeEnum.boolean,
    WorkflowIOValueTypeEnum.arrayBoolean,
    WorkflowIOValueTypeEnum.arrayAny
  ],
  [WorkflowIOValueTypeEnum.arrayObject]: [
    WorkflowIOValueTypeEnum.object,
    WorkflowIOValueTypeEnum.arrayObject,
    WorkflowIOValueTypeEnum.arrayAny,
    WorkflowIOValueTypeEnum.chatHistory,
    WorkflowIOValueTypeEnum.datasetQuote,
    WorkflowIOValueTypeEnum.dynamic,
    WorkflowIOValueTypeEnum.selectDataset,
    WorkflowIOValueTypeEnum.selectApp
  ],
  [WorkflowIOValueTypeEnum.chatHistory]: [
    WorkflowIOValueTypeEnum.chatHistory,
    WorkflowIOValueTypeEnum.arrayAny
  ],
  [WorkflowIOValueTypeEnum.datasetQuote]: [
    WorkflowIOValueTypeEnum.datasetQuote,
    WorkflowIOValueTypeEnum.arrayAny
  ],
  [WorkflowIOValueTypeEnum.dynamic]: [
    WorkflowIOValueTypeEnum.dynamic,
    WorkflowIOValueTypeEnum.arrayAny
  ],
  [WorkflowIOValueTypeEnum.selectDataset]: [
    WorkflowIOValueTypeEnum.selectDataset,
    WorkflowIOValueTypeEnum.arrayAny
  ],
  [WorkflowIOValueTypeEnum.selectApp]: [
    WorkflowIOValueTypeEnum.selectApp,
    WorkflowIOValueTypeEnum.arrayAny
  ],
  [WorkflowIOValueTypeEnum.arrayAny]: Object.values(WorkflowIOValueTypeEnum),
  [WorkflowIOValueTypeEnum.any]: Object.values(WorkflowIOValueTypeEnum)
};

/**
 * 返回 Web 引用选择器和 Workflow Core 共同接受的上游输出类型。
 * 数组输入允许引用同类型数组、通用数组或一个元素类型，运行时会按目标类型完成格式化。
 */
export const getWorkflowReferenceSourceValueTypes = (
  expected?: string
): WorkflowIOValueTypeEnum[] => {
  if (expected === undefined) return Object.values(WorkflowIOValueTypeEnum);
  const acceptedTypes = workflowReferenceSourceTypeMap[expected as WorkflowIOValueTypeEnum] ?? [];
  return [...new Set([...acceptedTypes, WorkflowIOValueTypeEnum.any])];
};

/** 判断一个上游输出类型能否作为目标输入的完整引用值。 */
export const areWorkflowValueTypesCompatible = ({
  expected,
  actual
}: {
  expected?: string;
  actual?: string;
}) => {
  if (expected === undefined || actual === undefined || actual === WorkflowIOValueTypeEnum.any) {
    return true;
  }
  return getWorkflowReferenceSourceValueTypes(expected).includes(actual as WorkflowIOValueTypeEnum);
};
