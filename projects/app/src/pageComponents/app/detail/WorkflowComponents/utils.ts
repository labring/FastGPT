import { getNodeAllSource, workflowReferenceValueIsSelectable } from '@/web/core/workflow/utils';
import { type AppChatConfigType, type AppDetailType } from '@fastgpt/global/core/app/type';
import { filterSystemConfigNodes } from '@fastgpt/global/core/workflow/utils';
import { NodeInputKeyEnum, NodeOutputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import {
  FlowNodeOutputTypeEnum,
  FlowNodeTypeEnum
} from '@fastgpt/global/core/workflow/node/constant';
import type { StoreEdgeItemType } from '@fastgpt/global/core/workflow/type/edge';
import {
  type FlowNodeItemType,
  type StoreNodeItemType
} from '@fastgpt/global/core/workflow/type/node';
import type {
  FlowNodeInputItemType,
  ReferenceItemValueType,
  ReferenceValueType
} from '@fastgpt/global/core/workflow/type/io';
import { nodeInputIsReference } from '@fastgpt/global/core/workflow/utils';
import { type TFunction } from 'i18next';
import { type Edge, type Node } from 'reactflow';

export const uiWorkflow2StoreWorkflow = ({
  nodes,
  edges,
  chatConfig
}: {
  nodes: Node<FlowNodeItemType, string | undefined>[];
  edges: Edge<any>[];
  chatConfig?: AppChatConfigType;
}) => {
  const getNodeById = (nodeId: string | null | undefined) =>
    nodes.find((node) => node.data.nodeId === nodeId)?.data;
  const systemConfigNode = nodes.find(
    (node) => node.data.flowNodeType === FlowNodeTypeEnum.systemConfig
  )?.data;
  const childrenNodeIdListMap = nodes.reduce<Record<string, string[]>>((map, node) => {
    const parentNodeId = node.data.parentNodeId;
    if (!parentNodeId) return map;

    map[parentNodeId] = [...(map[parentNodeId] ?? []), node.data.nodeId];
    return map;
  }, {});

  const formatNodes: StoreNodeItemType[] = filterSystemConfigNodes(
    nodes.map((item) => ({
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
      inputs: filterUnselectableReferenceInputs({
        node: item.data,
        inputs: item.data.inputs,
        edges,
        chatConfig,
        systemConfigNode,
        getNodeById,
        childrenNodeIdListMap
      }),
      outputs: item.data.outputs,
      isFolded: item.data.isFolded,
      pluginId: item.data.pluginId,
      toolConfig: item.data.toolConfig,
      catchError: item.data.catchError
    }))
  );

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

const emptyT = ((key: string) => key) as TFunction;

/**
 * 保存时仅持久化当前引用选择器仍能选中的引用项。
 * 已删除来源、已删除输出、类型不再匹配的引用在 UI 上不会展示标签，也不应继续写入 JSON。
 */
const filterUnselectableReferenceInputs = ({
  node,
  inputs,
  edges,
  chatConfig,
  systemConfigNode,
  getNodeById,
  childrenNodeIdListMap
}: {
  node: FlowNodeItemType;
  inputs: FlowNodeInputItemType[];
  edges: Edge<any>[];
  chatConfig?: AppChatConfigType;
  systemConfigNode?: FlowNodeItemType;
  getNodeById: (nodeId: string | null | undefined) => FlowNodeItemType | undefined;
  childrenNodeIdListMap: Record<string, string[]>;
}) => {
  return inputs.map((input) => {
    if (!nodeInputIsReference(input)) return input;

    const sourceNodes = getNodeAllSource({
      nodeId: node.nodeId,
      systemConfigNode,
      getNodeById,
      edges,
      chatConfig: chatConfig ?? ({} as AppChatConfigType),
      t: emptyT,
      includeChildren: input.canEdit === true,
      childrenNodeIdListMap
    });

    const value = input.value as ReferenceValueType | undefined;
    if (!Array.isArray(value)) return input;

    if (typeof value[0] === 'string') {
      const keepValue = workflowReferenceValueIsSelectable({
        value,
        sourceNodes,
        valueType: input.valueType
      });
      return keepValue
        ? input
        : {
            ...input,
            value: undefined
          };
    }

    const filteredValue = (value as ReferenceItemValueType[]).filter((item) =>
      workflowReferenceValueIsSelectable({
        value: item,
        sourceNodes,
        valueType: input.valueType
      })
    );

    if (filteredValue.length === value.length) return input;

    return {
      ...input,
      value: filteredValue
    };
  });
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
  systemConfigNode,
  getNodeById,
  edges,
  appDetail,
  t
}: {
  nodeId: string;
  systemConfigNode?: StoreNodeItemType;
  getNodeById: (nodeId: string | null | undefined) => FlowNodeItemType | undefined;
  edges: Edge<any>[];
  appDetail: AppDetailType;
  t: TFunction;
}) => {
  const currentNode = getNodeById(nodeId);
  if (!currentNode) return [];

  const nodeVariables = currentNode.inputs
    .filter((input) => input.canEdit)
    .map((item) => ({
      key: item.key,
      label: item.label,
      parent: {
        id: currentNode.nodeId,
        label: currentNode.name,
        avatar: currentNode.avatar
      }
    }));

  const sourceNodes = getNodeAllSource({
    nodeId,
    systemConfigNode,
    getNodeById,
    edges,
    chatConfig: appDetail.chatConfig,
    t
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
                label: t((output.label as any) || ''),
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
