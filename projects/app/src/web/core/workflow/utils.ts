import type { StoreNodeItemType, FlowNodeItemType } from '@fastgpt/global/core/workflow/type/node';
import type { FlowNodeTemplateType } from '@fastgpt/global/core/workflow/type/node';
import type { Edge, Node, XYPosition } from 'reactflow';
import { moduleTemplatesFlat } from '@fastgpt/global/core/workflow/template/constants';
import {
  EDGE_TYPE,
  FlowNodeInputTypeEnum,
  FlowNodeOutputTypeEnum,
  FlowNodeTypeEnum
} from '@fastgpt/global/core/workflow/node/constant';
import { EmptyNode } from '@fastgpt/global/core/workflow/template/system/emptyNode';
import { type StoreEdgeItemType } from '@fastgpt/global/core/workflow/type/edge';
import { i18nT } from '@fastgpt/global/common/i18n/utils';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import { getGlobalVariableNode } from './adapt';
import { VARIABLE_NODE_ID, WorkflowIOValueTypeEnum } from '@fastgpt/global/core/workflow/constants';
import { NodeInputKeyEnum, NodeOutputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { type EditorVariablePickerType } from '@fastgpt/web/components/common/Textarea/PromptEditor/type';
import {
  formatEditorVariablePickerIcon,
  getAppChatConfig,
  getHandleId,
  isValidReferenceValueFormat,
  nodeInputIsReference
} from '@fastgpt/global/core/workflow/utils';
import { type TFunction } from 'next-i18next';
import {
  type FlowNodeInputItemType,
  type FlowNodeOutputItemType,
  type ReferenceItemValueType,
  type ReferenceValueType
} from '@fastgpt/global/core/workflow/type/io';
import { type IfElseListItemType } from '@fastgpt/global/core/workflow/template/system/ifElse/type';
import {
  initNewIfElseList,
  normalizeIfElseList
} from '@fastgpt/global/core/workflow/template/system/ifElse/utils';
import { type AppChatConfigType } from '@fastgpt/global/core/app/type';
import { cloneDeep, isEqual } from 'lodash-es';
import { workflowSystemVariables } from '../app/utils';
import type { WorkflowDataContextType } from '@/pageComponents/app/detail/WorkflowComponents/context/workflowInitContext';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import type { LLMModelItemType } from '@fastgpt/global/core/ai/model.schema';

/* ====== node ======= */
/**
 * 适配从数据库读取出的节点输入。
 * 处理节点输入结构升级，并保证旧工作流加载后符合当前模板约束。
 */
export const adaptStoreNodeInputs = (storeNode: StoreNodeItemType): FlowNodeInputItemType[] => {
  if (storeNode.flowNodeType === FlowNodeTypeEnum.ifElseNode) {
    return storeNode.inputs.map((input) => {
      if (input.key !== NodeInputKeyEnum.ifElseList) return input;

      return {
        ...input,
        value: normalizeIfElseList(input.value as IfElseListItemType[])
      };
    });
  }

  if (storeNode.flowNodeType === FlowNodeTypeEnum.agent) {
    return storeNode.inputs.map((input) => {
      const isManualSelectionInput = [
        NodeInputKeyEnum.skills,
        NodeInputKeyEnum.selectedTools,
        NodeInputKeyEnum.datasetSelectList
      ].includes(input.key as NodeInputKeyEnum);
      if (!isManualSelectionInput) return input;

      // Agent 资源已取消变量引用；旧引用值无法转为资源对象，加载时清空并切回手动选择。
      return {
        ...input,
        selectedTypeIndex: 0,
        value: nodeInputIsReference(input) ? [] : input.value
      };
    });
  }

  if (storeNode.flowNodeType !== FlowNodeTypeEnum.datasetSearchNode) {
    return storeNode.inputs;
  }

  return storeNode.inputs.map((input) => {
    if (input.key !== NodeInputKeyEnum.userChatInput) return input;

    const isReferenceValue = isValidReferenceValueFormat(input.value);

    return {
      ...input,
      key: NodeInputKeyEnum.datasetSearchInput,
      label: i18nT('workflow:search_query'),
      value: isReferenceValue ? [input.value] : input.value,
      valueType: WorkflowIOValueTypeEnum.arrayString,
      selectedTypeIndex: isReferenceValue ? 0 : 1
    };
  });
};

/**
 * 将节点模板转换为画布节点，并按创建时语言初始化可编辑文本。
 * `formatName` 在翻译完成后执行，用于基于实例名称追加重名序号。
 */
export const nodeTemplate2FlowNode = ({
  template,
  position,
  selected,
  parentNodeId,
  zIndex,
  t,
  formatName
}: {
  template: FlowNodeTemplateType;
  position: XYPosition;
  selected?: boolean;
  parentNodeId?: string;
  zIndex?: number;
  t: TFunction;
  formatName?: (name: string) => string;
}): Node<FlowNodeItemType> => {
  const name = t(template.name as any);

  // replace item data
  const moduleItem: FlowNodeItemType = {
    ...template,
    name: formatName?.(name) ?? name,
    intro: template.intro ? t(template.intro as any) : template.intro,
    nodeId: getNanoid(),
    parentNodeId
  };
  if (moduleItem.flowNodeType === FlowNodeTypeEnum.ifElseNode) {
    moduleItem.inputs = moduleItem.inputs.map((input) => {
      if (input.key !== NodeInputKeyEnum.ifElseList) return input;

      return {
        ...input,
        value: initNewIfElseList(input.value as IfElseListItemType[])
      };
    });
  }

  return {
    id: moduleItem.nodeId,
    type: moduleItem.flowNodeType,
    data: moduleItem,
    position: position,
    selected,
    zIndex
  };
};

/**
 * 将持久化节点恢复为画布节点，并在加载时实体化历史 i18n 文本。
 * 名称或描述命中翻译 key 时使用当前语言文本，后续保存会写回实体文本。
 */
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

  const templateInputs = template.inputs.filter(
    (input) => !input.canEdit && input.deprecated !== true
  );
  const templateOutputs = template.outputs.filter(
    (output) => output.type !== FlowNodeOutputTypeEnum.dynamic
  );
  const dynamicInput = template.inputs.find(
    (input) => input.renderTypeList[0] === FlowNodeInputTypeEnum.addInputParam
  );
  const adaptedStoreInputs = adaptStoreNodeInputs(storeNode);

  // replace item data
  const nodeItem: FlowNodeItemType = {
    parentNodeId,
    ...template,
    ...storeNode,
    name: t(storeNode.name as any),
    intro: storeNode.intro ? t(storeNode.intro as any) : storeNode.intro,
    avatar: template.avatar ?? storeNode.avatar,
    version: template.version || storeNode.version,
    catchError: storeNode.catchError ?? template.catchError,
    // template 中的输入必须都有
    inputs: templateInputs
      .map<FlowNodeInputItemType>((templateInput) => {
        const storeInput =
          adaptedStoreInputs.find((item) => item.key === templateInput.key) || templateInput;

        return {
          ...storeInput,
          ...templateInput,
          debugLabel: t(templateInput.debugLabel ?? (storeInput.debugLabel as any)),
          toolDescription: t(templateInput.toolDescription ?? (storeInput.toolDescription as any)),
          selectedTypeIndex: storeInput.selectedTypeIndex ?? templateInput.selectedTypeIndex,
          value: storeInput.value
        };
      })
      .concat(
        // 合并 store 中有，template 中没有的输入
        adaptedStoreInputs
          .filter((item) => !templateInputs.find((input) => input.key === item.key))
          .map((item) => {
            const templateInput = template.inputs.find((input) => input.key === item.key);

            if (!dynamicInput) {
              return {
                ...item,
                deprecated: templateInput?.deprecated
              };
            }

            return {
              ...item,
              ...getInputComponentProps(dynamicInput),
              deprecated: templateInput?.deprecated
            };
          })
      ),
    outputs: templateOutputs
      .map<FlowNodeOutputItemType>((templateOutput) => {
        const storeOutput =
          storeNode.outputs.find((item) => item.key === templateOutput.key) || templateOutput;

        return {
          ...storeOutput,
          ...templateOutput,
          description: t(templateOutput.description ?? (storeOutput.description as any)),
          id: storeOutput.id ?? templateOutput.id,
          value: storeOutput.value ?? templateOutput.value
        };
      })
      .concat(
        storeNode.outputs
          .filter((item) => !templateOutputs.find((output) => output.key === item.key))
          .map((item) => {
            const templateOutput = template.outputs.find((output) => output.key === item.key);
            return {
              ...item,
              deprecated: templateOutput?.deprecated
            };
          })
      )
  };

  // Format output invalid
  const llmList = useSystemStore.getState().llmModelList;
  const llmModelMap = llmList.reduce(
    (acc, model) => {
      acc[model.model] = model;
      return acc;
    },
    {} as Record<string, LLMModelItemType>
  );
  nodeItem.outputs.forEach((output) => {
    if (output.invalidCondition) {
      output.invalid = output.invalidCondition({ inputs: nodeItem.inputs, llmModelMap });
    }
  });

  return {
    id: storeNode.nodeId,
    type: storeNode.flowNodeType,
    data: nodeItem,
    selected,
    position: storeNode.position || { x: 0, y: 0 },
    zIndex
  };
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

    for (const input of node.inputs) {
      if (input.key === NodeInputKeyEnum.systemInputConfig) {
        input.value = undefined;
      }
    }
    return node;
  });
  return cloneNodes;
};

