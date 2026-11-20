import { NodeOutputKeyEnum, VARIABLE_NODE_ID } from '../../../core/workflow/constants';
import {
  FlowNodeOutputTypeEnum,
  FlowNodeTypeEnum,
  workflowSystemVariables
} from '../../../core/workflow/node/constant';
import { ModelTypeEnum } from '../../../core/ai/constants';
import { moduleTemplatesFlat } from '../../../core/workflow/template/constants';
import { canInputBeAgentGenerated } from '../../../core/app/formEdit/utils';
import {
  getNodeContainerCheckError,
  isTemplateVisible
} from '../../../core/workflow/template/context';
import {
  userFilesInput,
  type FlowNodeTemplateOutputItemType,
  type WorkflowLLMModelMap
} from '../../../core/workflow/template/output';
import type { FlowNodeInputItemType, FlowNodeOutputItemType } from '../../../core/workflow/type/io';
import type {
  FlowNodeItemType,
  FlowNodeTemplateType,
  NodeTemplateContext,
  WorkflowCheckIssue
} from '../../../core/workflow/type/node';
import { areWorkflowNodesInSameScope } from '../reference';
import type { LLMModelDataType } from '../../../core/ai/model/schema';
import type { WorkflowEnvironmentModel } from '../../../core/workflow/editor/types';

export type WorkflowInputNameSource = {
  key: string;
  label?: string;
  debugLabel?: string;
  canEdit?: boolean;
};

/** 只有系统模板声明的标签作为翻译键，用户和工具提供的字段名按原文展示。 */
export const getWorkflowInputNameParams = ({
  node,
  input
}: {
  node?: Pick<FlowNodeItemType, 'flowNodeType' | 'pluginId'>;
  input?: WorkflowInputNameSource;
}): Record<string, string> | undefined => {
  if (!input) return;
  const label = typeof input.label === 'string' && input.label ? input.label : input.debugLabel;
  if (typeof label !== 'string' || !label) return;
  const templateInput =
    !input.canEdit && !node?.pluginId
      ? moduleTemplatesFlat
          .find((template) => template.flowNodeType === node?.flowNodeType)
          ?.inputs.find(({ key }) => key === input.key)
      : undefined;
  return label === templateInput?.label || label === templateInput?.debugLabel
    ? { inputNameKey: label }
    : { inputName: label };
};

const outputLabelSources = new Map<
  string,
  { flowNodeType: FlowNodeTypeEnum; key: string; type: FlowNodeOutputTypeEnum }[]
>();
for (const { flowNodeType, outputs } of [
  ...moduleTemplatesFlat,
  { flowNodeType: FlowNodeTypeEnum.workflowStart, outputs: [userFilesInput] },
  {
    flowNodeType: FlowNodeTypeEnum.globalVariable,
    outputs: workflowSystemVariables.map(({ key, label }) => ({
      key,
      label,
      type: FlowNodeOutputTypeEnum.static
    }))
  }
]) {
  for (const { key, label, type } of outputs) {
    if (!label || type === FlowNodeOutputTypeEnum.dynamic) continue;
    const sources = outputLabelSources.get(label);
    if (sources) sources.push({ flowNodeType, key, type });
    else outputLabelSources.set(label, [{ flowNodeType, key, type }]);
  }
}

/** 只接受已注册的输出翻译键。活节点另核对节点类型和输出业务 key，兼容历史输出 ID。 */
export const isWorkflowTemplateOutputLabel = (
  label: string | undefined,
  source?: {
    node: Pick<FlowNodeItemType, 'nodeId' | 'pluginId'> &
      Partial<Pick<FlowNodeItemType, 'flowNodeType'>>;
    output: Pick<FlowNodeOutputItemType, 'key' | 'type'>;
  }
): boolean => {
  const candidates = label ? outputLabelSources.get(label) : undefined;
  if (!candidates) return false;
  if (!source) return true;
  if (source.node.pluginId) return false;
  const flowNodeType =
    source.node.nodeId === VARIABLE_NODE_ID
      ? FlowNodeTypeEnum.globalVariable
      : source.node.flowNodeType;
  return candidates.some(
    (item) =>
      item.flowNodeType === flowNodeType &&
      item.key === source.output.key &&
      item.type === source.output.type
  );
};

