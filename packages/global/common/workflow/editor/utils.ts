import {
  NodeInputKeyEnum,
  NodeOutputKeyEnum,
  VARIABLE_NODE_ID,
  WorkflowIOValueTypeEnum
} from '../../../core/workflow/constants';
import { FlowNodeOutputTypeEnum, FlowNodeTypeEnum } from '../../../core/workflow/node/constant';
import { ModelTypeEnum } from '../../../core/ai/constants';
import { getHandleId, nodeInputIsReference } from '../reference';
import { USER_SELECT_REFERENCE_HANDLE_KEY } from '../../../core/workflow/template/system/interactive/userSelect';
import { moduleTemplatesFlat } from '../../../core/workflow/template/constants';
import { canInputBeAgentGenerated } from '../../../core/app/formEdit/utils';
import {
  getNodeContainerCheckError,
  isTemplateVisible
} from '../../../core/workflow/template/context';
import type { FlowNodeTemplateOutputItemType } from '../../../core/workflow/template/output';
import type {
  FlowNodeInputItemType,
  FlowNodeOutputItemType,
  ReferenceItemValueType,
  ReferenceValueType
} from '../../../core/workflow/type/io';
import type {
  FlowNodeItemType,
  FlowNodeTemplateType,
  NodeTemplateContext
} from '../../../core/workflow/type/node';
import type { AppChatConfigType } from '../../../core/app/type';
import type { WorkflowReferenceStatus } from '../../../core/workflow/editor/types';
import { getWorkflowGlobalVariables } from './variables';
import type { LLMModelDataType } from '../../../core/ai/model/schema';
import type { WorkflowEnvironmentModel } from '../../../core/workflow/editor/types';

type WorkflowLLMModel = Pick<LLMModelDataType, 'modelId' | 'config'> & {
  model?: LLMModelDataType['model'];
};

export type WorkflowLLMModelMap = Record<string, WorkflowLLMModel>;

/** 判断可编辑且默认交由 Agent 生成的输入是否属于工作流工具参数。 */
export const isToolParamInput = (
  input: Pick<
    FlowNodeInputItemType,
    'key' | 'canEdit' | 'defaultToAgentGenerated' | 'renderTypeList' | 'canAgentGenerated'
  >
) =>
  input.canEdit === true &&
  input.defaultToAgentGenerated === true &&
  canInputBeAgentGenerated(input);

/** 将 Runtime 环境目录整理成 invalidCondition 复用的模型索引。 */
export const buildWorkflowLLMModelMap = (
  models?: readonly WorkflowEnvironmentModel[]
): WorkflowLLMModelMap | undefined => {
  if (!models) return undefined;

  const modelMap: WorkflowLLMModelMap = {};
  models.forEach((model) => {
    if (model.type !== ModelTypeEnum.llm || !model.config) return;
    const llmModel = {
      modelId: model.modelId,
      model: model.model,
      config: model.config
    } as WorkflowLLMModel;
    modelMap[model.modelId] = llmModel;
    if (model.model) modelMap[model.model] = llmModel;
  });
  return modelMap;
};

/** 复用输出 invalidCondition，返回只替换 invalid 字段的输出数组。 */
export const updateWorkflowNodeOutputValidity = ({
  inputs,
  outputs,
  llmModelMap
}: {
  inputs: FlowNodeInputItemType[];
  outputs: FlowNodeTemplateOutputItemType[];
  llmModelMap?: WorkflowLLMModelMap;
}): FlowNodeTemplateOutputItemType[] => {
  if (!llmModelMap) return outputs;

  let nextOutputs = outputs;
  outputs.forEach((output, index) => {
    if (!output.invalidCondition) return;
    const invalid = output.invalidCondition({ inputs, llmModelMap });
    if (output.invalid === invalid) return;
    if (nextOutputs === outputs) nextOutputs = outputs.slice();
    nextOutputs[index] = { ...output, invalid };
  });
  return nextOutputs;
};

// region valueCompatibility Workflow value compatibility rules

