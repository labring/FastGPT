import type {
  StoreNodeItemType,
  FlowNodeItemType
} from '@fastgpt/global/core/workflow/type/node.d';
import type { FlowNodeTemplateType } from '@fastgpt/global/core/workflow/type/node';
import type { Edge, Node, XYPosition } from 'reactflow';
import { moduleTemplatesFlat } from '@fastgpt/global/core/workflow/template/constants';
import {
  EDGE_TYPE,
  FlowNodeInputTypeEnum,
  FlowNodeOutputTypeEnum,
  FlowNodeTypeEnum,
  defaultNodeVersion
} from '@fastgpt/global/core/workflow/node/constant';
import { EmptyNode } from '@fastgpt/global/core/workflow/template/system/emptyNode';
import { StoreEdgeItemType } from '@fastgpt/global/core/workflow/type/edge';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import { getGlobalVariableNode } from './adapt';
import { WorkflowIOValueTypeEnum } from '@fastgpt/global/core/workflow/constants';
import { NodeInputKeyEnum, NodeOutputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { EditorVariablePickerType } from '@fastgpt/web/components/common/Textarea/PromptEditor/type';
import {
  formatEditorVariablePickerIcon,
  getAppChatConfig,
  getGuideModule,
  isValidArrayReferenceValue,
  isValidReferenceValue
} from '@fastgpt/global/core/workflow/utils';
import { TFunction } from 'next-i18next';
import {
  FlowNodeInputItemType,
  FlowNodeOutputItemType,
  ReferenceItemValueType
} from '@fastgpt/global/core/workflow/type/io';
import { IfElseListItemType } from '@fastgpt/global/core/workflow/template/system/ifElse/type';
import { VariableConditionEnum } from '@fastgpt/global/core/workflow/template/system/ifElse/constant';
import { AppChatConfigType } from '@fastgpt/global/core/app/type';
import { cloneDeep, isEqual } from 'lodash';
import { getInputComponentProps } from '@fastgpt/global/core/workflow/node/io/utils';
import { workflowSystemVariables } from '../app/utils';

export const nodeTemplate2FlowNode = ({
  template,
  position,
  selected,
  parentNodeId,
  zIndex,
  t
}: {
  template: FlowNodeTemplateType;
  position: XYPosition;
  selected?: boolean;
  parentNodeId?: string;
  zIndex?: number;
  t: TFunction;
}): Node<FlowNodeItemType> => {
  // replace item data
  const moduleItem: FlowNodeItemType = {
    ...template,
    name: t(template.name as any),
    nodeId: getNanoid(),
    parentNodeId
  };

  return {
    id: moduleItem.nodeId,
    type: moduleItem.flowNodeType,
    data: moduleItem,
    position: position,
    selected,
    zIndex
  };
};
export const storeNode2FlowNode = ({
  item: storeNode,
  selected = false,
  zIndex,
  parentNodeId,
  t
}: {
  item: StoreNodeItemType;
  selected?: boolean;
  zIndex?: number;
  parentNodeId?: string;
  t: TFunction;
}): Node<FlowNodeItemType> => {
  // init some static data
  const template =
    moduleTemplatesFlat.find((template) => template.flowNodeType === storeNode.flowNodeType) ||
    EmptyNode;

  const templateInputs = template.inputs.filter((input) => !input.canEdit);
  const templateOutputs = template.outputs.filter(
    (output) => output.type !== FlowNodeOutputTypeEnum.dynamic
  );
  const dynamicInput = template.inputs.find(
    (input) => input.renderTypeList[0] === FlowNodeInputTypeEnum.addInputParam
  );

  // replace item data
  const nodeItem: FlowNodeItemType = {
    parentNodeId,
    ...template,
    ...storeNode,
    avatar: template.avatar ?? storeNode.avatar,
    version: storeNode.version ?? template.version ?? defaultNodeVersion,
    /* 
      Inputs and outputs, New fields are added, not reduced
    */
    inputs: templateInputs
      .map<FlowNodeInputItemType>((templateInput) => {
        const storeInput =
          storeNode.inputs.find((item) => item.key === templateInput.key) || templateInput;

        return {
          ...storeInput,
          ...templateInput,

          debugLabel: t(templateInput.debugLabel ?? (storeInput.debugLabel as any)),
          toolDescription: t(templateInput.toolDescription ?? (storeInput.toolDescription as any)),

          selectedTypeIndex: storeInput.selectedTypeIndex ?? templateInput.selectedTypeIndex,
          value: storeInput.value ?? templateInput.value,
          label: storeInput.label ?? templateInput.label
        };
      })
      .concat(
        /* Concat dynamic inputs */
        storeNode.inputs
          .filter((item) => !templateInputs.find((input) => input.key === item.key))
          .map((item) => {
            if (!dynamicInput) return item;

            return {
              ...item,
              ...getInputComponentProps(dynamicInput)
            };
          })
      ),
    outputs: templateOutputs
      .map<FlowNodeOutputItemType>((templateOutput) => {
        const storeOutput =
          template.outputs.find((item) => item.key === templateOutput.key) || templateOutput;

        return {
          ...storeOutput,
          ...templateOutput,

          description: t(templateOutput.description ?? (storeOutput.description as any)),

          id: storeOutput.id ?? templateOutput.id,
          label: storeOutput.label ?? templateOutput.label,
          value: storeOutput.value ?? templateOutput.value
        };
      })
      .concat(
        storeNode.outputs.filter(
          (item) => !templateOutputs.find((output) => output.key === item.key)
        )
      )
  };

  return {
    id: storeNode.nodeId,
    type: storeNode.flowNodeType,
    data: nodeItem,
    selected,
    position: storeNode.position || { x: 0, y: 0 },
    zIndex
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
  const parentId = node.parentNodeId;
  let sourceNodes: FlowNodeItemType[] = [];
  // 根据 edge 获取所有的 source 节点（source节点会继续向前递归获取）
  const findSourceNode = (nodeId: string) => {
    const targetEdges = edges.filter((item) => item.target === nodeId || item.target === parentId);
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

  sourceNodes.push(
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
  chatConfig
}: {
  variable?: ReferenceItemValueType;
  nodeList: FlowNodeItemType[];
  chatConfig: AppChatConfigType;
}) => {
  if (!variable)
    return {
      valueType: WorkflowIOValueTypeEnum.any,
      required: false
    };

  const node = nodeList.find((node) => node.nodeId === variable[0]);
  const systemVariables = getWorkflowGlobalVariables({ nodes: nodeList, chatConfig });

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

// 根据数据类型，过滤无效的节点输出
export const filterWorkflowNodeOutputsByType = (
  outputs: FlowNodeOutputItemType[],
  valueType: WorkflowIOValueTypeEnum
): FlowNodeOutputItemType[] => {
  const validTypeMap: Record<WorkflowIOValueTypeEnum, WorkflowIOValueTypeEnum[]> = {
    [WorkflowIOValueTypeEnum.string]: [WorkflowIOValueTypeEnum.string],
    [WorkflowIOValueTypeEnum.number]: [WorkflowIOValueTypeEnum.number],
    [WorkflowIOValueTypeEnum.boolean]: [WorkflowIOValueTypeEnum.boolean],
    [WorkflowIOValueTypeEnum.object]: [WorkflowIOValueTypeEnum.object],
    [WorkflowIOValueTypeEnum.arrayString]: [
      WorkflowIOValueTypeEnum.string,
      WorkflowIOValueTypeEnum.arrayString,
      WorkflowIOValueTypeEnum.arrayAny
    ],
    [WorkflowIOValueTypeEnum.arrayNumber]: [
      WorkflowIOValueTypeEnum.number,
      WorkflowIOValueTypeEnum.arrayNumber,
      WorkflowIOValueTypeEnum.arrayAny
    ],
    [WorkflowIOValueTypeEnum.arrayBoolean]: [
      WorkflowIOValueTypeEnum.boolean,
      WorkflowIOValueTypeEnum.arrayBoolean,
      WorkflowIOValueTypeEnum.arrayAny
    ],
    [WorkflowIOValueTypeEnum.arrayObject]: [
      WorkflowIOValueTypeEnum.object,
      WorkflowIOValueTypeEnum.arrayObject,
      WorkflowIOValueTypeEnum.arrayAny,
      WorkflowIOValueTypeEnum.chatHistory,
      WorkflowIOValueTypeEnum.datasetQuote,
      WorkflowIOValueTypeEnum.dynamic,
      WorkflowIOValueTypeEnum.selectDataset,
      WorkflowIOValueTypeEnum.selectApp
    ],
    [WorkflowIOValueTypeEnum.chatHistory]: [
      WorkflowIOValueTypeEnum.chatHistory,
      WorkflowIOValueTypeEnum.arrayAny
    ],
    [WorkflowIOValueTypeEnum.datasetQuote]: [
      WorkflowIOValueTypeEnum.datasetQuote,
      WorkflowIOValueTypeEnum.arrayAny
    ],
    [WorkflowIOValueTypeEnum.dynamic]: [
      WorkflowIOValueTypeEnum.dynamic,
      WorkflowIOValueTypeEnum.arrayAny
    ],
    [WorkflowIOValueTypeEnum.selectDataset]: [
      WorkflowIOValueTypeEnum.selectDataset,
      WorkflowIOValueTypeEnum.arrayAny
    ],
    [WorkflowIOValueTypeEnum.selectApp]: [
      WorkflowIOValueTypeEnum.selectApp,
      WorkflowIOValueTypeEnum.arrayAny
    ],
    [WorkflowIOValueTypeEnum.arrayAny]: [WorkflowIOValueTypeEnum.arrayAny],
    [WorkflowIOValueTypeEnum.any]: [WorkflowIOValueTypeEnum.arrayAny]
  };

  return outputs.filter(
    (output) =>
      valueType === WorkflowIOValueTypeEnum.any ||
      valueType === WorkflowIOValueTypeEnum.arrayAny ||
      !output.valueType ||
      output.valueType === WorkflowIOValueTypeEnum.any ||
      validTypeMap[valueType].includes(output.valueType)
  );
};

/* Connection rules */
export const checkWorkflowNodeAndConnection = ({
  nodes,
  edges
}: {
  nodes: Node<FlowNodeItemType, string | undefined>[];
  edges: Edge<any>[];
}): string[] | undefined => {
  const nodeIds: string[] = nodes.map((node) => node.data.nodeId);
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
      data.flowNodeType === FlowNodeTypeEnum.pluginConfig ||
      data.flowNodeType === FlowNodeTypeEnum.pluginInput ||
      data.flowNodeType === FlowNodeTypeEnum.workflowStart ||
      data.flowNodeType === FlowNodeTypeEnum.comment
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

        // Check plugin output
        // if (
        //   node.data.flowNodeType === FlowNodeTypeEnum.pluginOutput &&
        //   (input.value?.length === 0 ||
        //     (isValidReferenceValue(input.value, nodeIds) && !input.value?.[1]))
        // ) {
        //   return true;
        // }

        // check reference invalid
        const renderType = input.renderTypeList[input.selectedTypeIndex || 0];
        if (renderType === FlowNodeInputTypeEnum.reference) {
          if (input.valueType?.startsWith('array')) {
            if (input.required && (!input.value || input.value.length === 0)) {
              return true;
            }

            return !isValidArrayReferenceValue(input.value, nodeIds);
          }

          // Single reference
          return input.required && !isValidReferenceValue(input.value, nodeIds);
        }
        return false;
      })
    ) {
      return [data.nodeId];
    }

    // filter tools node edge
    const edgeFilted = edges.filter(
      (edge) =>
        !(
          data.flowNodeType === FlowNodeTypeEnum.tools &&
          edge.sourceHandle === NodeOutputKeyEnum.selectedTools
        )
    );
    // check node has edge
    const hasEdge = edgeFilted.some(
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
  chatConfig
}: {
  nodes: FlowNodeItemType[];
  chatConfig: AppChatConfigType;
}): EditorVariablePickerType[] => {
  const globalVariables = formatEditorVariablePickerIcon(
    getAppChatConfig({
      chatConfig,
      systemConfigNode: getGuideModule(nodes),
      isPublicFetch: true
    })?.variables || []
  );

  return [...globalVariables, ...workflowSystemVariables];
};

export type CombinedItemType = Partial<FlowNodeInputItemType> & Partial<FlowNodeOutputItemType>;

/* Reset node to latest version */
export const getLatestNodeTemplate = (
  node: FlowNodeItemType,
  template: FlowNodeTemplateType
): FlowNodeItemType => {
  const updatedNode: FlowNodeItemType = {
    ...node,
    ...template,
    inputs: template.inputs.map((templateItem) => {
      const nodeItem = node.inputs.find((item) => item.key === templateItem.key);
      if (nodeItem) {
        return {
          ...templateItem,
          value: nodeItem.value,
          selectedTypeIndex: nodeItem.selectedTypeIndex,
          valueType: nodeItem.valueType
        };
      }
      return { ...templateItem };
    }),
    outputs: template.outputs.map((templateItem) => {
      const nodeItem = node.outputs.find((item) => item.key === templateItem.key);
      if (nodeItem) {
        return {
          ...templateItem,
          id: nodeItem.id,
          value: nodeItem.value,
          valueType: nodeItem.valueType
        };
      }
      return { ...templateItem };
    }),
    name: node.name,
    intro: node.intro
  };

  return updatedNode;
};

export const compareSnapshot = (
  snapshot1: {
    nodes?: Node[];
    edges: Edge<any>[] | undefined;
    chatConfig?: AppChatConfigType;
  },
  snapshot2: {
    nodes?: Node[];
    edges: Edge<any>[];
    chatConfig?: AppChatConfigType;
  }
) => {
  const clone1 = cloneDeep(snapshot1);
  const clone2 = cloneDeep(snapshot2);

  if (!clone1.nodes || !clone2.nodes) return false;
  const formatEdge = (edges: Edge[] | undefined) => {
    if (!edges) return [];
    return edges.map((edge) => ({
      source: edge.source,
      target: edge.target,
      sourceHandle: edge.sourceHandle,
      targetHandle: edge.targetHandle,
      type: edge.type
    }));
  };

  if (!isEqual(formatEdge(clone1.edges), formatEdge(clone2.edges))) {
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
        chatInputGuide: clone1.chatConfig?.chatInputGuide || undefined,
        fileSelectConfig: clone1.chatConfig?.fileSelectConfig || undefined,
        instruction: clone1.chatConfig?.instruction || ''
      },
      {
        welcomeText: clone2.chatConfig?.welcomeText || '',
        variables: clone2.chatConfig?.variables || [],
        questionGuide: clone2.chatConfig?.questionGuide || false,
        ttsConfig: clone2.chatConfig?.ttsConfig || undefined,
        whisperConfig: clone2.chatConfig?.whisperConfig || undefined,
        scheduledTriggerConfig: clone2.chatConfig?.scheduledTriggerConfig || undefined,
        chatInputGuide: clone2.chatConfig?.chatInputGuide || undefined,
        fileSelectConfig: clone2.chatConfig?.fileSelectConfig || undefined,
        instruction: clone2.chatConfig?.instruction || ''
      }
    )
  ) {
    console.log('chatConfig not equal');
    return false;
  }

  const formatNodes = (nodes: Node[]) => {
    return nodes
      .filter((node) => {
        if (!node) return;
        if (FlowNodeTypeEnum.systemConfig === node.type) return;

        return true;
      })
      .map((node) => ({
        id: node.id,
        type: node.type,
        position: node.position,
        data: {
          id: node.data.id,
          flowNodeType: node.data.flowNodeType,
          inputs: node.data.inputs.map((input: FlowNodeInputItemType) => ({
            key: input.key,
            selectedTypeIndex: input.selectedTypeIndex ?? 0,
            renderTypeLis: input.renderTypeList,
            valueType: input.valueType,
            value: input.value ?? undefined
          })),
          outputs: node.data.outputs.map((item: FlowNodeOutputItemType) => ({
            key: item.key,
            type: item.type,
            value: item.value ?? undefined
          })),
          name: node.data.name,
          intro: node.data.intro,
          avatar: node.data.avatar,
          version: node.data.version,
          isFolded: node.data.isFolded
        }
      }));
  };
  const node1 = formatNodes(clone1.nodes);
  const node2 = formatNodes(clone2.nodes);

  node1.forEach((node, i) => {
    if (!isEqual(node, node2[i])) {
      console.log('node not equal');
    }
  });

  return isEqual(node1, node2);
};