/**
 * Issue 文案和 level 不属于身份；参数排序后参与身份，保留字段下标等真实子问题。
 * toast 合并跨来源错误时可忽略展示参数，避免不同校验器使用不同插值文案而重复。
 */
export const getWorkflowIssueIdentity = (
  issue: Pick<WorkflowCheckIssue, 'nodeId' | 'code' | 'inputKey' | 'params'>,
  { ignoreDisplayParams = false }: { ignoreDisplayParams?: boolean } = {}
) =>
  JSON.stringify([
    issue.nodeId,
    issue.code,
    issue.inputKey ?? '',
    Object.entries(issue.params ?? {})
      .filter(
        ([key]) =>
          !ignoreDisplayParams || !['inputName', 'inputNameKey', 'model', 'nodeName'].includes(key)
      )
      .sort(([left], [right]) => left.localeCompare(right))
  ]);

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

  const modelMap: WorkflowLLMModelMap = { byId: {}, byLegacyName: {} };
  models.forEach((model) => {
    if (model.type !== ModelTypeEnum.llm || !model.config) return;
    const config = model.config as LLMModelDataType['config'];
    modelMap.byId[model.modelId] = config;
    if (model.legacyModel) modelMap.byLegacyName[model.legacyModel] = config;
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

// region referenceValidation Reference source and target validation

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

type TemplateContextEdge = { source?: string; target: string; targetHandle?: string | null };

/** 共用模板上下文构造；Runtime 提供索引读取和作用域统计，Core 可直接传入边数组。 */
export const buildNodeTemplateContext = ({
  sourceNode,
  edges = [],
  handleId,
  getNodeById,
  getIncomingEdges,
  isSidebar = false,
  hasToolNode = false,
  hasLoopRunNode = false,
  targetParentType,
  takenUniqueTypes = []
}: {
  sourceNode: Pick<FlowNodeItemType, 'nodeId' | 'flowNodeType' | 'parentNodeId'> | undefined;
  edges?: readonly TemplateContextEdge[];
  /** 已有入边索引时直接读取，避免每次构造上下文重建整图邻接表。 */
  getIncomingEdges?: (nodeId: string) => readonly TemplateContextEdge[];
  handleId?: string | null;
  getNodeById: (
    nodeId: string | undefined | null
  ) => Pick<FlowNodeItemType, 'flowNodeType'> | undefined;
  isSidebar?: boolean;
  hasToolNode?: boolean;
  hasLoopRunNode?: boolean;
  /** 目标容器类型；用于侧边栏或画布拖拽落点校验。 */
  targetParentType?: FlowNodeTypeEnum | null;
  takenUniqueTypes?: FlowNodeTypeEnum[];
}): NodeTemplateContext | null => {
  if (!sourceNode && !isSidebar) return null;
  const parentNode = sourceNode?.parentNodeId ? getNodeById(sourceNode.parentNodeId) : undefined;
  const isConnectedTool = (() => {
    if (!sourceNode) return false;

    const readIncomingEdges =
      getIncomingEdges ??
      (() => {
        const incomingEdges = new Map<string, TemplateContextEdge[]>();
        for (const edge of edges) {
          const targetEdges = incomingEdges.get(edge.target);
          if (targetEdges) targetEdges.push(edge);
          else incomingEdges.set(edge.target, [edge]);
        }
        return (nodeId: string) => incomingEdges.get(nodeId) ?? [];
      })();

    // 工具子流程可经过多个普通节点，沿入边找到任一 selectedTools 根边即可。
    const pendingNodeIds = [sourceNode.nodeId];
    const visitedNodeIds = new Set<string>();
    while (pendingNodeIds.length) {
      const nodeId = pendingNodeIds.pop()!;
      if (visitedNodeIds.has(nodeId)) continue;
      visitedNodeIds.add(nodeId);

      for (const edge of readIncomingEdges(nodeId)) {
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
    takenUniqueTypes
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
  if (!areWorkflowNodesInSameScope({ parentNodeId: sourceParentNodeId }, targetNode)) return false;
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
