import { getNodeAllSource, type WorkflowGraphEdge } from '@/web/core/workflow/utils';
import { workflowSystemVariables } from '@/web/core/app/utils';
import type { AppChatConfigType } from '@fastgpt/global/core/app/type';
import {
  NodeInputKeyEnum,
  NodeOutputKeyEnum,
  VARIABLE_NODE_ID
} from '@fastgpt/global/core/workflow/constants';
import type { DeepReadonly } from '@fastgpt/global/core/workflow/editor/types';
import {
  FlowNodeOutputTypeEnum,
  FlowNodeTypeEnum
} from '@fastgpt/global/core/workflow/node/constant';
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
  serializeAgentTool
} from '@fastgpt/global/core/app/formEdit/utils';
import { SelectedToolItemTypeSchema } from '@fastgpt/global/core/app/formEdit/type';
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
      avatar: item.data.avatar,
      flowNodeType: item.data.flowNodeType,
      showStatus: item.data.showStatus,
      position: item.position,
      version: item.data.version,
      // 引用值原样持久化：抹掉失效引用会让 Reference Snapshots 失去 consumer，
      // 重开后连“这里曾引用过什么”都无从展示。
      inputs,
      // 仅用于画布的函数不能持久化，也不属于严格 API Schema。
      outputs: item.data.outputs.map(({ invalidCondition: _, ...output }) => output),
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
  getNodeById,
  edges,
  chatConfig,
  t,
  getIncomingEdges
}: {
  nodeId: string;
  getNodeById: (nodeId: string | null | undefined) => FlowNodeItemType | undefined;
  edges: readonly WorkflowGraphEdge[];
  chatConfig: DeepReadonly<AppChatConfigType>;
  t: TFunction;
  /** Runtime 入边索引；传了上游遍历就是 O(入度) 而不是每个节点全量扫一遍边。 */
  getIncomingEdges?: (nodeId: string) => readonly WorkflowGraphEdge[];
}) => {
  const currentNode = getNodeById(nodeId);
  if (!currentNode) return [];

  const nodeVariables = currentNode.inputs
    .filter((input) => input.canEdit)
    .map((item) => ({
      key: item.key,
      label: item.label ?? item.key,
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
    chatConfig: chatConfig as AppChatConfigType,
    t,
    getIncomingEdges
  });

  const sourceNodeVariables = !sourceNodes
    ? []
    : sourceNodes
        .map((node) => {
          return node.outputs
            .filter((output) => {
              if (output.type === FlowNodeOutputTypeEnum.error) {
                return node.catchError === true;
              }
              return (
                !!output.label &&
                output.invalid !== true &&
                output.id !== NodeOutputKeyEnum.addOutputParam
              );
            })
            .map((output) => {
              return {
                label:
                  node.nodeId === VARIABLE_NODE_ID &&
                  !workflowSystemVariables.some((item) => item.key === output.id)
                    ? (output.label ?? output.id)
                    : t((output.label as any) || ''),
                key: output.id,
                parent: {
                  id: node.nodeId,
                  label: node.name,
                  avatar: node.avatar
                }
              };
            });
        })
        .flat();

  return [...nodeVariables, ...sourceNodeVariables];
};