const workflowValueTypeCompatMap: Record<WorkflowIOValueTypeEnum, WorkflowIOValueTypeEnum[]> = {
  // Runtime formats every non-null source value as a string when the target is string.
  [WorkflowIOValueTypeEnum.string]: [
    WorkflowIOValueTypeEnum.string,
    WorkflowIOValueTypeEnum.number,
    WorkflowIOValueTypeEnum.boolean,
    WorkflowIOValueTypeEnum.object,
    WorkflowIOValueTypeEnum.arrayString,
    WorkflowIOValueTypeEnum.arrayNumber,
    WorkflowIOValueTypeEnum.arrayBoolean,
    WorkflowIOValueTypeEnum.arrayObject,
    WorkflowIOValueTypeEnum.arrayAny,
    WorkflowIOValueTypeEnum.chatHistory,
    WorkflowIOValueTypeEnum.datasetQuote,
    WorkflowIOValueTypeEnum.dynamic,
    WorkflowIOValueTypeEnum.selectDataset,
    WorkflowIOValueTypeEnum.selectApp
  ],
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
  [WorkflowIOValueTypeEnum.arrayAny]: [WorkflowIOValueTypeEnum.arrayAny],
  [WorkflowIOValueTypeEnum.any]: [WorkflowIOValueTypeEnum.arrayAny]
};

/** 判断来源类型能否赋值给目标类型；与引用选择器和工作流检查共用。 */
export const workflowValueTypeIsCompatible = (
  sourceType: WorkflowIOValueTypeEnum | undefined,
  targetType: WorkflowIOValueTypeEnum | undefined
): boolean =>
  !targetType ||
  targetType === WorkflowIOValueTypeEnum.any ||
  targetType === WorkflowIOValueTypeEnum.arrayAny ||
  !sourceType ||
  sourceType === WorkflowIOValueTypeEnum.any ||
  workflowValueTypeCompatMap[targetType]?.includes(sourceType) === true;

export const filterWorkflowNodeOutputsByType = (
  outputs: FlowNodeOutputItemType[],
  valueType: WorkflowIOValueTypeEnum
): FlowNodeOutputItemType[] =>
  outputs.filter((output) => workflowValueTypeIsCompatible(output.valueType, valueType));

// endregion

// region referenceValidation Reference source and target validation

export type WorkflowReferenceSourceNode = {
  nodeId: string;
  sourceLabel?: string;
  icon?: string;
  outputs: FlowNodeOutputItemType[];
  catchError?: boolean;
};

type WorkflowSourceNode = Pick<FlowNodeItemType, 'nodeId' | 'flowNodeType' | 'inputs'>;

/** 多分支节点只允许当前仍存在的 source handle 参与来源计算。 */
export const isWorkflowEdgeSourceHandleValid = (
  sourceNode: WorkflowSourceNode | undefined,
  sourceHandle: string | null | undefined
) => {
  if (!sourceNode) return false;

  const { nodeId, flowNodeType, inputs } = sourceNode;
  if (flowNodeType === FlowNodeTypeEnum.userSelect) {
    if (!sourceHandle) return false;
    const input = inputs?.find((item) => item.key === NodeInputKeyEnum.userSelectOptions);
    if (input && nodeInputIsReference(input)) {
      return sourceHandle === getHandleId(nodeId, 'source', USER_SELECT_REFERENCE_HANDLE_KEY);
    }
    const options = input?.value as Array<{ key?: string }> | undefined;
    return (
      Array.isArray(options) &&
      options.some(
        (option) => option.key && sourceHandle === getHandleId(nodeId, 'source', option.key)
      )
    );
  }

  if (flowNodeType === FlowNodeTypeEnum.classifyQuestion) {
    if (!sourceHandle) return false;
    const agents = inputs?.find((input) => input.key === NodeInputKeyEnum.agents)?.value as
      | Array<{ key?: string }>
      | undefined;
    return (
      Array.isArray(agents) &&
      agents.some((agent) => agent.key && sourceHandle === getHandleId(nodeId, 'source', agent.key))
    );
  }

  return true;
};

/**
 * 目录是否提供该模板给用户手动添加。Unique 模板只能存在于文档根，并按已占用类型过滤。
 */
