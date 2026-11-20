import { checkExecutionConnection } from '@fastgpt/workflow-core/edge/validation';
import type { AppChatConfigType } from '@fastgpt/global/core/app/type';
import {
  NodeInputKeyEnum,
  NodeOutputKeyEnum,
  VARIABLE_NODE_ID
} from '@fastgpt/global/core/workflow/constants';
import { filterWorkflowEdgesWithExistingNodes } from '@fastgpt/global/common/workflow/connection';
import type { TFunction } from 'i18next';
import {
  hydrateWorkflowEditor,
  migrateStoreWorkflow,
  serializeWorkflowEditor,
  type StoreWorkflow
} from '@fastgpt/global/common/workflow/editor/protocol';
import type {
  WorkflowRuntimeOptions,
  WorkflowRuntimePort
} from '@fastgpt/global/core/workflow/editor/types';
import {
  FlowNodeInputTypeEnum,
  FlowNodeTypeEnum
} from '@fastgpt/global/core/workflow/node/constant';
import {
  getSelectedInputRenderType,
  isWorkflowReferenceItem,
  nodeInputIsReference
} from '@fastgpt/global/common/workflow/reference';
import {
  normalizeFlowNodeInputType,
  serializeAgentTool
} from '@fastgpt/global/core/app/formEdit/utils';
import type { SelectedToolItemType } from '@fastgpt/global/core/app/formEdit/type';
import { normalizeAgentToolInputs } from '@fastgpt/global/core/workflow/migration/agentToolInput';
import type { AgentToolType } from '@fastgpt/global/core/app/tool/type';
import { storeNode2FlowNode } from '@/web/core/workflow/utils';
import type { Edge, Node } from '@xyflow/react';
import {
  StoreNodeItemTypeSchema,
  type FlowNodeItemType,
  type StoreNodeItemType
} from '@fastgpt/global/core/workflow/type/node';
import type { StoreEdgeItemType } from '@fastgpt/global/core/workflow/type/edge';
import type { CanonicalWorkflowData } from '@fastgpt/global/core/workflow/migration/schema';
import { datasetSearchUsesLegacyFilter } from '@/web/core/workflow/datasetSearchNodeUpgrade';

// region codecContracts Workflow codec boundary contracts

type HydrateWorkflowEditorOptions = {
  input: unknown;
  chatConfig?: AppChatConfigType;
  t: TFunction;
};

// endregion

// region codecNormalization Workflow input normalization

const normalizeStoreNodeInput = (input: StoreNodeItemType['inputs'][number], isTool: boolean) => {
  const inputWithSelectedType = normalizeFlowNodeInputType(input, { isTool });
  return {
    ...inputWithSelectedType,
    selectedType: getSelectedInputRenderType(inputWithSelectedType)
  };
};

/**
 * 将画布形状归一化为 StoreWorkflow；保留旧保存路径的工具序列化、引用值和悬挂边过滤行为。
 * 定义放在 editor codec，避免 web/core 反向依赖 pageComponents。
 */
