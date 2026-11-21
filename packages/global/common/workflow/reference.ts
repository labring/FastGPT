import {
  FlowNodeInputTypeEnum,
  FlowNodeOutputTypeEnum,
  FlowNodeTypeEnum,
  isNestedParentNodeType
} from '../../core/workflow/node/constant';
import { getIfElseBranchHandleKey } from './condition';
import { getWorkflowGlobalVariables } from './editor/variables';
import { getWorkflowSecretInputKind } from './input';
import { DatasetTagFilterValueModeEnum } from '../../core/dataset/constants';
import {
  NodeInputKeyEnum,
  NodeOutputKeyEnum,
  VARIABLE_NODE_ID,
  WorkflowIOValueTypeEnum
} from '../../core/workflow/constants';
import { IfElseResultEnum } from '../../core/workflow/template/system/ifElse/constant';
import { USER_SELECT_REFERENCE_HANDLE_KEY } from '../../core/workflow/template/system/interactive/userSelect';
import { isReferenceOptionFormItem } from '../../core/workflow/template/system/interactive/constants';
import { getSecretReferenceValue } from '../secret/utils';
import type {
  EditorVariablePickerType,
  FlowNodeInputItemType,
  FlowNodeOutputItemType,
  ReferenceValueType,
  ReferenceArrayValueType,
  ReferenceItemValueType,
  WorkflowReferenceSnapshot
} from '../../core/workflow/type/io';
import type { FlowNodeItemType, StoreNodeItemType } from '../../core/workflow/type/node';
import type { AppChatConfigType } from '../../core/app/type';
import type { StoreEdgeItemType } from '../../core/workflow/type/edge';

/** 合并可引用的变量；系统变量覆盖同名用户配置，与运行时注入顺序一致。 */
export const getWorkflowReferenceVariables = ({
  chatConfig
}: {
  chatConfig: AppChatConfigType;
}): EditorVariablePickerType[] => {
  return getWorkflowGlobalVariables({ chatConfig });
};

/** 执行边只连接同一容器的直接子节点；历史空父级和缺省父级都属于根作用域。 */
export const areWorkflowNodesInSameScope = (
  source: Pick<StoreNodeItemType, 'parentNodeId'>,
  target: Pick<StoreNodeItemType, 'parentNodeId'>
) => (source.parentNodeId ?? '') === (target.parentNodeId ?? '');

type WorkflowReferenceEdge = Pick<StoreEdgeItemType, 'source' | 'target'> & {
  targetHandle?: string | null;
};

/**
 * 返回引用可见的节点，按当前作用域入边距离、父容器来源、可选子节点的顺序排列。
 * 引用可见性独立于执行边：容器内可读父容器上游，容器的动态输出可读直接子节点，
 * 但不开放跨作用域执行边，也不允许自引用或读取其他容器内部节点。
 * 工具子流程可读调用者上游，但调用者自身的输出要等子流程结束后才产生，不能引用。
 */
export const getWorkflowReferenceSourceNodes = <
  T extends Pick<StoreNodeItemType, 'nodeId' | 'parentNodeId' | 'flowNodeType' | 'inputs'>