export const isTemplateAddable = (
  template: Pick<FlowNodeTemplateType, 'flowNodeType' | 'unique'>,
  ctx: NodeTemplateContext | null
): boolean => {
  if (!template.unique) return true;
  if (!ctx || ctx.parentType) return false;
  return !ctx.takenUniqueTypes.includes(template.flowNodeType);
};

/** 构建快捷添加、侧边栏或容器落点共用的展示上下文。 */
export const buildNodeTemplateContext = ({
  sourceNode,
  edges,
  handleId,
  getNodeById,
  isSidebar = false,
  hasToolNode = false,
  hasLoopRunNode = false,
  targetParentType
}: {
  sourceNode: Pick<FlowNodeItemType, 'nodeId' | 'flowNodeType' | 'parentNodeId'> | undefined;
  edges: { source?: string; target: string; targetHandle?: string | null }[];
  handleId?: string | null;
  getNodeById: (
    nodeId: string | undefined | null
  ) => Pick<FlowNodeItemType, 'flowNodeType'> | undefined;
  isSidebar?: boolean;
  hasToolNode?: boolean;
  hasLoopRunNode?: boolean;
  /** 目标容器类型；用于侧边栏或画布拖拽落点校验。 */
  targetParentType?: FlowNodeTypeEnum | null;
}): NodeTemplateContext | null => {
  if (!sourceNode && !isSidebar) return null;
  const parentNode = sourceNode?.parentNodeId ? getNodeById(sourceNode.parentNodeId) : undefined;
  const isConnectedTool = (() => {
    if (!sourceNode) return false;

    const incomingEdges = new Map<string, typeof edges>();
    for (const edge of edges) {
      const targetEdges = incomingEdges.get(edge.target);
      if (targetEdges) {
        targetEdges.push(edge);
      } else {
        incomingEdges.set(edge.target, [edge]);
      }
    }

    // 工具子流程可经过多个普通节点，沿入边找到任一 selectedTools 根边即可。
    const pendingNodeIds = [sourceNode.nodeId];
    const visitedNodeIds = new Set<string>();
    while (pendingNodeIds.length) {
      const nodeId = pendingNodeIds.pop()!;
      if (visitedNodeIds.has(nodeId)) continue;
      visitedNodeIds.add(nodeId);

      for (const edge of incomingEdges.get(nodeId) ?? []) {
        if (edge.targetHandle === NodeOutputKeyEnum.selectedTools) return true;
        if (edge.source) pendingNodeIds.push(edge.source);
      }
    }

    return false;
  })();

  return {
    isSidebar,
    sourceNodeId: sourceNode?.nodeId ?? null,
    sourceType: sourceNode?.flowNodeType ?? null,
    isConnectedTool,
    handleId: handleId ?? null,
    parentType:
      targetParentType === undefined ? (parentNode?.flowNodeType ?? null) : targetParentType,
    hasToolNode,
    hasLoopRunNode,
    // shortcut: 旧 helper 不计算已占用唯一节点；需校验模板可添加性时改用 Runtime placement context。
    takenUniqueTypes: []
  };
};

/**
 * 校验节点连接的容器和模板上下文，供目标柄展示与 Runtime 连线提交共用。
 * context 由 Runtime 按来源节点派生（连线拖拽开始时算一次），目标柄只按 target 应用纯规则。
 */
export const isNodeConnectionAllowed = ({
  context,
  targetTemplate,
  targetNode,
  sourceParentNodeId
}: {
  /** 来源节点的 placement context；null 表示无法建立上下文，按「允许」处理。 */
  context: NodeTemplateContext | null;
  targetTemplate?: Pick<FlowNodeTemplateType, 'flowNodeType' | 'isShowInContext'>;
  targetNode: Pick<FlowNodeItemType, 'parentNodeId'>;
  sourceParentNodeId?: string;
}) => {
  if (sourceParentNodeId !== targetNode.parentNodeId) return false;
  if (!context || !targetTemplate) return true;

  if (getNodeContainerCheckError({ node: targetTemplate, context })) return false;
  return isTemplateVisible(targetTemplate, context);
};

/**
 * 目标节点在给定 placement context 下能否被连接：解析目标模板后应用容器与可见性规则。
 * runtime 的 connectEdge 校验与画布目标柄的可连接判定共用这一条，模板解析不再各写一遍。
 */