/* ====== edge ======= */
export const storeEdge2RenderEdge = ({ edge }: { edge: StoreEdgeItemType }) => {
  const sourceHandle = edge.sourceHandle.replace(/-source-(top|bottom|left)$/, '-source-right');
  const targetHandle = edge.targetHandle.replace(/-target-(top|bottom|right)$/, '-target-left');

  return {
    ...edge,
    id: getNanoid(),
    type: EDGE_TYPE,
    sourceHandle,
    targetHandle
  };
};

/* ====== IO ======= */
export const getInputComponentProps = (input: FlowNodeInputItemType) => {
  return {
    referencePlaceholder: input.referencePlaceholder,
    placeholder: input.placeholder,
    maxLength: input.maxLength,
    list: input.list,
    markList: input.markList,
    step: input.step,
    max: input.max,
    min: input.min,
    defaultValue: input.defaultValue,
    customInputConfig: input.customInputConfig
  };
};

/* ====== Reference ======= */
export const getRefData = ({
  variable,
  getNodeById,
  systemConfigNode,
  chatConfig
}: {
  variable?: ReferenceItemValueType;
  getNodeById: WorkflowDataContextType['getNodeById'];
  systemConfigNode?: StoreNodeItemType;
  chatConfig: AppChatConfigType;
}) => {
  if (!variable)
    return {
      valueType: WorkflowIOValueTypeEnum.any,
      required: false
    };

  const node = getNodeById(variable[0]);
  const systemVariables = getWorkflowGlobalVariables({ systemConfigNode, chatConfig });

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
      validTypeMap[valueType]?.includes(output.valueType)
  );
};