>({
  nodeId,
  getNodeById,
  includeChildren = false,
  childrenNodeIdListMap,
  getChildNodeIds = (parentId) => childrenNodeIdListMap?.[parentId] ?? [],
  stopAtSourceId,
  reachableTargets,
  ...graph
}: {
  nodeId: string;
  getNodeById: (nodeId: string) => T | undefined;
  includeChildren?: boolean;
  childrenNodeIdListMap?: Record<string, string[]>;
  getChildNodeIds?: (parentId: string) => readonly string[];
  /** 仅当图索引确认该来源没有工具挂载边时，命中即返回该节点。 */
  stopAtSourceId?: string;
  /** 同一张执行图中，该来源仅沿执行入边可达的已知节点。 */
  reachableTargets?: Set<string>;
} & (
  | { edges: readonly WorkflowReferenceEdge[]; getIncomingEdges?: never }
  | { edges?: never; getIncomingEdges: (nodeId: string) => Iterable<WorkflowReferenceEdge> }
)): T[] => {
  const node = getNodeById(nodeId);
  if (!node) return [];
  const containers = [node];
  const ancestorIds = new Set([nodeId]);
  for (let parentId = node.parentNodeId; parentId && !ancestorIds.has(parentId); ) {
    const parent = getNodeById(parentId);
    if (!parent) break;
    containers.push(parent);
    ancestorIds.add(parentId);
    parentId = parent.parentNodeId;
  }
  if (stopAtSourceId && ancestorIds.has(stopAtSourceId)) return [];

  const incomingEdges = new Map<string, WorkflowReferenceEdge[]>();
  for (const edge of graph.edges ?? []) {
    const incoming = incomingEdges.get(edge.target);
    if (incoming) incoming.push(edge);
    else incomingEdges.set(edge.target, [edge]);
  }
  const getIncomingEdges = graph.getIncomingEdges ?? ((id) => incomingEdges.get(id) ?? []);
  const sourceNodes = new Map<string, T>();
  const toolCallerIds = new Set<string>();
  const searchedTargetNodeIds = new Set<string>();

  /** 仅沿同作用域入边遍历；visited 同时避免非法循环图造成无限递归。 */
  const collectSources = (targetNodeId: string): T | undefined => {
    if (stopAtSourceId && reachableTargets?.has(targetNodeId)) {
      return getNodeById(stopAtSourceId);
    }
    const queue = [targetNodeId];
    for (let index = 0; index < queue.length; index++) {
      const currentId = queue[index];
      if (searchedTargetNodeIds.has(currentId)) continue;
      searchedTargetNodeIds.add(currentId);
      const target = getNodeById(currentId);
      if (!target) continue;

      for (const edge of getIncomingEdges(currentId)) {
        const source = getNodeById(edge.source);
        if (!source || source.nodeId === nodeId || !areWorkflowNodesInSameScope(source, target))
          continue;
        if (
          stopAtSourceId &&
          (source.nodeId === stopAtSourceId || reachableTargets?.has(source.nodeId))
        ) {
          reachableTargets?.add(targetNodeId);
          return getNodeById(stopAtSourceId);
        }
        // selectedTools 是调用边：继续追溯调用者上游，调用者自身在合并来源后统一排除。
        if (edge.targetHandle === NodeOutputKeyEnum.selectedTools) {
          toolCallerIds.add(source.nodeId);
        }
        sourceNodes.set(source.nodeId, source);
        queue.push(source.nodeId);
      }
    }
  };

  for (const target of containers) {
    const upstreamSource = collectSources(target.nodeId);
    if (upstreamSource) return [upstreamSource];
  }

  // 父容器输入（含默认值）不生成执行边，仍需继承其引用来源及上游。
  for (const parent of containers.slice(1)) {
    for (const input of parent.inputs) {
      if (!nodeInputIsReference(input)) continue;
      for (const [sourceId] of getWorkflowReferenceItemsFromValue(
        input.value ?? input.defaultValue
      )) {
        if (sourceId === VARIABLE_NODE_ID) continue;
        const source = getNodeById(sourceId);
        if (!source || ancestorIds.has(sourceId) || !areWorkflowNodesInSameScope(source, parent))
          continue;
        if (source.nodeId === stopAtSourceId) return [source];
        sourceNodes.set(source.nodeId, source);
        const inheritedSource = collectSources(source.nodeId);
        if (inheritedSource) return [inheritedSource];
      }
    }
  }

  if (includeChildren && isNestedParentNodeType(node.flowNodeType)) {
    for (const childId of getChildNodeIds(nodeId)) {
      const child = getNodeById(childId);
      if (child && child.nodeId !== nodeId && child.parentNodeId === nodeId) {
        sourceNodes.set(childId, child);
      }
    }
  }
  // 父容器的历史引用也可能指向调用者，不能通过输入继承重新暴露尚未产生的输出。
  return [...sourceNodes.values()].filter(
    (source) => !ancestorIds.has(source.nodeId) && !toolCallerIds.has(source.nodeId)
  );
};