export const uiWorkflow2StoreWorkflow = ({
  nodes,
  edges
}: {
  nodes: Node<FlowNodeItemType, string | undefined>[];
  edges: Edge[];
}): { nodes: StoreNodeItemType[]; edges: StoreEdgeItemType[] } => {
  const toolNodeIds = new Set(
    edges
      .filter((edge) => edge.targetHandle === NodeOutputKeyEnum.selectedTools)
      .map((edge) => edge.target)
  );

  const formatNodes = nodes.map((item) => {
    const inputs =
      item.data.flowNodeType === FlowNodeTypeEnum.pluginInput
        ? item.data.inputs
        : item.data.inputs.map((input) =>
            normalizeStoreNodeInput(input, toolNodeIds.has(item.data.nodeId))
          );
    const selectedToolsInput = inputs.find((input) => input.key === NodeInputKeyEnum.selectedTools);
    if (
      item.data.flowNodeType === FlowNodeTypeEnum.agent &&
      selectedToolsInput &&
      !nodeInputIsReference(selectedToolsInput) &&
      Array.isArray(selectedToolsInput.value)
    ) {
      // Agent 工具统一收敛为 { key, mode } 和 config，避免完整 NodeIO 混入持久化协议。
      selectedToolsInput.value = selectedToolsInput.value.map(
        (tool: SelectedToolItemType | AgentToolType) => {
          if (!Array.isArray(tool.inputs)) return tool;
          if ('flowNodeType' in tool) return serializeAgentTool({ tool });

          const { inputs, config } = normalizeAgentToolInputs({
            rawInputs: tool.inputs,
            rawConfig: tool.config
          });
          return { ...tool, inputs, config };
        }
      );
    }

    return {
      nodeId: item.data.nodeId,
      parentNodeId: item.data.parentNodeId,
      name: item.data.name,
      intro: item.data.intro,
      avatar: item.data.avatar,
      flowNodeType: item.data.flowNodeType,
      showStatus: item.data.showStatus,
      position: item.position,
      version: item.data.version,
      versionLabel: item.data.versionLabel,
      isLatestVersion: item.data.isLatestVersion,
      metadataLocale: item.data.metadataLocale,
      inputs,
      outputs: item.data.outputs.map(({ invalidCondition: _, ...output }) => output),
      isFolded: item.data.isFolded,
      pluginId: item.data.pluginId,
      source: item.data.source,
      toolConfig: item.data.toolConfig,
      catchError: item.data.catchError
    };
  });

  const nodeIdSet = new Set(formatNodes.map((node) => node.nodeId));
  const formatEdges: StoreEdgeItemType[] = edges
    .map((item) => ({
      source: item.source,
      target: item.target,
      sourceHandle: item.sourceHandle || '',
      targetHandle: item.targetHandle || ''
    }))
    .filter(
      (item) =>
        item.sourceHandle !== '' &&
        item.targetHandle !== '' &&
        nodeIdSet.has(item.source) &&
        nodeIdSet.has(item.target)
    );

  return { nodes: formatNodes, edges: formatEdges };
};

// endregion

// region codecHydration Workflow materialization and runtime creation

/**
 * 入站边界：migration 之后做 Template Materialization，剥离画布专用字段，
 * 得到 canonical 字段，并保留 Runtime-only 输出校验回调（出站序列化会剥离）。模板目录与 i18n
 * 都留在边界外；保存时归一化（工具序列化、引用裁剪）只发生在出站边界，入站提前执行会把未水合数据当成用户编辑结果处理。
 * hydrate 与版本切换（replaceDocument）共用同一份物化结果。
 */

export const materializeWorkflow = ({
  input,
  chatConfig,
  t
}: HydrateWorkflowEditorOptions): CanonicalWorkflowData => {
  const workflow = migrateStoreWorkflow(
    chatConfig ? { ...(input as Record<string, unknown>), chatConfig } : input
  );
  const nodesById = new Map(workflow.nodes.map((node) => [node.nodeId, node]));

  // 旧版文本控件允许用 key 引用整项筛选，模板换成当前控件前迁移为输出 ID。
  const migrateLegacyFilterReference = (node: StoreNodeItemType) => {
    if (node.flowNodeType !== FlowNodeTypeEnum.datasetSearchNode) return;
    const filter = node.inputs.find(
      (input) => input.key === NodeInputKeyEnum.collectionFilterMatch
    );
    if (
      !filter ||
      getSelectedInputRenderType(filter) !== FlowNodeInputTypeEnum.textarea ||
      !filter.renderTypeList.includes(FlowNodeInputTypeEnum.textarea) ||
      !datasetSearchUsesLegacyFilter(node.inputs)
    ) {
      return;
    }
    for (const field of ['value', 'defaultValue'] as const) {
      const reference: unknown = filter[field];
      if (!isWorkflowReferenceItem(reference)) continue;
      const [sourceNodeId, selector] = reference;
      if (sourceNodeId === VARIABLE_NODE_ID) continue;
      const outputs = nodesById.get(sourceNodeId)?.outputs;
      if (!outputs || outputs.some((output) => output.id === selector)) continue;
      const matches = outputs.filter((output) => output.key === selector);
      if (matches.length === 1) filter[field] = [sourceNodeId, matches[0].id];
    }
  };

  // 入站过滤历史遗留的悬挂边；旧保存路径同样会在导出时过滤。
  const canonicalEdges = filterWorkflowEdgesWithExistingNodes(workflow);
  const toolNodeIds = new Set(
    canonicalEdges
      .filter((edge) => edge.targetHandle === NodeOutputKeyEnum.selectedTools)
      .map((edge) => edge.target)
  );
  const templateOutputsByNodeId = new Map<string, FlowNodeItemType['outputs']>();
  // Materialization：复用现有模板物化，
  // 保证字段命令按 key 能解析到模板新增而存量数据缺失的字段（ADR 0001）。
  const nodes = workflow.nodes.map((node) => {
    migrateLegacyFilterReference(node);
    const flowNode = storeNode2FlowNode({
      item: node,
      isTool: toolNodeIds.has(node.nodeId),
      t
    });
    templateOutputsByNodeId.set(node.nodeId, flowNode.data.outputs);
    // canonical schema 剥离画布/模板专用字段，
    // 语义值保持物化结果原样，不在此处执行保存时归一化。
    return StoreNodeItemTypeSchema.parse({ ...flowNode.data, position: flowNode.position });
  });

  // 物化会重新引入模板默认的容器尺寸字段，再走一次 migration 统一清理，保证严格 canonical。
  const canonical = migrateStoreWorkflow({
    nodes,
    edges: canonicalEdges,
    chatConfig: workflow.chatConfig,
    // 第二次 migration 只会保留声明过的根字段，快照必须显式带上。
    referenceSnapshots: workflow.referenceSnapshots
  });
  return {
    ...canonical,
    nodes: canonical.nodes.map((node) => ({
      ...node,
      // Runtime 需要模板回调重算输出可用性；出站 codec 会剥离它，不进持久化数据。
      outputs: node.outputs.map((output) => {
        const invalidCondition = templateOutputsByNodeId
          .get(node.nodeId)
          ?.find((templateOutput) => templateOutput.id === output.id)?.invalidCondition;
        return typeof invalidCondition === 'function' ? { ...output, invalidCondition } : output;
      })
    }))
  };
};