export type WorkflowReferenceSourceNode = {
  nodeId: string;
  outputs: FlowNodeOutputItemType[];
  catchError?: boolean;
};

/**
 * 过滤引用选择器中真正可选的输出。
 * ReferenceSelector 和节点 debug 的引用有效性判断必须共用这套规则，避免已删除、类型不匹配、
 * addOutputParam、invalid output 或未开启 catchError 的错误输出在不同入口表现不一致。
 */
export const filterSelectableWorkflowNodeOutputs = ({
  outputs,
  valueType,
  catchError
}: {
  outputs: FlowNodeOutputItemType[];
  valueType?: WorkflowIOValueTypeEnum;
  catchError?: boolean;
}) => {
  return filterWorkflowNodeOutputsByType(outputs, valueType ?? WorkflowIOValueTypeEnum.any).filter(
    (output) => {
      if (output.type === FlowNodeOutputTypeEnum.error) {
        return catchError === true;
      }

      return output.id !== NodeOutputKeyEnum.addOutputParam && output.invalid !== true;
    }
  );
};

const referenceItemIsSelectable = ({
  value,
  sourceNodes,
  valueType
}: {
  value: ReferenceItemValueType;
  sourceNodes: WorkflowReferenceSourceNode[];
  valueType?: WorkflowIOValueTypeEnum;
}) => {
  const [sourceNodeId, outputId] = value;
  if (!sourceNodeId || !outputId) return false;

  const sourceNode = sourceNodes.find((node) => node.nodeId === sourceNodeId);
  if (!sourceNode) return false;

  return filterSelectableWorkflowNodeOutputs({
    outputs: sourceNode.outputs,
    valueType,
    catchError: sourceNode.catchError
  }).some((output) => output.id === outputId);
};

/**
 * 判断引用值是否仍能被 ReferenceSelector 选中。
 * 单选引用要求当前二元组命中；多选引用只要存在一个仍可选的引用项，选择器就会展示有效值。
 */