/** 判断值是否为工作流节点的二元引用。 */
export const isWorkflowReferenceItem = (value: unknown): value is [string, string] =>
  Array.isArray(value) &&
  value.length === 2 &&
  typeof value[0] === 'string' &&
  typeof value[1] === 'string' &&
  value[0].length > 0 &&
  value[1].length > 0;

/** 从单选或多选值中按原顺序提取 canonical 引用。 */
export const getWorkflowReferenceItems = (value: unknown) => {
  if (isWorkflowReferenceItem(value)) return [value];
  if (!Array.isArray(value)) return [];
  return value.filter(isWorkflowReferenceItem);
};

/** 按节点索引快照记录的原始输出 ID，供存储兼容逻辑确认历史引用身份。 */
export const indexWorkflowReferenceSnapshotOutputs = (
  snapshots: readonly WorkflowReferenceSnapshot[] = []
) => {
  const outputIdsByNodeId = new Map<string, Set<string>>();
  for (const {
    reference: [nodeId, outputId]
  } of snapshots) {
    const ids = outputIdsByNodeId.get(nodeId) ?? new Set<string>();
    ids.add(outputId);
    outputIdsByNodeId.set(nodeId, ids);
  }
  return outputIdsByNodeId;
};

const WORKFLOW_TEXT_REFERENCE_REGEXP = /\{\{\$([^$.]+)\.([^$]+)\$\}\}/g;

/** 递归提取 canonical 与文本引用；可关闭非 reference 字段中的 canonical tuple 解析。 */
export const getWorkflowReferenceItemsFromValue = (
  value: unknown,
  {
    includeCanonicalReferences = true,
    includeSecretReferences = false
  }: { includeCanonicalReferences?: boolean; includeSecretReferences?: boolean } = {}
) => {
  const references: ReferenceItemValueType[] = [];
  const visited = new WeakSet<object>();

  const visit = (item: unknown) => {
    const secretReference = includeSecretReferences ? getSecretReferenceValue(item) : undefined;
    if (secretReference) {
      getWorkflowReferenceItems(secretReference).forEach((reference) => references.push(reference));
      return;
    }
    if (includeCanonicalReferences && isWorkflowReferenceItem(item)) {
      references.push(item);
      return;
    }
    if (typeof item === 'string') {
      for (const match of item.matchAll(WORKFLOW_TEXT_REFERENCE_REGEXP)) {
        references.push([match[1], match[2]]);
      }
      return;
    }
    if (!item || typeof item !== 'object' || visited.has(item)) return;
    visited.add(item);
    Object.values(item).forEach(visit);
  };

  visit(value);
  return [...new Map(references.map((reference) => [reference.join('\0'), reference])).values()];
};

export const getSelectedInputRenderType = (input: {
  renderTypeList?: readonly FlowNodeInputItemType['renderTypeList'][number][];
  selectedType?: FlowNodeInputItemType['selectedType'];
}) => input.selectedType ?? input.renderTypeList?.[0];

/** 使用数组值的系统输入，类型派生和引用执行共用同一组字段。 */
export const arrayReferenceInputKeyByNodeType: Readonly<
  Partial<Record<FlowNodeTypeEnum, NodeInputKeyEnum>>
> = {
  [FlowNodeTypeEnum.loop]: NodeInputKeyEnum.nestedInputArray,
  [FlowNodeTypeEnum.parallelRun]: NodeInputKeyEnum.nestedInputArray,
  [FlowNodeTypeEnum.loopRun]: NodeInputKeyEnum.loopRunInputArray,
  [FlowNodeTypeEnum.userSelect]: NodeInputKeyEnum.userSelectOptions,
  [FlowNodeTypeEnum.readFiles]: NodeInputKeyEnum.fileUrlList,
  [FlowNodeTypeEnum.datasetSearchNode]: NodeInputKeyEnum.datasetSearchInput
};