export const isConnectionTargetAllowed = ({
  context,
  targetNode,
  sourceParentNodeId
}: {
  /** 来源节点的 placement context；null 表示建不出上下文，按「允许」处理。 */
  context: NodeTemplateContext | null;
  targetNode: Pick<FlowNodeItemType, 'flowNodeType' | 'parentNodeId'>;
  sourceParentNodeId?: string;
}) =>
  isNodeConnectionAllowed({
    context,
    targetTemplate: moduleTemplatesFlat.find((item) => item.id === targetNode.flowNodeType),
    targetNode,
    sourceParentNodeId
  });

/** 过滤引用选择器和 Runtime 可见的输出。 */
export const filterSelectableWorkflowNodeOutputs = ({
  outputs,
  valueType,
  catchError
}: {
  outputs: FlowNodeOutputItemType[];
  valueType?: WorkflowIOValueTypeEnum;
  catchError?: boolean;
}) => {
  const selectableOutputs = outputs.filter((output) => {
    if (output.id === NodeOutputKeyEnum.addOutputParam || output.invalid === true) return false;
    if (output.type === FlowNodeOutputTypeEnum.error) return catchError === true;
    return true;
  });

  return filterWorkflowNodeOutputsByType(
    selectableOutputs,
    valueType ?? WorkflowIOValueTypeEnum.any
  );
};

export const isWorkflowReferenceItem = (value: unknown): value is ReferenceItemValueType =>
  Array.isArray(value) &&
  value.length === 2 &&
  typeof value[0] === 'string' &&
  typeof value[1] === 'string' &&
  value[0].length > 0 &&
  value[1].length > 0;

/** 从单选或多选值中按原顺序提取 canonical 引用。 */
export const getWorkflowReferenceItems = (value: unknown): ReferenceItemValueType[] => {
  if (isWorkflowReferenceItem(value)) return [value];
  if (!Array.isArray(value)) return [];
  return value.filter(isWorkflowReferenceItem);
};

export const isEmptyReferenceValue = (value: unknown) =>
  value === undefined ||
  value === null ||
  value === '' ||
  (Array.isArray(value) &&
    (value.length === 0 ||
      (value.length === 2 &&
        ((value[0] === '' && value[1] === '') ||
          (value[0] === undefined && value[1] === undefined)))));

export const isConfiguredReferenceValue = (value: unknown) => !isEmptyReferenceValue(value);

/** HTTP 工具节点的动态参数作为可引用输出。 */
export const getHTTPToolParamOutputs = (node: FlowNodeItemType) =>
  node.flowNodeType === FlowNodeTypeEnum.httpRequest468
    ? node.inputs.filter(isToolParamInput).map((input) => ({
        id: input.key,
        key: input.key,
        type: FlowNodeOutputTypeEnum.static,
        label: input.label ?? input.key,
        valueType: input.valueType
      }))
    : [];

// endregion

// region referenceParsing Reference value parsing helpers

const WORKFLOW_TEXT_REFERENCE_REGEXP = /\{\{\$([^$.]+)\.([^$]+)\$\}\}/g;

