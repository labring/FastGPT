import { isToolParamInput } from '../../app/formEdit/utils';
import {
  NodeInputKeyEnum,
  NodeOutputKeyEnum,
  VARIABLE_NODE_ID,
  WorkflowIOValueTypeEnum
} from '../constants';
import { FlowNodeOutputTypeEnum, FlowNodeTypeEnum } from '../node/constant';
import { getHandleId } from '../utils';
import { moduleTemplatesFlat } from '../template/constants';
import { isNodeConnectionAllowed } from '../template/context';
import type {
  FlowNodeOutputItemType,
  ReferenceItemValueType,
  ReferenceValueType
} from '../type/io';
import type { FlowNodeItemType, NodeTemplateContext } from '../type/node';
import type { AppChatConfigType } from '../../app/type';
import type { WorkflowReferenceStatus } from './types';
import { getWorkflowGlobalVariables } from './variables';

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
    const options = inputs?.find((input) => input.key === NodeInputKeyEnum.userSelectOptions)
      ?.value as Array<{ key?: string }> | undefined;
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