export const workflowReferenceValueIsSelectable = ({
  value,
  sourceNodes,
  valueType
}: {
  value?: ReferenceValueType;
  sourceNodes: WorkflowReferenceSourceNode[];
  valueType?: WorkflowIOValueTypeEnum;
}) => {
  if (!Array.isArray(value)) return false;

  if (typeof value[0] === 'string') {
    return referenceItemIsSelectable({
      value: value as ReferenceItemValueType,
      sourceNodes,
      valueType
    });
  }

  return value.some((item) => {
    if (!Array.isArray(item)) return false;

    return referenceItemIsSelectable({
      value: item as ReferenceItemValueType,
      sourceNodes,
      valueType
    });
  });
};

/**
 * 获取当前节点可引用的所有上游节点。
 * 结果按工作流入边距离由近到远排列；嵌套节点先取自身入边，再取父容器入边，
 * 最后追加全局变量，保证引用选择器优先展示最近的可用输出。
 */
export const getNodeAllSource = ({
  nodeId,
  systemConfigNode,
  getNodeById,
  edges,
  chatConfig,
  t,
  includeChildren,
  childrenNodeIdListMap
}: {
  nodeId: string;
  systemConfigNode?: StoreNodeItemType;
  getNodeById: (nodeId: string | null | undefined) => FlowNodeItemType | undefined;
  edges: Edge[];
  chatConfig: AppChatConfigType;
  t: TFunction;
  includeChildren?: boolean;
  childrenNodeIdListMap?: Record<string, string[]>;
}): FlowNodeItemType[] => {
  // get current node
  const node = getNodeById(nodeId);
  if (!node) {
    return [];
  }

  const parentId = node.parentNodeId;
  const sourceNodes = new Map<string, FlowNodeItemType>();
  const searchedTargetNodeIds = new Set<string>();

  // 按入边层级遍历，避免深度优先递归把更远的上游节点排到直接来源前面。
  const collectSourceNodesByEdgeDistance = (targetNodeIds: string[]) => {
    const queue = targetNodeIds.filter(Boolean);

    while (queue.length > 0) {
      const targetNodeId = queue.shift();
      if (!targetNodeId || searchedTargetNodeIds.has(targetNodeId)) continue;
      searchedTargetNodeIds.add(targetNodeId);

      const targetEdges = edges.filter((item) => item.target === targetNodeId);
      targetEdges.forEach((edge) => {
        const sourceNode = getNodeById(edge.source);
        if (!sourceNode) return;

        if (!sourceNodes.has(sourceNode.nodeId)) {
          sourceNodes.set(sourceNode.nodeId, sourceNode);
        }

        queue.push(sourceNode.nodeId);
      });
    }
  };

  collectSourceNodesByEdgeDistance([nodeId]);

  if (parentId) {
    collectSourceNodesByEdgeDistance([parentId]);
  }

  // 对于嵌套在容器（Loop/ParallelRun）内的节点，容器的 reference 类型输入
  // 是通过引用选择器设置的（存在 input.value = [nodeId, outputId]），不产生 ReactFlow edge。
  // 因此需要额外扫描父容器的 reference 输入，将被引用的外部节点补充到可选来源中。
  if (parentId) {
    const parentNode = getNodeById(parentId);
    if (parentNode) {
      parentNode.inputs.forEach((input) => {
        if (!nodeInputIsReference(input)) return;
        const val = input.value as ReferenceItemValueType | undefined;
        if (!Array.isArray(val) || val.length < 2) return;
        const [refNodeId] = val;
        if (!refNodeId || refNodeId === VARIABLE_NODE_ID) return;
        const refNode = getNodeById(refNodeId);
        if (!refNode || sourceNodes.has(refNode.nodeId)) return;
        sourceNodes.set(refNode.nodeId, refNode);
        collectSourceNodesByEdgeDistance([refNode.nodeId]);
      });
    }
  }

  // Edge traversal only reaches upstream; children must be added explicitly.
  if (includeChildren && childrenNodeIdListMap) {
    const childIds = childrenNodeIdListMap[nodeId] ?? [];
    childIds.forEach((childId) => {
      if (sourceNodes.has(childId)) return;
      const childNode = getNodeById(childId);
      if (!childNode) return;
      sourceNodes.set(childId, childNode);
    });
  }

  sourceNodes.set(
    'system_global_variable',
    getGlobalVariableNode({
      systemConfigNode,
      t,
      chatConfig
    })
  );

  return Array.from(sourceNodes.values());
};

