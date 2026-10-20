import {
  FlowNodeInputTypeEnum,
  FlowNodeOutputTypeEnum,
  isNestedParentNodeType,
  workflowSystemVariables
} from '../../core/workflow/node/constant';
import {
  NodeOutputKeyEnum,
  VARIABLE_NODE_ID,
  WorkflowIOValueTypeEnum
} from '../../core/workflow/constants';
import type {
  EditorVariablePickerType,
  FlowNodeInputItemType,
  FlowNodeOutputItemType,
  ReferenceValueType,
  ReferenceArrayValueType,
  ReferenceItemValueType
} from '../../core/workflow/type/io';
import type { StoreNodeItemType } from '../../core/workflow/type/node';
import type { AppChatConfigType } from '../../core/app/type';
import type { StoreEdgeItemType } from '../../core/workflow/type/edge';

/** 合并可引用的变量；系统变量覆盖同名用户配置，与运行时注入顺序一致。 */
export const getWorkflowReferenceVariables = ({
  chatConfig
}: {
  chatConfig: AppChatConfigType;
}): EditorVariablePickerType[] => {
  const variables = new Map<string, EditorVariablePickerType>(
    (chatConfig.variables ?? []).map((variable) => [variable.key, variable])
  );
  for (const variable of workflowSystemVariables) variables.set(variable.key, variable);
  return [...variables.values()];
};

/**
 * 返回引用可见的节点，按当前作用域入边距离、父容器来源、可选子节点的顺序排列。
 * 引用可见性独立于执行边：容器内可读父容器上游，容器的动态输出可读直接子节点，
 * 但不开放跨作用域执行边，也不允许自引用或读取其他容器内部节点。
 */
export const getWorkflowReferenceSourceNodes = <
  T extends Pick<StoreNodeItemType, 'nodeId' | 'parentNodeId' | 'flowNodeType' | 'inputs'>
>({
  nodeId,
  getNodeById,
  edges,
  includeChildren = false,
  childrenNodeIdListMap
}: {
  nodeId: string;
  getNodeById: (nodeId: string) => T | undefined;
  edges: Pick<StoreEdgeItemType, 'source' | 'target'>[];
  includeChildren?: boolean;
  childrenNodeIdListMap?: Record<string, string[]>;
}): T[] => {
  const node = getNodeById(nodeId);
  if (!node) return [];

  const sourceNodes = new Map<string, T>();
  const searchedTargetNodeIds = new Set<string>();

  /** 仅沿同作用域入边遍历；visited 同时避免非法循环图造成无限递归。 */
  const collectSources = (targetNodeId: string) => {
    const queue = [targetNodeId];
    while (queue.length > 0) {
      const currentId = queue.shift()!;
      if (searchedTargetNodeIds.has(currentId)) continue;
      searchedTargetNodeIds.add(currentId);
      const target = getNodeById(currentId);
      if (!target) continue;

      for (const edge of edges) {
        if (edge.target !== currentId) continue;
        const source = getNodeById(edge.source);
        if (!source || source.nodeId === nodeId || source.parentNodeId !== target.parentNodeId)
          continue;
        sourceNodes.set(source.nodeId, source);
        queue.push(source.nodeId);
      }
    }
  };

  collectSources(nodeId);

  const parent = node.parentNodeId ? getNodeById(node.parentNodeId) : undefined;
  if (parent) {
    collectSources(parent.nodeId);

    // 父容器引用输入不会生成执行边，仍需继承其引用来源及上游。
    for (const input of parent.inputs) {
      if (!nodeInputIsReference(input)) continue;
      const references = isValidReferenceValueFormat(input.value) ? [input.value] : input.value;
      if (!Array.isArray(references)) continue;
      for (const ref of references) {
        if (!isValidReferenceValueFormat(ref) || ref[0] === VARIABLE_NODE_ID) continue;
        const source = getNodeById(ref[0]);
        if (
          !source ||
          source.nodeId === nodeId ||
          source.nodeId === parent.nodeId ||
          source.parentNodeId !== parent.parentNodeId
        )
          continue;
        sourceNodes.set(source.nodeId, source);
        collectSources(source.nodeId);
      }
    }
  }

  if (includeChildren && isNestedParentNodeType(node.flowNodeType)) {
    for (const childId of childrenNodeIdListMap?.[nodeId] ?? []) {
      const child = getNodeById(childId);
      if (child && child.nodeId !== nodeId && child.parentNodeId === nodeId) {
        sourceNodes.set(childId, child);
      }
    }
  }
  return [...sourceNodes.values()];
};

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