/** 让 Runtime 的 staged 连线、画布提交与容器附着复用 Core 判定，不序列化整份文档。 */
export const getWorkflowConnectionError: NonNullable<
  WorkflowRuntimeOptions['getConnectionError']
> = (query) => {
  const result = checkExecutionConnection({
    ...query,
    edges: [...query.edges],
    // Core 判定只读；此处仅消除 mutable 签名差异，保留 Runtime 的冻结快照和实时输出状态。
    getNodeById: query.getNodeById as (nodeId: string) => StoreNodeItemType | undefined
  });
  return result.allowed
    ? undefined
    : {
        code: 'invalid_edge',
        message: result.reason.code,
        diagnostic: result.reason
      };
};

/** 物化文档并注入 Core 连线规则，普通入口与 Session 共用同一判定。 */
export const hydrateRuntime = ({
  input,
  chatConfig,
  t,
  ...options
}: HydrateWorkflowEditorOptions & WorkflowRuntimeOptions): WorkflowRuntimePort =>
  hydrateWorkflowEditor(materializeWorkflow({ input, chatConfig, t }), {
    ...options,
    getConnectionError: getWorkflowConnectionError
  });

// endregion

// region codecSerialization Runtime export normalization

/**
 * 出站边界：读取 Runtime 完整导出，并用旧保存路径的 Workflow Normalization 原样包住
 * （工具输入模式归一、工具选择序列化、按节点存在性过滤边、剥离画布函数字段）。
 * 失效引用不再被裁剪：它们要留在数据里，配合根级 Reference Snapshots 展示历史名字。
 */

export const serializeRuntime = (runtime: WorkflowRuntimePort): StoreWorkflow => {
  const data = serializeWorkflowEditor(runtime);
  // 把 Runtime 导出包装成 reactflow 形状，
  // 直接复用 uiWorkflow2StoreWorkflow，一行不改既有归一化行为。
  const normalized = uiWorkflow2StoreWorkflow({
    nodes: data.nodes.map((node) => ({
      id: node.nodeId,
      position: node.position ?? { x: 0, y: 0 },
      data: node
    })) as Node<FlowNodeItemType, string | undefined>[],
    edges: data.edges as Edge<any>[]
  });

  // uiWorkflow2StoreWorkflow 只输出 nodes 与 edges，根级字段要在这里显式补齐。
  return {
    ...normalized,
    chatConfig: data.chatConfig,
    referenceSnapshots: data.referenceSnapshots
  } as StoreWorkflow;
};

// endregion
