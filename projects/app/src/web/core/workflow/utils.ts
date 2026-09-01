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
  getHandleId,
  getSelectedInputRenderType,
  nodeInputIsReference
} from '@fastgpt/global/core/workflow/utils';
import { type TFunction } from 'next-i18next';
import {
  type FlowNodeInputItemType,
  type FlowNodeOutputItemType,
  type ReferenceItemValueType
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
    // 连接柄由当前模板控制，避免存量数据重新开启已禁用的 source。
    showSourceHandle: nodeTemplate.showSourceHandle,
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
              ...(item.defaultToAgentGenerated === true
                ? { canAgentGenerated: item.canAgentGenerated }
                : {}),
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
    customInputConfig: input.customInputConfig,
    ...(input.canAgentGenerated === undefined ? {} : { canAgentGenerated: input.canAgentGenerated })
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
  chatConfig?: AppChatConfigType;
}) => {
  if (!variable)
    return {
      valueType: WorkflowIOValueTypeEnum.any,
      required: false
    };

  const node = getNodeById(variable[0]);
  if (!node && variable[0] === VARIABLE_NODE_ID) {
    const globalVariable = getWorkflowGlobalVariables({
      chatConfig: chatConfig ?? {}
    }).find((item) => item.key === variable[1]);
    return {
      valueType: globalVariable?.valueType ?? WorkflowIOValueTypeEnum.any,
      required: !!globalVariable?.required
    };
  }

  if (!node) {
    return {
      valueType: WorkflowIOValueTypeEnum.any,
      required: false
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
// 来源类型可赋值给目标类型的规则表，引用选择器过滤与工作流检查共用同一份。
const workflowValueTypeCompatMap: Record<WorkflowIOValueTypeEnum, WorkflowIOValueTypeEnum[]> = {
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

/**
 * 判断来源类型能否赋值给目标类型。
 * 目标为 any/arrayAny 或未声明、来源无类型或为 any 时一律兼容，
 * 与 ReferenceSelector 的可选过滤行为保持一致。
 */
export const workflowValueTypeIsCompatible = (
  sourceType: WorkflowIOValueTypeEnum | undefined,
  targetType: WorkflowIOValueTypeEnum | undefined
): boolean =>
  !targetType ||
  targetType === WorkflowIOValueTypeEnum.any ||
  targetType === WorkflowIOValueTypeEnum.arrayAny ||
  !sourceType ||
  sourceType === WorkflowIOValueTypeEnum.any ||
  workflowValueTypeCompatMap[targetType]?.includes(sourceType) === true;

// 根据数据类型，过滤无效的节点输出
export const filterWorkflowNodeOutputsByType = (
  outputs: FlowNodeOutputItemType[],
  valueType: WorkflowIOValueTypeEnum
): FlowNodeOutputItemType[] =>
  outputs.filter((output) => workflowValueTypeIsCompatible(output.valueType, valueType));

export type WorkflowReferenceSourceNode = {
  nodeId: string;
  outputs: FlowNodeOutputItemType[];
  catchError?: boolean;
};

/** 多分支节点仅允许当前配置仍存在的 source handle 参与来源计算和工作流检查。 */
export const isWorkflowEdgeSourceHandleValid = (
  sourceNode: FlowNodeItemType | undefined,
  sourceHandle: string | null | undefined
) => {
  if (!sourceNode) return false;

  const { nodeId, flowNodeType, inputs } = sourceNode;

  if (flowNodeType === FlowNodeTypeEnum.userSelect) {
    if (!sourceHandle) return false;

    const options = inputs?.find((input) => input.key === NodeInputKeyEnum.userSelectOptions)
      ?.value as Array<{ key?: string }> | undefined;

    return (
      Array.isArray(options) &&
      options.some(
        (option) => option.key && sourceHandle === getHandleId(nodeId, 'source', option.key)
      )
    );
  }

  if (flowNodeType === FlowNodeTypeEnum.classifyQuestion) {
    if (!sourceHandle) return false;

    const agents = inputs?.find((input) => input.key === NodeInputKeyEnum.agents)?.value as
      | Array<{ key?: string }>
      | undefined;

    return (
      Array.isArray(agents) &&
      agents.some((agent) => agent.key && sourceHandle === getHandleId(nodeId, 'source', agent.key))
    );
  }

  return true;
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
  const selectableOutputs = outputs.filter((output) => {
    if (output.id === NodeOutputKeyEnum.addOutputParam || output.invalid === true) return false;
    if (output.type === FlowNodeOutputTypeEnum.error) return catchError === true;
    return true;
  });

  return filterWorkflowNodeOutputsByType(
    selectableOutputs,
    valueType ?? WorkflowIOValueTypeEnum.any
  );
};

export const isWorkflowReferenceItem = (value: unknown): value is ReferenceItemValueType =>
  Array.isArray(value) &&
  value.length === 2 &&
  typeof value[0] === 'string' &&
  typeof value[1] === 'string' &&
  value[0].length > 0 &&
  value[1].length > 0;

/** 从 canonical 单选或多选值中按原顺序提取引用项。 */
export const getWorkflowReferenceItems = (value: unknown): ReferenceItemValueType[] => {
  if (isWorkflowReferenceItem(value)) return [value];
  if (!Array.isArray(value)) return [];

  return value.filter(isWorkflowReferenceItem);
};

export const isEmptyReferenceValue = (value: unknown) =>
  value === undefined ||
  value === null ||
  value === '' ||
  (Array.isArray(value) &&
    (value.length === 0 ||
      (value.length === 2 &&
        ((value[0] === '' && value[1] === '') ||
          (value[0] === undefined && value[1] === undefined)))));

/** 空引用不参与状态检查；其他非空值统一视为已配置并报告 invalid_reference。 */
export const isConfiguredReferenceValue = (value: unknown) => !isEmptyReferenceValue(value);

/**
 * 获取当前节点可引用的普通来源 ID。
 * 按当前节点到根容器的入边和 reference 输入遍历，visited 防止坏 parent 数据循环。
 */
export const getNodeAllSourceIds = ({
  nodeId,
  getNodeById,
  edges,
  includeChildren,
  childrenNodeIdListMap
}: {
  nodeId: string;
  getNodeById: (nodeId: string | null | undefined) => FlowNodeItemType | undefined;
  edges: Edge[];
  includeChildren?: boolean;
  childrenNodeIdListMap?: Record<string, string[]>;
}): string[] => {
  const node = getNodeById(nodeId);
  if (!node) return [];

  const sourceIds = new Set<string>();
  const searchedTargetNodeIds = new Set<string>();
  const collectIncoming = (targetNodeIds: string[]) => {
    const queue = targetNodeIds.filter(Boolean);
    while (queue.length > 0) {
      const targetNodeId = queue.shift();
      if (!targetNodeId || searchedTargetNodeIds.has(targetNodeId)) continue;
      searchedTargetNodeIds.add(targetNodeId);
      edges.forEach((edge) => {
        if (edge.target !== targetNodeId) return;
        if (!isWorkflowEdgeSourceHandleValid(getNodeById(edge.source), edge.sourceHandle)) return;
        sourceIds.add(edge.source);
        queue.push(edge.source);
      });
    }
  };

  const containerNodes = [node];
  const visitedParentIds = new Set<string>([node.nodeId]);
  let parentNode = node;
  while (parentNode.parentNodeId && !visitedParentIds.has(parentNode.parentNodeId)) {
    const nextParent = getNodeById(parentNode.parentNodeId);
    if (!nextParent) break;
    containerNodes.push(nextParent);
    visitedParentIds.add(nextParent.nodeId);
    parentNode = nextParent;
  }
  collectIncoming(containerNodes.map((item) => item.nodeId));

  containerNodes.slice(1).forEach((container) => {
    container.inputs.forEach((input) => {
      if (!nodeInputIsReference(input)) return;
      getWorkflowReferenceItems(input.value).forEach(([refNodeId]) => {
        if (refNodeId === VARIABLE_NODE_ID || !getNodeById(refNodeId)) return;
        sourceIds.add(refNodeId);
        collectIncoming([refNodeId]);
      });
    });
  });

  if (includeChildren && childrenNodeIdListMap) {
    (childrenNodeIdListMap[nodeId] ?? []).forEach((childId) => {
      if (getNodeById(childId)) sourceIds.add(childId);
    });
  }

  return [...sourceIds];
};

/** 获取当前节点可引用的来源节点，并追加 global variable 节点供 selector 展示。 */
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
  if (!getNodeById(nodeId)) return [];

  const sourceNodes = getNodeAllSourceIds({
    nodeId,
    getNodeById,
    edges,
    includeChildren,
    childrenNodeIdListMap
  })
    .map((sourceNodeId) => getNodeById(sourceNodeId))
    .filter((sourceNode): sourceNode is FlowNodeItemType => !!sourceNode);

  return [
    ...sourceNodes,
    getGlobalVariableNode({
      t,
      chatConfig
    })
  ];
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