/** 递归提取 canonical 与文本引用；可关闭非 reference 字段中的 canonical tuple 解析。 */
export const getWorkflowReferenceItemsFromValue = (
  value: unknown,
  { includeCanonicalReferences = true }: { includeCanonicalReferences?: boolean } = {}
) => {
  const references: ReferenceItemValueType[] = [];
  const visited = new WeakSet<object>();

  const visit = (item: unknown) => {
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

// endregion

// region referenceStatus Reference source and status derivation

/** 按引用 ID 查找来源节点和输出；sourceNodes 优先，未命中时回退到当前节点表。 */
export const getWorkflowReferenceSource = ({
  value,
  sourceNodes,
  getNodeById
}: {
  value: unknown;
  sourceNodes?: WorkflowReferenceSourceNode[];
  getNodeById?: (nodeId: string | null | undefined) => FlowNodeItemType | undefined;
}) => {
  if (!isWorkflowReferenceItem(value)) return {};

  const [sourceNodeId, outputId] = value;
  const sourceNode =
    sourceNodes?.find((node) => node.nodeId === sourceNodeId) ?? getNodeById?.(sourceNodeId);
  const sourceOutput = sourceNode?.outputs.find((output) => output.id === outputId);

  return {
    sourceNode,
    sourceOutput,
    sourceIcon: sourceNode
      ? 'name' in sourceNode
        ? sourceNode.avatar
        : sourceNode.icon
      : undefined,
    sourceLabel: sourceNode
      ? 'name' in sourceNode
        ? sourceNode.name
        : sourceNode.sourceLabel
      : undefined
  };
};

/**
 * 判断单项引用状态。输出可用性优先于来源范围，保证失效输出不会被误报为不可达。
 * 普通来源按 sourceNodes 判断范围；global reference 单独按 chatConfig 查询。
 * Runtime 内部另有基于文档图与 GraphIndex 的同名判定（referenceModule），
 * 这一份服务于画布外拿到 sourceNodes 数组的调用方（调试输入渲染、出站引用裁剪）。
 */
export const getWorkflowReferenceStatus = ({
  value,
  valueType,
  sourceNodes,
  getNodeById,
  chatConfig
}: {
  value: unknown;
  valueType?: WorkflowIOValueTypeEnum;
  sourceNodes?: WorkflowReferenceSourceNode[];
  getNodeById?: (nodeId: string | null | undefined) => FlowNodeItemType | undefined;
  chatConfig?: AppChatConfigType;
}): WorkflowReferenceStatus => {
  if (!isConfiguredReferenceValue(value)) return { code: 'empty' };
  if (!isWorkflowReferenceItem(value)) return { code: 'invalid_reference' };

  const [sourceNodeId, outputId] = value;
  const source = getWorkflowReferenceSource({ value, sourceNodes, getNodeById });

  if (sourceNodeId === VARIABLE_NODE_ID) {
    if (chatConfig !== undefined) {
      const globalVariable = getWorkflowGlobalVariables({ chatConfig }).find(
        (variable) => variable.key === outputId
      );
      if (!globalVariable) return { code: 'invalid_reference' };
      if (!workflowValueTypeIsCompatible(globalVariable.valueType, valueType)) {
        return { code: 'invalid_reference_type', sourceType: globalVariable.valueType };
      }
      return { code: 'valid', sourceType: globalVariable.valueType };
    }

    if (!source.sourceNode) return { code: 'valid' };
  }

  const { sourceNode, sourceOutput } = source;
  if (!sourceNode || !sourceOutput) return { code: 'invalid_reference' };

  const selectableOutput = filterSelectableWorkflowNodeOutputs({
    outputs: [sourceOutput],
    valueType: WorkflowIOValueTypeEnum.any,
    catchError: sourceNode.catchError
  });
  if (!selectableOutput.length) {
    return { code: 'invalid_reference', sourceType: sourceOutput.valueType };
  }

  if (
    sourceNodeId !== VARIABLE_NODE_ID &&
    sourceNodes &&
    !sourceNodes.some((node) => node.nodeId === sourceNodeId)
  ) {
    return { code: 'unreachable_reference', sourceType: sourceOutput.valueType };
  }

  if (!workflowValueTypeIsCompatible(sourceOutput.valueType, valueType)) {
    return { code: 'invalid_reference_type', sourceType: sourceOutput.valueType };
  }

  return { code: 'valid', sourceType: sourceOutput.valueType };
};

/** 判断引用是否仍可被调试输入或 selector 接受；历史失效项不会成为新值。 */
export const workflowReferenceValueIsSelectable = ({
  value,
  sourceNodes,
  valueType,
  chatConfig
}: {
  value?: ReferenceValueType;
  sourceNodes: WorkflowReferenceSourceNode[];
  valueType?: WorkflowIOValueTypeEnum;
  chatConfig?: AppChatConfigType;
}) =>
  getWorkflowReferenceItems(value).some(
    (item) =>
      getWorkflowReferenceStatus({
        value: item,
        valueType,
        sourceNodes,
        getNodeById: () => undefined,
        chatConfig
      }).code === 'valid'
  );

// endregion