/** 多选引用字段兼容旧文档中的单个引用，也可以包含历史字面量数组。 */
export const isWorkflowArrayReferenceInput = (
  flowNodeType: FlowNodeTypeEnum,
  input: FlowNodeInputItemType
) =>
  getSelectedInputRenderType(input) === FlowNodeInputTypeEnum.reference &&
  (input.key === arrayReferenceInputKeyByNodeType[flowNodeType] ||
    (flowNodeType === FlowNodeTypeEnum.pluginOutput &&
      input.valueType?.startsWith('array') === true));

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
export const nodeInputIsReference = (input: {
  renderTypeList?: readonly FlowNodeInputItemType['renderTypeList'][number][];
  selectedType?: FlowNodeInputItemType['selectedType'];
}) => {
  const renderType = getSelectedInputRenderType(input);

  if (
    renderType === FlowNodeInputTypeEnum.reference ||
    renderType === FlowNodeInputTypeEnum.settingDatasetQuotePrompt
  ) {
    return true;
  }

  return false;
};

/** 只有密码控件和声明的系统凭据字段解释 ref wrapper。 */
export const workflowInputUsesSecretValues = (
  input: FlowNodeInputItemType,
  flowNodeType?: FlowNodeTypeEnum
) =>
  getSelectedInputRenderType(input) === FlowNodeInputTypeEnum.password ||
  getWorkflowSecretInputKind({ flowNodeType, inputKey: input.key }) !== undefined;

/** 知识库节点和 Agent 既有独立筛选字段，也有旧表单里的嵌套配置。 */
export const getWorkflowDatasetFilterInputKind = (
  input: FlowNodeInputItemType,
  flowNodeType?: FlowNodeTypeEnum
) => {
  if (flowNodeType === FlowNodeTypeEnum.agent && input.key === NodeInputKeyEnum.datasetParams)
    return 'nested';
  if (
    (flowNodeType === FlowNodeTypeEnum.agent ||
      flowNodeType === FlowNodeTypeEnum.datasetSearchNode) &&
    input.key === NodeInputKeyEnum.collectionFilterMatch
  )
    return 'direct';
  return undefined;
};

/** 旧版知识库筛选可用单个二元组引用整项配置。 */
export const isLegacyWorkflowDatasetFilterReference = (value: unknown): value is [string, string] =>
  isValidReferenceValueFormat(value) && typeof value[1] === 'string';

