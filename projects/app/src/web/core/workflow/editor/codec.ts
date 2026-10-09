import type { AppChatConfigType } from '@fastgpt/global/core/app/type';
import { NodeInputKeyEnum, NodeOutputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import type { TFunction } from 'i18next';
import {
  hydrateWorkflowEditor,
  migrateStoreWorkflow,
  serializeWorkflowEditor,
  type StoreWorkflow
} from '@fastgpt/global/core/workflow/editor/protocol';
import type {
  WorkflowRuntimeOptions,
  WorkflowRuntimePort
} from '@fastgpt/global/core/workflow/editor/types';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import {
  getSelectedInputRenderType,
  nodeInputIsReference
} from '@fastgpt/global/core/workflow/utils';
import {
  normalizeFlowNodeInputType,
  serializeAgentTool
} from '@fastgpt/global/core/app/formEdit/utils';
import { SelectedToolItemTypeSchema } from '@fastgpt/global/core/app/formEdit/type';
import { storeNode2FlowNode } from '@/web/core/workflow/utils';
import type { Edge, Node } from 'reactflow';
import {
  StoreNodeItemTypeSchema,
  type FlowNodeItemType,
  type StoreNodeItemType
} from '@fastgpt/global/core/workflow/type/node';
import type { StoreEdgeItemType } from '@fastgpt/global/core/workflow/type/edge';
import type { CanonicalWorkflowData } from '@fastgpt/global/core/workflow/migration';

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
  edges: Edge<any>[];
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
      const serializedTools: any[] = [];
      for (const tool of selectedToolsInput.value as any[]) {
        const parsed = SelectedToolItemTypeSchema.safeParse(tool);
        if (parsed.success) serializedTools.push(serializeAgentTool({ tool: parsed.data }));
      }
      selectedToolsInput.value = serializedTools as any;
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
      inputs,
      outputs: item.data.outputs.map(({ invalidCondition: _, invalid: __, ...output }) => output),
      pluginId: item.data.pluginId,
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
 * 得到严格 canonical 数据。模板目录与 i18n 都留在边界外；保存时归一化（工具序列化、
 * 引用裁剪）只发生在出站边界，入站提前执行会把未水合数据当成用户编辑结果处理。
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
  // 入站过滤历史遗留的悬挂边；旧保存路径同样会在导出时过滤。
  const nodeIds = new Set(workflow.nodes.map((node) => node.nodeId));
  const canonicalEdges = workflow.edges.filter(
    (edge) => nodeIds.has(edge.source) && nodeIds.has(edge.target)
  );
  const toolNodeIds = new Set(
    canonicalEdges
      .filter((edge) => edge.targetHandle === NodeOutputKeyEnum.selectedTools)
      .map((edge) => edge.target)
  );
  // Materialization：复用现有模板物化，
  // 保证字段命令按 key 能解析到模板新增而存量数据缺失的字段（ADR 0001）。
  const nodes = workflow.nodes.map((node) => {
    const flowNode = storeNode2FlowNode({
      item: node,
      isTool: toolNodeIds.has(node.nodeId),
      t
    });
    // canonical schema 剥离画布/模板专用字段，
    // 语义值保持物化结果原样，不在此处执行保存时归一化。
    return StoreNodeItemTypeSchema.parse({ ...flowNode.data, position: flowNode.position });
  });

  // 物化会重新引入模板默认的容器尺寸字段，再走一次 migration 统一清理，保证严格 canonical。
  return migrateStoreWorkflow({
    nodes,
    edges: canonicalEdges,
    chatConfig: workflow.chatConfig,
    // 第二次 migration 只会保留声明过的根字段，快照必须显式带上。
    referenceSnapshots: workflow.referenceSnapshots
  });
};

/**
 * 保存、发布、本地草稿、离开确认和调试共用的编辑器入口：物化后创建 Runtime。
 * 一次性场景（简易应用发布检查）可透传 Runtime options，与工作流编辑器共用同一套 Issue 规则。
 */
export const hydrateRuntime = ({
  input,
  chatConfig,
  t,
  ...options
}: HydrateWorkflowEditorOptions & WorkflowRuntimeOptions): WorkflowRuntimePort =>
  hydrateWorkflowEditor(materializeWorkflow({ input, chatConfig, t }), options);

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