/** 按共享引用类型兼容规则筛选输出，供选择器和静态校验共用。 */
export const filterWorkflowNodeOutputsByType = (
  outputs: FlowNodeOutputItemType[],
  valueType: WorkflowIOValueTypeEnum
): FlowNodeOutputItemType[] => {
  return outputs.filter(
    (output) =>
      !output.valueType ||
      areWorkflowValueTypesCompatible({
        expected: valueType,
        actual: output.valueType
      })
  );
};

export type WorkflowReferenceSourceNode = {
  nodeId: string;
  outputs: FlowNodeOutputItemType[];
  catchError?: boolean;
};

export const DYNAMIC_OPTION_EXCLUDED_VALUE_TYPES: WorkflowIOValueTypeEnum[] = [
  WorkflowIOValueTypeEnum.arrayBoolean
];

/**
 * 过滤引用选择器中真正可选的输出。
 * ReferenceSelector 和节点 debug 的引用有效性判断必须共用这套规则，避免已删除、类型不匹配、
 * addOutputParam、invalid output 或未开启 catchError 的错误输出在不同入口表现不一致。
 */
export const filterSelectableWorkflowNodeOutputs = ({
  outputs,
  valueType,
  catchError,
  excludeValueTypes
}: {
  outputs: FlowNodeOutputItemType[];
  valueType?: WorkflowIOValueTypeEnum;
  catchError?: boolean;
  excludeValueTypes?: WorkflowIOValueTypeEnum[];
}) => {
  return filterWorkflowNodeOutputsByType(outputs, valueType ?? WorkflowIOValueTypeEnum.any).filter(
    (output) => {
      if (
        excludeValueTypes?.length &&
        output.valueType &&
        excludeValueTypes.includes(output.valueType)
      ) {
        return false;
      }

      if (output.type === FlowNodeOutputTypeEnum.error) {
        return catchError === true;
      }

      return output.id !== NodeOutputKeyEnum.addOutputParam && output.invalid !== true;
    }
  );
};

/**
 * 判断引用值是否仍能被 ReferenceSelector 选中。
 * 单选引用要求当前二元组命中；多选引用只要存在一个仍可选的引用项，选择器就会展示有效值。
 */
export const workflowReferenceValueIsSelectable = ({
  value,
  sourceNodes,
  valueType,
  excludeValueTypes
}: {
  value?: ReferenceValueType;
  sourceNodes: WorkflowReferenceSourceNode[];
  valueType?: WorkflowIOValueTypeEnum;
  excludeValueTypes?: WorkflowIOValueTypeEnum[];
}) => {
  const referenceItemIsSelectable = (itemValue: ReferenceItemValueType) => {
    const [sourceNodeId, outputId] = itemValue;
    if (!sourceNodeId || !outputId) return false;

    const sourceNode = sourceNodes.find((node) => node.nodeId === sourceNodeId);
    if (!sourceNode) return false;

    return filterSelectableWorkflowNodeOutputs({
      outputs: sourceNode.outputs,
      valueType,
      catchError: sourceNode.catchError,
      excludeValueTypes
    }).some((output) => output.id === outputId);
  };

  if (!Array.isArray(value)) return false;

  if (typeof value[0] === 'string') {
    return referenceItemIsSelectable(value as ReferenceItemValueType);
  }

  return value.some((item) => {
    if (!Array.isArray(item)) return false;

    return referenceItemIsSelectable(item as ReferenceItemValueType);
  });
};