/* ====== Variables ======= */
/* get workflowStart output to global variables */
export const getWorkflowGlobalVariables = ({
  systemConfigNode,
  chatConfig
}: {
  systemConfigNode?: StoreNodeItemType;
  chatConfig: AppChatConfigType;
}): EditorVariablePickerType[] => {
  const globalVariables = formatEditorVariablePickerIcon(
    getAppChatConfig({
      chatConfig,
      systemConfigNode,
      isPublicFetch: true
    })?.variables || []
  );

  return [...globalVariables, ...workflowSystemVariables];
};

/* ====== Snapshot ======= */
export const compareSnapshot = (
  snapshot1: {
    nodes?: Node[];
    edges?: Edge<any>[] | undefined;
    chatConfig?: AppChatConfigType;
  },
  snapshot2: {
    nodes?: Node[];
    edges?: Edge<any>[];
    chatConfig?: AppChatConfigType;
  }
) => {
  const clone1 = cloneDeep(snapshot1);
  const clone2 = cloneDeep(snapshot2);

  if (!clone1.nodes || !clone2.nodes) return false;
  if (!clone1.edges || !clone2.edges) return false;

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
        welcomeConfig: clone1.chatConfig?.welcomeConfig || undefined,
        variables: clone1.chatConfig?.variables || [],
        questionGuide: clone1.chatConfig?.questionGuide || false,
        ttsConfig: clone1.chatConfig?.ttsConfig || undefined,
        whisperConfig: clone1.chatConfig?.whisperConfig || undefined,
        scheduledTriggerConfig: clone1.chatConfig?.scheduledTriggerConfig || undefined,
        chatInputGuide: clone1.chatConfig?.chatInputGuide || undefined,
        fileSelectConfig: clone1.chatConfig?.fileSelectConfig || undefined,
        instruction: clone1.chatConfig?.instruction || '',
        autoExecute: clone1.chatConfig?.autoExecute || undefined
      },
      {
        welcomeText: clone2.chatConfig?.welcomeText || '',
        welcomeConfig: clone2.chatConfig?.welcomeConfig || undefined,
        variables: clone2.chatConfig?.variables || [],
        questionGuide: clone2.chatConfig?.questionGuide || false,
        ttsConfig: clone2.chatConfig?.ttsConfig || undefined,
        whisperConfig: clone2.chatConfig?.whisperConfig || undefined,
        scheduledTriggerConfig: clone2.chatConfig?.scheduledTriggerConfig || undefined,
        chatInputGuide: clone2.chatConfig?.chatInputGuide || undefined,
        fileSelectConfig: clone2.chatConfig?.fileSelectConfig || undefined,
        instruction: clone2.chatConfig?.instruction || '',
        autoExecute: clone2.chatConfig?.autoExecute || undefined
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
            // set to arrayAny for nestedInputArray to skip valueType comparison
            // valueType: input.key === NodeInputKeyEnum.nestedInputArray ? 'arrayAny' : input.valueType,
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

/* ====== Adapt ======= */
// 给旧版的代码运行和 HTTP 节点，追加一个错误信息的连线
export const adaptCatchError = (nodes: StoreNodeItemType[], edges: StoreEdgeItemType[]) => {
  nodes.forEach((node) => {
    if (
      (node.flowNodeType === FlowNodeTypeEnum.code ||
        node.flowNodeType === FlowNodeTypeEnum.httpRequest468) &&
      node.catchError === undefined
    ) {
      // Get edge
      const sourceEdges = edges.filter((edge) => edge.source === node.nodeId);
      edges.push(
        ...sourceEdges.map((edge) => {
          return {
            source: edge.source,
            sourceHandle: getHandleId(edge.source, 'source_catch', 'right'),
            target: edge.target,
            targetHandle: edge.targetHandle
          };
        })
      );
      node.catchError = true;
    }

    if (node.catchError === undefined && node.pluginId) {
      if (
        [
          'systemTool-dalle3',
          'systemTool-aliModelStudio/flux',
          'systemTool-aliModelStudio/wanxTxt2ImgV2',
          'systemTool-blackForestLab/kontextEditing',
          'systemTool-blackForestLab/kontextGeneration',
          'systemTool-bocha',
          'systemTool-searchXNG'
        ].includes(node.pluginId)
      ) {
        const sourceEdges = edges.filter((edge) => edge.source === node.nodeId);
        edges.push(
          ...sourceEdges.map((edge) => {
            return {
              source: edge.source,
              sourceHandle: getHandleId(edge.source, 'source_catch', 'right'),
              target: edge.target,
              targetHandle: edge.targetHandle
            };
          })
        );
        node.catchError = true;
      } else {
        node.catchError = false;
      }
    }
  });
};
