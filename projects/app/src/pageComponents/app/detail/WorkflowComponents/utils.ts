import { filterSelectableWorkflowNodeOutputs, getNodeAllSource } from '@/web/core/workflow/utils';
import { getWorkflowReferenceStatus } from '@/web/core/workflow/referenceCheck';
import { workflowSystemVariables } from '@/web/core/app/utils';
import { type AppChatConfigType, type AppDetailType } from '@fastgpt/global/core/app/type';
import {
  NodeInputKeyEnum,
  NodeOutputKeyEnum,
  VARIABLE_NODE_ID
} from '@fastgpt/global/core/workflow/constants';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import type { StoreEdgeItemType } from '@fastgpt/global/core/workflow/type/edge';
import {
  type FlowNodeItemType,
  type StoreNodeItemType
} from '@fastgpt/global/core/workflow/type/node';
import {
  getSelectedInputRenderType,
  nodeInputIsReference
} from '@fastgpt/global/core/workflow/utils';
import {
  normalizeFlowNodeInputType,
  serializeAgentTool,
  isToolParamInput
} from '@fastgpt/global/core/app/formEdit/utils';
import { SelectedToolItemTypeSchema } from '@fastgpt/global/core/app/formEdit/type';
import type { EditorVariableLabelPickerType } from '@fastgpt/web/components/common/Textarea/PromptEditor/type';
import { type TFunction } from 'i18next';
import { type Edge, type Node } from 'reactflow';

const normalizeStoreNodeInput = (input: StoreNodeItemType['inputs'][number], isTool: boolean) => {
  const inputWithSelectedType = normalizeFlowNodeInputType(input, { isTool });
  const normalizedInput = {
    ...inputWithSelectedType,
    selectedType: getSelectedInputRenderType(inputWithSelectedType)
  };

  return normalizedInput;
};

export const uiWorkflow2StoreWorkflow = ({
  nodes,
  edges
}: {
  nodes: Node<FlowNodeItemType, string | undefined>[];
  edges: Edge<any>[];
  chatConfig?: AppChatConfigType;
}) => {
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
      toolDescription: item.data.toolDescription,
      avatar: item.data.avatar,
      flowNodeType: item.data.flowNodeType,
      showStatus: item.data.showStatus,
      position: item.position,
      version: item.data.version,
      inputs,
      outputs: item.data.outputs,
      isFolded: item.data.isFolded,
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
    // 保存时不能依赖 DOM handle 是否已渲染，否则动态节点还未挂载时会把合法连线误删。
    .filter(
      (item) =>
        item.sourceHandle !== '' &&
        item.targetHandle !== '' &&
        nodeIdSet.has(item.source) &&
        nodeIdSet.has(item.target)
    );

  return {
    nodes: formatNodes,
    edges: formatEdges
  };
};

export const filterExportModules = (modules: StoreNodeItemType[]) => {
  modules.forEach((module) => {
    // dataset - remove select dataset value
    if (module.flowNodeType === FlowNodeTypeEnum.datasetSearchNode) {
      module.inputs.forEach((item) => {
        if (item.key === NodeInputKeyEnum.datasetSelectList) {
          item.value = [];
        }
      });
    }
  });

  return JSON.stringify(modules, null, 2);
};

export const getEditorVariables = ({
  nodeId,
  nodeList,
  getNodeById,
  edges,
  appDetail,
  t,
  valueType
}: {
  nodeId: string;
  nodeList?: FlowNodeItemType[];
  getNodeById: (nodeId: string | null | undefined) => FlowNodeItemType | undefined;
  edges: Edge<any>[];
  appDetail: AppDetailType;
  t: TFunction;
  valueType?: FlowNodeItemType['inputs'][number]['valueType'];
}) => {
  const currentNode = getNodeById(nodeId);
  if (!currentNode) return [];

  const isToolNode = edges.some(
    (edge) => edge.target === nodeId && edge.targetHandle === NodeOutputKeyEnum.selectedTools
  );

  const nodeVariables = currentNode.inputs
    .filter((input) => input.canEdit && (isToolNode || !isToolParamInput(input)))
    .map((item) => ({
      key: item.key,
      label: item.label ?? item.key,
      ...(item.valueType ? { valueType: item.valueType } : {}),
      parent: {
        id: currentNode.nodeId,
        label: currentNode.name,
        avatar: currentNode.avatar
      }
    }));

  const sourceNodes = getNodeAllSource({
    nodeId,
    getNodeById,
    edges,
    chatConfig: appDetail.chatConfig,
    t
  });

  const formatVariable = (
    node: FlowNodeItemType,
    output: FlowNodeItemType['outputs'][number],
    invalidReason?: EditorVariableLabelPickerType['invalidReason']
  ) => ({
    label:
      node.nodeId === VARIABLE_NODE_ID &&
      !workflowSystemVariables.some((item) => item.key === output.id)
        ? (output.label ?? output.id)
        : t((output.label as any) || ''),
    key: output.id,
    ...(output.valueType ? { valueType: output.valueType } : {}),
    ...(invalidReason ? { invalidReason } : {}),
    parent: {
      id: node.nodeId,
      label: node.name,
      avatar: node.avatar
    }
  });

  const getOutputInvalidReason = ({
    node,
    output
  }: {
    node: FlowNodeItemType;
    output: FlowNodeItemType['outputs'][number];
  }): EditorVariableLabelPickerType['invalidReason'] => {
    const code = getWorkflowReferenceStatus({
      value: [node.nodeId, output.id],
      valueType,
      sourceNodes,
      getNodeById,
      chatConfig: appDetail.chatConfig
    }).code;

    return code === 'valid' || code === 'empty' ? undefined : code;
  };

  const sourceNodeVariables = sourceNodes.flatMap((node) => {
    const selectableOutputIds = new Set(
      filterSelectableWorkflowNodeOutputs({
        outputs: node.outputs,
        catchError: node.catchError
      }).map((output) => output.id)
    );

    return node.outputs
      .filter((output) => selectableOutputIds.has(output.id) && !!output.label)
      .map((output) => formatVariable(node, output, getOutputInvalidReason({ node, output })));
  });

  // 保留已存在引用的不可达来源和不可用输出，供标签显示具体失效原因。
  const unavailableNodeVariables = (nodeList ?? []).flatMap((node) => {
    return node.outputs
      .filter((output) => !!output.label)
      .flatMap((output) => {
        const invalidReason = getOutputInvalidReason({ node, output });
        return invalidReason ? [formatVariable(node, output, invalidReason)] : [];
      });
  });

  return [...nodeVariables, ...sourceNodeVariables, ...unavailableNodeVariables];
};
