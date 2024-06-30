import type {
  StoreNodeItemType,
  FlowNodeItemType,
  FlowNodeTemplateType
} from '@fastgpt/global/core/workflow/type/index.d';
import type { Edge, Node, XYPosition } from 'reactflow';
import { moduleTemplatesFlat } from '@fastgpt/global/core/workflow/template/constants';
import {
  EDGE_TYPE,
  FlowNodeInputTypeEnum,
  FlowNodeTypeEnum
} from '@fastgpt/global/core/workflow/node/constant';
import { EmptyNode } from '@fastgpt/global/core/workflow/template/system/emptyNode';
import { StoreEdgeItemType } from '@fastgpt/global/core/workflow/type/edge';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import { getGlobalVariableNode } from './adapt';
import { VARIABLE_NODE_ID, WorkflowIOValueTypeEnum } from '@fastgpt/global/core/workflow/constants';
import { NodeInputKeyEnum, NodeOutputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { EditorVariablePickerType } from '@fastgpt/web/components/common/Textarea/PromptEditor/type';
import {
  formatEditorVariablePickerIcon,
  getAppChatConfig,
  getGuideModule
} from '@fastgpt/global/core/workflow/utils';
import { getSystemVariables } from '../app/utils';
import { TFunction } from 'next-i18next';
import {
  FlowNodeInputItemType,
  FlowNodeOutputItemType,
  ReferenceValueProps
} from '@fastgpt/global/core/workflow/type/io';
import { IfElseListItemType } from '@fastgpt/global/core/workflow/template/system/ifElse/type';
import { VariableConditionEnum } from '@fastgpt/global/core/workflow/template/system/ifElse/constant';
import { AppChatConfigType } from '@fastgpt/global/core/app/type';
import { cloneDeep, isEqual } from 'lodash';

export const nodeTemplate2FlowNode = ({
  template,
  position,
  selected
}: {
  template: FlowNodeTemplateType;
  position: XYPosition;
  selected?: boolean;
}): Node<FlowNodeItemType> => {
  // replace item data
  const moduleItem: FlowNodeItemType = {
    ...template,
    nodeId: getNanoid()
  };

  return {
    id: moduleItem.nodeId,
    type: moduleItem.flowNodeType,
    data: moduleItem,
    position: position,
    selected
  };
};
export const storeNode2FlowNode = ({
  item: storeNode,
  selected = false
}: {
  item: StoreNodeItemType;
  selected?: boolean;
}): Node<FlowNodeItemType> => {
  // init some static data
  const template =
    moduleTemplatesFlat.find((template) => template.flowNodeType === storeNode.flowNodeType) ||
    EmptyNode;

  // replace item data
  const moduleItem: FlowNodeItemType = {
    ...template,
    ...storeNode,
    avatar: storeNode?.avatar || template?.avatar,
    inputs: storeNode.inputs
      .map((storeInput) => {
        const templateInput =
          template.inputs.find((item) => item.key === storeInput.key) || storeInput;
        return {
          ...templateInput,
          ...storeInput,
          renderTypeList: templateInput.renderTypeList
        };
      })
      .concat(
        template.inputs.filter((item) => !storeNode.inputs.some((input) => input.key === item.key))
      ),
    outputs: storeNode.outputs.map((storeOutput) => {
      const templateOutput =
        template.outputs.find((item) => item.key === storeOutput.key) || storeOutput;
      return {
        ...storeOutput,
        ...templateOutput,
        value: storeOutput.value
      };
    }),
    version: storeNode.version || '481'
  };

  return {
    id: storeNode.nodeId,
    type: storeNode.flowNodeType,
    data: moduleItem,
    selected,
    position: storeNode.position || { x: 0, y: 0 }
  };
};
export const storeEdgesRenderEdge = ({ edge }: { edge: StoreEdgeItemType }) => {
  return {
    ...edge,
    id: getNanoid(),
    type: EDGE_TYPE
  };
};

export const computedNodeInputReference = ({
  nodeId,
  nodes,
  edges,
  chatConfig,
  t
}: {
  nodeId: string;
  nodes: FlowNodeItemType[];
  edges: Edge[];
  chatConfig: AppChatConfigType;
  t: TFunction;
}) => {
  // get current node
  const node = nodes.find((item) => item.nodeId === nodeId);
  if (!node) {
    return;
  }
  let sourceNodes: FlowNodeItemType[] = [];
  // 根据 edge 获取所有的 source 节点（source节点会继续向前递归获取）
  const findSourceNode = (nodeId: string) => {
    const targetEdges = edges.filter((item) => item.target === nodeId);
    targetEdges.forEach((edge) => {
      const sourceNode = nodes.find((item) => item.nodeId === edge.source);
      if (!sourceNode) return;

      // 去重
      if (sourceNodes.some((item) => item.nodeId === sourceNode.nodeId)) {
        return;
      }
      sourceNodes.push(sourceNode);
      findSourceNode(sourceNode.nodeId);
    });
  };
  findSourceNode(nodeId);

  sourceNodes.unshift(
    getGlobalVariableNode({
      nodes,
      t,
      chatConfig
    })
  );

  return sourceNodes;
};
export const getRefData = ({
  variable,
  nodeList,
  chatConfig,
  t
}: {
  variable?: ReferenceValueProps;
  nodeList: FlowNodeItemType[];
  chatConfig: AppChatConfigType;
  t: TFunction;
}) => {
  if (!variable)
    return {
      valueType: WorkflowIOValueTypeEnum.any,
      required: false
    };

  const node = nodeList.find((node) => node.nodeId === variable[0]);
  const systemVariables = getWorkflowGlobalVariables({ nodes: nodeList, chatConfig, t });

  if (!node) {
    const globalVariable = systemVariables.find((item) => item.key === variable?.[1]);
    return {
      valueType: globalVariable?.valueType || WorkflowIOValueTypeEnum.any,
      required: !!globalVariable?.required
    };
  }

  const output = node.outputs.find((item) => item.id === variable[1]);
  if (!output)
    return {
      valueType: WorkflowIOValueTypeEnum.any,
      required: false
    };

  return {
    valueType: output.valueType,
    required: !!output.required
  };
};

/* Connection rules */
export const checkWorkflowNodeAndConnection = ({
  nodes,
  edges
}: {
  nodes: Node<FlowNodeItemType, string | undefined>[];
  edges: Edge<any>[];
}): string[] | undefined => {
  // 1. reference check. Required value
  for (const node of nodes) {
    const data = node.data;
    const inputs = data.inputs;
    const isToolNode = edges.some(
      (edge) =>
        edge.targetHandle === NodeOutputKeyEnum.selectedTools && edge.target === node.data.nodeId
    );

    if (
      data.flowNodeType === FlowNodeTypeEnum.systemConfig ||
      data.flowNodeType === FlowNodeTypeEnum.pluginInput ||
      data.flowNodeType === FlowNodeTypeEnum.pluginOutput ||
      data.flowNodeType === FlowNodeTypeEnum.workflowStart
    ) {
      continue;
    }

    if (data.flowNodeType === FlowNodeTypeEnum.ifElseNode) {
      const ifElseList: IfElseListItemType[] = inputs.find(
        (input) => input.key === NodeInputKeyEnum.ifElseList
      )?.value;
      if (
        ifElseList.some((item) => {
          return item.list.some((listItem) => {
            return (
              listItem.variable === undefined ||
              listItem.condition === undefined ||
              (listItem.value === undefined &&
                listItem.condition !== VariableConditionEnum.isEmpty &&
                listItem.condition !== VariableConditionEnum.isNotEmpty)
            );
          });
        })
      ) {
        return [data.nodeId];
      } else {
        continue;
      }
    }

    // check node input
    if (
      inputs.some((input) => {
        // check is tool input
        if (isToolNode && input.toolDescription) {
          return false;
        }

        if (input.required) {
          if (Array.isArray(input.value) && input.value.length === 0) return true;
          if (input.value === undefined) return true;
        }

        // check reference invalid
        const renderType = input.renderTypeList[input.selectedTypeIndex || 0];
        if (renderType === FlowNodeInputTypeEnum.reference && input.required) {
          if (!input.value || !Array.isArray(input.value) || input.value.length !== 2) {
            return true;
          }

          // variable key not need to check
          if (input.value[0] === VARIABLE_NODE_ID) {
            return false;
          }

          // Can not find key
          const sourceNode = nodes.find((item) => item.data.nodeId === input.value[0]);
          if (!sourceNode) {
            return true;
          }
          const sourceOutput = sourceNode.data.outputs.find((item) => item.id === input.value[1]);
          if (!sourceOutput) {
            return true;
          }
        }
        return false;
      })
    ) {
      return [data.nodeId];
    }

    // check empty node(not edge)
    const hasEdge = edges.some(
      (edge) => edge.source === data.nodeId || edge.target === data.nodeId
    );
    if (!hasEdge) {
      return [data.nodeId];
    }
  }
};

export const filterSensitiveNodesData = (nodes: StoreNodeItemType[]) => {
  const cloneNodes = JSON.parse(JSON.stringify(nodes)) as StoreNodeItemType[];

  cloneNodes.forEach((node) => {
    // selected dataset
    if (node.flowNodeType === FlowNodeTypeEnum.datasetSearchNode) {
      node.inputs.forEach((input) => {
        if (input.key === NodeInputKeyEnum.datasetSelectList) {
          input.value = [];
        }
      });
    }

    return node;
  });
  return cloneNodes;
};

/* get workflowStart output to global variables */
export const getWorkflowGlobalVariables = ({
  nodes,
  chatConfig,
  t
}: {
  nodes: FlowNodeItemType[];
  chatConfig: AppChatConfigType;
  t: TFunction;
}): EditorVariablePickerType[] => {
  const globalVariables = formatEditorVariablePickerIcon(
    getAppChatConfig({
      chatConfig,
      systemConfigNode: getGuideModule(nodes),
      isPublicFetch: true
    })?.variables || []
  ).map((item) => ({
    ...item,
    valueType: WorkflowIOValueTypeEnum.any
  }));

  const systemVariables = getSystemVariables(t);

  return [...globalVariables, ...systemVariables];
};

export type CombinedItemType = Partial<FlowNodeInputItemType> & Partial<FlowNodeOutputItemType>;

export const updateFlowNodeVersion = (
  node: FlowNodeItemType,
  template: FlowNodeTemplateType
): FlowNodeItemType => {
  function updateArrayBasedOnTemplate<T extends FlowNodeInputItemType | FlowNodeOutputItemType>(
    nodeArray: T[],
    templateArray: T[]
  ): T[] {
    return templateArray.map((templateItem) => {
      const nodeItem = nodeArray.find((item) => item.key === templateItem.key);
      if (nodeItem) {
        return { ...templateItem, ...nodeItem } as T;
      }
      return { ...templateItem };
    });
  }

  const updatedNode: FlowNodeItemType = {
    ...node,
    ...template,
    name: node.name,
    intro: node.intro
  };

  if (node.inputs && template.inputs) {
    updatedNode.inputs = updateArrayBasedOnTemplate(node.inputs, template.inputs);
  }
  if (node.outputs && template.outputs) {
    updatedNode.outputs = updateArrayBasedOnTemplate(node.outputs, template.outputs);
  }

  return updatedNode;
};

type WorkflowType = {
  nodes: StoreNodeItemType[];
  edges: StoreEdgeItemType[];
  chatConfig: AppChatConfigType;
};
export const compareWorkflow = (workflow1: WorkflowType, workflow2: WorkflowType) => {
  const clone1 = cloneDeep(workflow1);
  const clone2 = cloneDeep(workflow2);

  if (!isEqual(clone1.edges, clone2.edges)) {
    console.log('Edge not equal');
    return false;
  }

  if (
    clone1.chatConfig &&
    clone2.chatConfig &&
    !isEqual(
      {
        welcomeText: clone1.chatConfig?.welcomeText || '',
        variables: clone1.chatConfig?.variables || [],
        questionGuide: clone1.chatConfig?.questionGuide || false,
        ttsConfig: clone1.chatConfig?.ttsConfig || undefined,
        whisperConfig: clone1.chatConfig?.whisperConfig || undefined,
        scheduledTriggerConfig: clone1.chatConfig?.scheduledTriggerConfig || undefined,
        chatInputGuide: clone1.chatConfig?.chatInputGuide || undefined
      },
      {
        welcomeText: clone2.chatConfig?.welcomeText || '',
        variables: clone2.chatConfig?.variables || [],
        questionGuide: clone2.chatConfig?.questionGuide || false,
        ttsConfig: clone2.chatConfig?.ttsConfig || undefined,
        whisperConfig: clone2.chatConfig?.whisperConfig || undefined,
        scheduledTriggerConfig: clone2.chatConfig?.scheduledTriggerConfig || undefined,
        chatInputGuide: clone2.chatConfig?.chatInputGuide || undefined
      }
    )
  ) {
    console.log('chatConfig not equal');
    return false;
  }

  const node1 = clone1.nodes.filter(Boolean).map((node) => ({
    flowNodeType: node.flowNodeType,
    inputs: node.inputs.map((input) => ({
      ...input,
      value: input.value ?? undefined
    })),
    outputs: node.outputs.map((input) => ({
      ...input,
      value: input.value ?? undefined
    })),
    name: node.name,
    intro: node.intro,
    avatar: node.avatar,
    version: node.version,
    position: node.position
  }));
  const node2 = clone2.nodes.filter(Boolean).map((node) => ({
    flowNodeType: node.flowNodeType,
    inputs: node.inputs.map((input) => ({
      ...input,
      value: input.value ?? undefined
    })),
    outputs: node.outputs.map((input) => ({
      ...input,
      value: input.value ?? undefined
    })),
    name: node.name,
    intro: node.intro,
    avatar: node.avatar,
    version: node.version,
    position: node.position
  }));

  // console.log(node1);
  // console.log(node2);

  return isEqual(node1, node2);
};
