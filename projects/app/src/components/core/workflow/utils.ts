import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { StoreEdgeItemType } from '@fastgpt/global/core/workflow/type/edge';
import { FlowNodeItemType, StoreNodeItemType } from '@fastgpt/global/core/workflow/type/index.d';
import { type Node, type Edge } from 'reactflow';

export const flowNode2StoreNodes = ({
  nodes,
  edges
}: {
  nodes: Node<FlowNodeItemType, string | undefined>[];
  edges: Edge<any>[];
}) => {
  const formatNodes: StoreNodeItemType[] = nodes.map((item) => ({
    nodeId: item.data.nodeId,
    name: item.data.name,
    intro: item.data.intro,
    avatar: item.data.avatar,
    flowNodeType: item.data.flowNodeType,
    showStatus: item.data.showStatus,
    position: item.position,
    inputs: item.data.inputs,
    outputs: item.data.outputs,
    pluginId: item.data.pluginId
  }));
  const formatEdges: StoreEdgeItemType[] = edges
    .map((item) => ({
      source: item.source,
      target: item.target,
      sourceHandle: item.sourceHandle || '',
      targetHandle: item.targetHandle || ''
    }))
    .filter((item) => item.sourceHandle && item.targetHandle);

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
