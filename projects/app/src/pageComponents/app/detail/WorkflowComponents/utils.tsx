import { computedNodeInputReference } from '@/web/core/workflow/utils';
import { AppDetailType } from '@fastgpt/global/core/app/type';
import { NodeInputKeyEnum, NodeOutputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { StoreEdgeItemType } from '@fastgpt/global/core/workflow/type/edge';
import { FlowNodeItemType, StoreNodeItemType } from '@fastgpt/global/core/workflow/type/node.d';
import { TFunction } from 'i18next';
import { type Node, type Edge } from 'reactflow';

export const uiWorkflow2StoreWorkflow = ({
  nodes,
  edges
}: {
  nodes: Node<FlowNodeItemType, string | undefined>[];
  edges: Edge<any>[];
}) => {
  const formatNodes: StoreNodeItemType[] = nodes.map((item) => ({
    nodeId: item.data.nodeId,
    parentNodeId: item.data.parentNodeId,
    name: item.data.name,
    intro: item.data.intro,
    avatar: item.data.avatar,
    flowNodeType: item.data.flowNodeType,
    showStatus: item.data.showStatus,
    position: item.position,
    version: item.data.version,
    inputs: item.data.inputs,
    outputs: item.data.outputs,
    pluginId: item.data.pluginId,
    isFolded: item.data.isFolded
  }));

  // get all handle
  const reactFlowViewport = document.querySelector('.react-flow__viewport');
  // Gets the value of data-handleid on all elements below it whose data-handleid is not empty
  const handleList =
    reactFlowViewport?.querySelectorAll('[data-handleid]:not([data-handleid=""])') || [];
  const handleIdList = Array.from(handleList).map(
    (item) => item.getAttribute('data-handleid') || ''
  );
  const formatEdges: StoreEdgeItemType[] = edges
    .map((item) => ({
      source: item.source,
      target: item.target,
      sourceHandle: item.sourceHandle || '',
      targetHandle: item.targetHandle || ''
    }))
    .filter((item) => item.sourceHandle && item.targetHandle)
    .filter(
      // Filter out edges that do not have both sourceHandle and targetHandle
      (item) => {
        if (!reactFlowViewport) return true;
        const currentSourceNode = nodes.find((node) => node.data.nodeId === item.source);

        if (currentSourceNode?.data.isFolded) return true;

        // Not in react flow page
        return handleIdList.includes(item.sourceHandle) && handleIdList.includes(item.targetHandle);
      }
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

export default function Dom() {
  return <></>;
}

export const getEditorVariables = ({
  nodeId,
  nodeList,
  edges,
  appDetail,
  t
}: {
  nodeId: string;
  nodeList: FlowNodeItemType[];
  edges: Edge<any>[];
  appDetail: AppDetailType;
  t: TFunction;
}) => {
  const currentNode = nodeList.find((node) => node.nodeId === nodeId);
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

  const sourceNodes = computedNodeInputReference({
    nodeId,
    nodes: nodeList,
    edges: edges,
    chatConfig: appDetail.chatConfig,
    t
  });

  const sourceNodeVariables = !sourceNodes
    ? []
    : sourceNodes
        .map((node) => {
          return node.outputs
            .filter((output) => !!output.label && output.id !== NodeOutputKeyEnum.addOutputParam)
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
