import { getPreviewPluginNode } from '@/web/core/app/api/plugin';
import { computedNodeInputReference, nodeTemplate2FlowNode } from '@/web/core/workflow/utils';
import { type UseToastOptions } from '@chakra-ui/react';
import { getErrText } from '@fastgpt/global/common/error/utils';
import { type AppDetailType } from '@fastgpt/global/core/app/type';
import { NodeInputKeyEnum, NodeOutputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import {
  AppNodeFlowNodeTypeMap,
  FlowNodeTypeEnum
} from '@fastgpt/global/core/workflow/node/constant';
import { moduleTemplatesFlat } from '@fastgpt/global/core/workflow/template/constants';
import { LoopEndNode } from '@fastgpt/global/core/workflow/template/system/loop/loopEnd';
import { LoopStartNode } from '@fastgpt/global/core/workflow/template/system/loop/loopStart';
import { type StoreEdgeItemType } from '@fastgpt/global/core/workflow/type/edge';
import {
  type NodeTemplateListItemType,
  type FlowNodeItemType,
  type StoreNodeItemType
} from '@fastgpt/global/core/workflow/type/node.d';
import { type TFunction } from 'i18next';
import { type Node, type Edge, type XYPosition } from 'reactflow';

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
            .filter(
              (output) =>
                !!output.label &&
                output.invalid !== true &&
                output.id !== NodeOutputKeyEnum.addOutputParam
            )
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

export const createNodeTemplate = async ({
  template,
  position,
  t,
  setLoading,
  toast,
  computedNewNodeName,
  nodeList
}: {
  template: NodeTemplateListItemType;
  position: XYPosition;
  t: TFunction;
  setLoading: (loading: boolean) => void;
  toast: (options?: UseToastOptions) => void;
  computedNewNodeName: (params: {
    templateName: string;
    flowNodeType: FlowNodeTypeEnum;
    pluginId?: string;
  }) => string;
  nodeList: FlowNodeItemType[];
}) => {
  const templateNode = await (async () => {
    try {
      if (AppNodeFlowNodeTypeMap[template.flowNodeType]) {
        setLoading(true);
        const res = await getPreviewPluginNode({ appId: template.id });
        setLoading(false);
        return res;
      }

      const baseTemplate = moduleTemplatesFlat.find((item) => item.id === template.id);
      if (!baseTemplate) {
        throw new Error('baseTemplate not found');
      }
      return { ...baseTemplate };
    } catch (e) {
      toast({
        status: 'error',
        title: getErrText(e, t('common:core.plugin.Get Plugin Module Detail Failed'))
      });
      setLoading(false);
      return Promise.reject(e);
    }
  })();

  const defaultValueMap: Record<string, any> = {
    [NodeInputKeyEnum.userChatInput]: undefined,
    [NodeInputKeyEnum.fileUrlList]: undefined
  };

  nodeList.forEach((node) => {
    if (node.flowNodeType === FlowNodeTypeEnum.workflowStart) {
      defaultValueMap[NodeInputKeyEnum.userChatInput] = [
        node.nodeId,
        NodeOutputKeyEnum.userChatInput
      ];
      defaultValueMap[NodeInputKeyEnum.fileUrlList] = [[node.nodeId, NodeOutputKeyEnum.userFiles]];
    }
  });

  const newNode = nodeTemplate2FlowNode({
    template: {
      ...templateNode,
      name: computedNewNodeName({
        templateName: t(templateNode.name as any),
        flowNodeType: templateNode.flowNodeType,
        pluginId: templateNode.pluginId
      }),
      intro: t(templateNode.intro as any),
      inputs: templateNode.inputs
        .filter((input) => input.deprecated !== true)
        .map((input) => ({
          ...input,
          value: defaultValueMap[input.key] ?? input.value,
          valueDesc: t(input.valueDesc as any),
          label: t(input.label as any),
          description: t(input.description as any),
          debugLabel: t(input.debugLabel as any),
          toolDescription: t(input.toolDescription as any)
        })),
      outputs: templateNode.outputs
        .filter((output) => output.deprecated !== true)
        .map((output) => ({
          ...output,
          valueDesc: t(output.valueDesc as any),
          label: t(output.label as any),
          description: t(output.description as any)
        }))
    },
    position,
    selected: true,
    t
  });

  const newNodes = [newNode];

  if (templateNode.flowNodeType === FlowNodeTypeEnum.loop) {
    const startNode = nodeTemplate2FlowNode({
      template: LoopStartNode,
      position: { x: position.x + 60, y: position.y + 280 },
      parentNodeId: newNode.id,
      t
    });
    const endNode = nodeTemplate2FlowNode({
      template: LoopEndNode,
      position: { x: position.x + 420, y: position.y + 680 },
      parentNodeId: newNode.id,
      t
    });

    newNodes.push(startNode, endNode);
  }

  return newNodes;
};
