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
import { getNanoid } from '@fastgpt/global/common/string/tools';
import { getGlobalVariableNode } from './adapt';
import { VARIABLE_NODE_ID, WorkflowIOValueTypeEnum } from '@fastgpt/global/core/workflow/constants';
import { NodeInputKeyEnum, NodeOutputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { type EditorVariablePickerType } from '@fastgpt/web/components/common/Textarea/PromptEditor/type';
import {
  formatEditorVariablePickerIcon,
  getAppChatConfig,
  getSelectedInputRenderType,
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
import { initNewIfElseList } from '@fastgpt/global/core/workflow/template/system/ifElse/utils';
import { type AppChatConfigType } from '@fastgpt/global/core/app/type';
import { cloneDeep, isEqual } from 'lodash-es';
import { workflowSystemVariables } from '../app/utils';
import type { WorkflowDataContextType } from '@/pageComponents/app/detail/WorkflowComponents/context/workflowInitContext';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import type { LLMModelItemType } from '@fastgpt/global/core/ai/model.schema';
import { normalizeFlowNodeInputType } from '@fastgpt/global/core/app/formEdit/utils';

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

  // 用持久化节点数据覆盖模板默认值。
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

type StoreNode2FlowNodeProps = {
  item: StoreNodeItemType;
  selected?: boolean;
  zIndex?: number;
  parentNodeId?: string;
  isTool?: boolean;
  t: TFunction;
};

/**
 * 将持久化节点恢复为画布节点，并在加载时实体化历史 i18n 文本。
 * 名称或描述命中翻译 key 时使用当前语言文本，后续保存会写回实体文本。
 *
 * 输入数据已在统一迁移器中收敛；这里只负责用当前模板补齐展示元数据，
 * 并保留持久化输入的 value、selectedType 等用户配置。
 */
export const storeNode2FlowNode = ({
  item: storeNode,
  selected = false,
  zIndex,
  parentNodeId,
  isTool = false,
  t
}: StoreNode2FlowNodeProps): Node<FlowNodeItemType> => {
  // init some static data
  const nodeTemplate =
    moduleTemplatesFlat.find((template) => template.flowNodeType === storeNode.flowNodeType) ||
    EmptyNode;

  const storedInputs = storeNode.inputs;
  // 废弃模板输入仅在存量节点已有该字段时，按模板顺序保留。
  const orderedTemplateInputs = nodeTemplate.inputs.filter(
    (input) =>
      (!input.canEdit && input.deprecated !== true) ||
      (input.deprecated === true && storedInputs.some((item) => item.key === input.key))
  );
  const staticTemplateOutputs = nodeTemplate.outputs.filter(
    (output) => output.type !== FlowNodeOutputTypeEnum.dynamic
  );
  const dynamicInputTemplate = nodeTemplate.inputs.find(
    (input) => input.renderTypeList[0] === FlowNodeInputTypeEnum.addInputParam
  );
  // replace item data
  const nodeItem: FlowNodeItemType = {
    parentNodeId,
    ...nodeTemplate,
    ...storeNode,
    name: t(storeNode.name as any),
    intro: storeNode.intro ? t(storeNode.intro as any) : storeNode.intro,
    avatar: nodeTemplate.avatar ?? storeNode.avatar,
    version: nodeTemplate.version || storeNode.version,
    catchError: storeNode.catchError ?? nodeTemplate.catchError,
    // 按模板顺序恢复当前输入及存量废弃输入。
    inputs: orderedTemplateInputs
      .map<FlowNodeInputItemType>((inputTemplate) => {
        const storeInput =
          storedInputs.find((item) => item.key === inputTemplate.key) || inputTemplate;

        return {
          ...storeInput,
          // 迁移层不写入 locale 相关的展示字段；恢复画布时以当前模板为准，避免旧语言文本残留。
          ...inputTemplate,
          debugLabel: t(inputTemplate.debugLabel ?? (storeInput.debugLabel as any)),
          toolDescription: t(inputTemplate.toolDescription ?? (storeInput.toolDescription as any)),
          selectedType: storeInput.selectedType ?? inputTemplate.selectedType,
          value: storeInput.value
        };
      })
      .concat(
        // 追加未按模板顺序恢复的存量输入，例如自定义动态字段。
        storedInputs
          .filter((item) => !orderedTemplateInputs.find((input) => input.key === item.key))
          .map((item) => {
            const inputTemplate = nodeTemplate.inputs.find((input) => input.key === item.key);

            if (!dynamicInputTemplate) {
              return {
                ...item,
                deprecated: inputTemplate?.deprecated
              };
            }

            return {
              ...item,
              ...getInputComponentProps(dynamicInputTemplate),
              deprecated: inputTemplate?.deprecated
            };
          })
      ),
    outputs: staticTemplateOutputs
      .map<FlowNodeOutputItemType>((outputTemplate) => {
        const storeOutput =
          storeNode.outputs.find((item) => item.key === outputTemplate.key) || outputTemplate;

        return {
          ...storeOutput,
          ...outputTemplate,
          description: t(outputTemplate.description ?? (storeOutput.description as any)),
          id: storeOutput.id ?? outputTemplate.id,
          value: storeOutput.value ?? outputTemplate.value
        };
      })
      .concat(
        storeNode.outputs
          .filter((item) => !staticTemplateOutputs.find((output) => output.key === item.key))
          .map((item) => {
            const outputTemplate = nodeTemplate.outputs.find((output) => output.key === item.key);
            return {
              ...item,
              deprecated: outputTemplate?.deprecated
            };
          })
      )
  };

  nodeItem.inputs =
    nodeItem.flowNodeType === FlowNodeTypeEnum.pluginInput
      ? nodeItem.inputs.map((input) => {
          const renderTypeList = input.renderTypeList.filter(
            (type) => type !== FlowNodeInputTypeEnum.agentGenerated
          );
          return {
            ...input,
            renderTypeList,
            selectedType:
              input.selectedType === FlowNodeInputTypeEnum.agentGenerated
                ? renderTypeList[0]
                : input.selectedType
          };
        })
      : nodeItem.inputs.map((input) => normalizeFlowNodeInputType(input, { isTool }));

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
  // 当前导出脱敏范围与历史基线保持一致，仅处理数据集选择和系统密钥输入；工具配置暂不做递归脱敏，避免误删普通 value/defaultValue。
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
  chatConfig
}: {
  variable?: ReferenceItemValueType;
  getNodeById: WorkflowDataContextType['getNodeById'];
  chatConfig: AppChatConfigType;
}) => {
  if (!variable)
    return {
      valueType: WorkflowIOValueTypeEnum.any,
      required: false
    };

  const node = getNodeById(variable[0]);
  const systemVariables = getWorkflowGlobalVariables({ chatConfig });

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
  /** 节点自身可被引用的工具参数，执行前注入 inputs 参与引用解析。 */
  toolInputs?: FlowNodeInputItemType[];
};

/**
 * 代码节点的工具参数（Agent 生成）允许被同节点自定义输入引用。
 * 与引用选择器展示规则保持一致；运行时解析见 getReferenceVariableValue 的 inputs 回退。
 */
export const getNodeSelfReferenceToolInputs = (node: FlowNodeItemType) =>
  node.flowNodeType === FlowNodeTypeEnum.code
    ? node.inputs.filter(
        (input) => input.canEdit === true && input.defaultToAgentGenerated === true
      )
    : [];

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

  const outputIsSelectable = filterSelectableWorkflowNodeOutputs({
    outputs: sourceNode.outputs,
    valueType,
    catchError: sourceNode.catchError
  }).some((output) => output.id === outputId);
  if (outputIsSelectable) return true;

  // 代码节点自身工具参数不是 outputs，运行时注入后按 inputs 回退解析。
  return sourceNode.toolInputs?.some((input) => input.key === outputId) ?? false;
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
  getNodeById,
  edges,
  chatConfig,
  t,
  includeChildren,
  childrenNodeIdListMap
}: {
  nodeId: string;
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
      t,
      chatConfig
    })
  );

  return Array.from(sourceNodes.values());
};

/* ====== Variables ======= */
/* get workflowStart output to global variables */
export const getWorkflowGlobalVariables = ({
  chatConfig
}: {
  chatConfig: AppChatConfigType;
}): EditorVariablePickerType[] => {
  const globalVariables = formatEditorVariablePickerIcon(
    getAppChatConfig({
      chatConfig,
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
            selectedType: getSelectedInputRenderType(input),
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