/** 固定结构字段按行内模式识别引用，其余字段由选中的控件决定是否解释二元组。 */
export const mapWorkflowInputReferenceValues = ({
  input,
  flowNodeType,
  value,
  mapValue
}: {
  input: FlowNodeInputItemType;
  flowNodeType?: FlowNodeTypeEnum;
  value: unknown;
  mapValue: (value: unknown, includeCanonicalReferences: boolean) => unknown;
}): unknown => {
  // 手填选项逐字展示，不能收集或重写其中看起来像引用的文本。
  if (
    flowNodeType === FlowNodeTypeEnum.userSelect &&
    input.key === NodeInputKeyEnum.userSelectOptions &&
    !nodeInputIsReference(input)
  )
    return value;

  type MapEntry = (entry: { key: string; item: unknown }, row: Record<string, unknown>) => unknown;
  const mapRecord = (item: unknown, mapEntry: MapEntry) =>
    item !== null && typeof item === 'object' && !Array.isArray(item)
      ? Object.fromEntries(
          Object.entries(item).map(([key, value]) => [
            key,
            mapEntry({ key, item: value }, item as Record<string, unknown>)
          ])
        )
      : item;
  const mapRows = (rows: unknown, mapEntry: MapEntry) =>
    Array.isArray(rows) ? rows.map((row: unknown) => mapRecord(row, mapEntry)) : rows;

  const datasetFilterKind = getWorkflowDatasetFilterInputKind(input, flowNodeType);
  if (datasetFilterKind && !nodeInputIsReference(input)) {
    // 旧筛选配置可引用整项。结构化筛选仅解析显式 reference 模式的条件值。
    const mapFilter = (filter: unknown) => {
      if (isLegacyWorkflowDatasetFilterReference(filter)) {
        return mapValue(filter, true);
      }
      if (filter === null || typeof filter !== 'object' || Array.isArray(filter)) {
        return filter;
      }
      return mapRecord(filter, ({ key, item }) =>
        key === 'conditions'
          ? mapRows(item, ({ key, item }, row) =>
              key === 'value' && row.valueMode === DatasetTagFilterValueModeEnum.reference
                ? mapValue(item, true)
                : item
            )
          : item
      );
    };

    return datasetFilterKind === 'nested'
      ? mapRecord(value, ({ key, item }) =>
          key === NodeInputKeyEnum.collectionFilterMatch ? mapFilter(item) : mapValue(item, false)
        )
      : mapFilter(value);
  }
  if (
    flowNodeType === FlowNodeTypeEnum.formInput &&
    input.key === NodeInputKeyEnum.userInputForms
  ) {
    // 表单配置原样传给交互端，只有动态选项的 listReference 在运行时求值。
    return mapRows(value, ({ key, item }, row) =>
      key === 'listReference' &&
      isReferenceOptionFormItem({ type: row.type, listInputType: row.listInputType })
        ? mapValue(item, true)
        : item
    );
  }
  if (flowNodeType === FlowNodeTypeEnum.ifElseNode && input.key === NodeInputKeyEnum.ifElseList) {
    return mapRows(value, ({ key, item }) =>
      key === 'list'
        ? mapRows(item, ({ key, item }, row) =>
            key === 'variable' || (key === 'value' && row.valueType === 'reference')
              ? mapValue(item, true)
              : item
          )
        : item
    );
  }
  if (
    flowNodeType === FlowNodeTypeEnum.variableUpdate &&
    input.key === NodeInputKeyEnum.updateList
  ) {
    return mapRows(value, ({ key, item }, row) =>
      key === 'variable' || key === 'value'
        ? mapValue(item, key === 'variable' || row.renderType !== FlowNodeInputTypeEnum.input)
        : item
    );
  }
  return mapValue(value, nodeInputIsReference(input));
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

/** 错误输出仅随真实的 catch 执行路径传播；容器内继承父容器的执行入口。 */
export const isWorkflowErrorBranchReachable = ({
  sourceNodeId,
  targetNodeId,
  parentByNodeId,
  getIncomingEdges
}: {
  sourceNodeId: string;
  targetNodeId: string;
  parentByNodeId: ReadonlyMap<string, string>;
  /** 只返回当前 source handle 仍有效的入边。 */
  getIncomingEdges: (
    nodeId: string
  ) => readonly Pick<StoreEdgeItemType, 'source' | 'sourceHandle' | 'targetHandle'>[];
}): boolean => {
  if (sourceNodeId === targetNodeId) return false;

  const catchHandle = getHandleId(sourceNodeId, 'source_catch', 'right');
  const pending = [targetNodeId];
  const ancestors = new Set(pending);
  let parentNodeId = parentByNodeId.get(targetNodeId);
  while (parentNodeId && !ancestors.has(parentNodeId)) {
    ancestors.add(parentNodeId);
    pending.push(parentNodeId);
    parentNodeId = parentByNodeId.get(parentNodeId);
  }

  const visited = new Set<string>();
  while (pending.length > 0) {
    const nodeId = pending.pop()!;
    if (visited.has(nodeId)) continue;
    visited.add(nodeId);
    for (const edge of getIncomingEdges(nodeId)) {
      // 工具继承调用者所在的异常分支，但挂载边本身不是异常出口。
      const isToolEdge =
        edge.sourceHandle === NodeOutputKeyEnum.selectedTools ||
        edge.targetHandle === NodeOutputKeyEnum.selectedTools;
      if (!isToolEdge && edge.source === sourceNodeId && edge.sourceHandle === catchHandle)
        return true;
      pending.push(edge.source);
    }
  }
  return false;
};

type WorkflowSourceNode = Pick<
  FlowNodeItemType,
  'nodeId' | 'flowNodeType' | 'inputs' | 'parentNodeId'
>;

/** 引用来源只经过当前分支或执行仍支持的历史出口。 */
export const isWorkflowEdgeSourceHandleValid = (
  sourceNode: WorkflowSourceNode | undefined,
  sourceHandle: string | null | undefined
) => {
  if (!sourceNode) return false;

  const { nodeId, flowNodeType, inputs } = sourceNode;
  if (sourceHandle === getHandleId(nodeId, 'source_catch', 'right')) {
    return true;
  }
  const branchInputKey = (() => {
    if (flowNodeType === FlowNodeTypeEnum.ifElseNode) return NodeInputKeyEnum.ifElseList;
    if (flowNodeType === FlowNodeTypeEnum.userSelect) return NodeInputKeyEnum.userSelectOptions;
    if (flowNodeType === FlowNodeTypeEnum.classifyQuestion) return NodeInputKeyEnum.agents;
  })();
  if (!branchInputKey) return true;
  if (!sourceHandle) return false;

  const input = inputs?.find((item) => item.key === branchInputKey);
  if (flowNodeType === FlowNodeTypeEnum.userSelect && input) {
    if (nodeInputIsReference(input)) {
      return sourceHandle === getHandleId(nodeId, 'source', USER_SELECT_REFERENCE_HANDLE_KEY);
    }
    // 历史手动选择的通用出口在续跑时仍会激活。
    if (Array.isArray(input.value) && sourceHandle === getHandleId(nodeId, 'source', 'right')) {
      return true;
    }
  }

  if (flowNodeType === FlowNodeTypeEnum.ifElseNode) {
    if (sourceHandle === getHandleId(nodeId, 'source', IfElseResultEnum.ELSE)) return true;
    return (
      Array.isArray(input?.value) &&
      input.value.some((branch: unknown, index: number) => {
        if (typeof branch !== 'object' || branch === null || Array.isArray(branch)) return false;
        const branchId = 'branchId' in branch ? branch.branchId : undefined;
        if (branchId !== undefined && branchId !== null && typeof branchId !== 'string')
          return false;
        const key = getIfElseBranchHandleKey({ branchId: branchId ?? undefined }, index);
        return key !== '' && sourceHandle === getHandleId(nodeId, 'source', key);
      })
    );
  }

  return (
    Array.isArray(input?.value) &&
    input.value.some(
      (branch: unknown) =>
        typeof branch === 'object' &&
        branch !== null &&
        'key' in branch &&
        typeof branch.key === 'string' &&
        branch.key !== '' &&
        sourceHandle === getHandleId(nodeId, 'source', branch.key)
    )
  );
};

/** 引用和工具挂载只读取同容器内仍有有效出口的连线。 */
export const isWorkflowReferenceEdgeValid = ({
  source,
  target,
  sourceHandle
}: {
  source: WorkflowSourceNode | undefined;
  target: Pick<WorkflowSourceNode, 'parentNodeId'> | undefined;
  sourceHandle: string | null | undefined;
}) =>
  source !== undefined &&
  target !== undefined &&
  areWorkflowNodesInSameScope(source, target) &&
  isWorkflowEdgeSourceHandleValid(source, sourceHandle);

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

/** 文本插值会先把任意值转成字符串，因此可接受所有来源类型。 */
export const getWorkflowInterpolationSourceValueTypes = () =>
  Object.values(WorkflowIOValueTypeEnum);

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
  allowedValueTypes,
  excludeValueTypes
}: {
  outputs: FlowNodeOutputItemType[];
  valueType?: WorkflowIOValueTypeEnum;
  catchError?: boolean;
  allowedValueTypes?: readonly WorkflowIOValueTypeEnum[];
  excludeValueTypes?: readonly WorkflowIOValueTypeEnum[];
}) => {
  const candidates = allowedValueTypes
    ? outputs.filter(
        (output) => output.valueType === undefined || allowedValueTypes.includes(output.valueType)
      )
    : filterWorkflowNodeOutputsByType(outputs, valueType ?? WorkflowIOValueTypeEnum.any);
  return candidates.filter((output) => {
    if (output.id === NodeOutputKeyEnum.addOutputParam || output.invalid === true) return false;
    if (output.valueType !== undefined && excludeValueTypes?.includes(output.valueType))
      return false;
    return output.type !== FlowNodeOutputTypeEnum.error || catchError === true;
  });
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
