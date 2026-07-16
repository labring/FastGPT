import type {
  StoreNodeItemType,
  FlowNodeItemType,
  WorkflowCheckIssue,
  WorkflowCheckNodeIssueMap
} from '@fastgpt/global/core/workflow/type/node';
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
  isValidReferenceValue,
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
import { LoopRunModeEnum } from '@fastgpt/global/core/workflow/template/system/loopRun/loopRun';
import { VariableConditionEnum } from '@fastgpt/global/core/workflow/template/system/ifElse/constant';
import { type TUpdateListItem } from '@fastgpt/global/core/workflow/template/system/variableUpdate/type';
import { type AppChatConfigType } from '@fastgpt/global/core/app/type';
import { cloneDeep, isEqual } from 'lodash';
import { workflowSystemVariables } from '../app/utils';
import type { WorkflowDataContextType } from '@/pageComponents/app/detail/WorkflowComponents/context/workflowInitContext';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import type { LLMModelItemType } from '@fastgpt/global/core/ai/model.schema';
import { PluginStatusEnum } from '@fastgpt/global/core/plugin/type';
import { AppErrEnum } from '@fastgpt/global/common/error/code/app';
import { PluginErrEnum } from '@fastgpt/global/common/error/code/plugin';
import { ERROR_RESPONSE } from '@fastgpt/global/common/error/errorCode';
import { getToolConfigStatus } from '@fastgpt/global/core/app/formEdit/utils';

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

/* ====== Connection ======= */
type WorkflowCheckContext = {
  nodeMap: Map<string, Node<FlowNodeItemType, string | undefined>>;
  nodeOutputMap: Map<string, Set<string>>;
  incomingEdgesMap: Map<string, Edge<any>[]>;
  outgoingEdgesMap: Map<string, Edge<any>[]>;
  reachableNodeSet: Set<string>;
};

const workflowCheckSkipConnectionTypes = new Set<FlowNodeTypeEnum>([
  FlowNodeTypeEnum.systemConfig,
  FlowNodeTypeEnum.pluginConfig,
  FlowNodeTypeEnum.comment,
  FlowNodeTypeEnum.globalVariable,
  FlowNodeTypeEnum.emptyNode
]);

/**
 * 多分支节点的 sourceHandle 必须与当前 options/agents 中的 key 一致；
 * 删除分支后残留的悬空 edge 不应计入有效连线。
 */
const isWorkflowEdgeSourceHandleValid = (
  sourceNode: Node<FlowNodeItemType, string | undefined> | undefined,
  sourceHandle: string | null | undefined
) => {
  if (!sourceNode) return false;

  const { nodeId, flowNodeType, inputs } = sourceNode.data;

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

const workflowCheckStartTypes = new Set<FlowNodeTypeEnum>([
  FlowNodeTypeEnum.workflowStart,
  FlowNodeTypeEnum.pluginInput,
  FlowNodeTypeEnum.nestedStart,
  FlowNodeTypeEnum.loopRunStart
]);

const workflowCheckSkipNodeRuleTypes = new Set<FlowNodeTypeEnum>([
  FlowNodeTypeEnum.systemConfig,
  FlowNodeTypeEnum.pluginConfig,
  FlowNodeTypeEnum.pluginInput,
  FlowNodeTypeEnum.workflowStart,
  FlowNodeTypeEnum.comment
]);

const isEmptyWorkflowInputValue = (value: unknown) =>
  value === undefined ||
  value === null ||
  value === '' ||
  (Array.isArray(value) && value.length === 0);

/** hidden / 非必填 any 不参与通用必填校验，避免系统 hidden 字段误报或与节点特判重复。 */
const shouldSkipGenericRequiredInputCheck = (input: FlowNodeInputItemType) => {
  const renderType = input.renderTypeList?.[input.selectedTypeIndex ?? 0];
  if (renderType === FlowNodeInputTypeEnum.hidden) return true;
  if (!input.valueType) return true;
  if (input.valueType === WorkflowIOValueTypeEnum.boolean) return true;
  if (input.valueType === WorkflowIOValueTypeEnum.any) {
    return !input.required;
  }
  return false;
};

/** 优先取 label，空则取 debugLabel，并走 i18n 翻译，避免展示 quoteQA 等内部 key。 */
const getInputLabel = (input: FlowNodeInputItemType, t?: TFunction) => {
  const rawLabel =
    (typeof input.label === 'string' && input.label ? input.label : undefined) ||
    (typeof input.debugLabel === 'string' && input.debugLabel ? input.debugLabel : undefined) ||
    input.key;

  if (t && rawLabel) {
    return t(rawLabel as any);
  }

  return rawLabel;
};

/** 设计稿固定提示文案 code，与 issue.code 一一对应或作为文案模板。 */
type WorkflowCheckMessageCode =
  | 'required_input_empty'
  | 'no_upstream'
  | 'invalid_reference'
  | 'if_else_incomplete'
  | 'user_select_empty'
  | 'user_select_value_empty'
  | 'form_input_empty'
  | 'classify_question_empty'
  | 'classify_question_value_empty'
  | 'code_input_incomplete'
  | 'http_url_empty'
  | 'context_extract_empty'
  | 'tool_call_empty'
  | 'tool_inactive'
  | 'tool_missing'
  | 'tool_load_failed'
  | 'tool_no_permission'
  | 'tool_offline';

/** issue.code -> 设计稿固定文案 code。表外 code 映射到最接近的已有文案。 */
const WORKFLOW_CHECK_ISSUE_MESSAGE_CODE_MAP: Record<string, WorkflowCheckMessageCode> = {
  required_input_empty: 'required_input_empty',
  no_upstream: 'no_upstream',
  isolated_node: 'no_upstream',
  unreachable_from_start: 'no_upstream',
  invalid_reference: 'invalid_reference',
  if_else_incomplete: 'if_else_incomplete',
  user_select_empty: 'user_select_empty',
  user_select_value_empty: 'user_select_value_empty',
  form_input_empty: 'form_input_empty',
  classify_question_empty: 'classify_question_empty',
  classify_question_value_empty: 'classify_question_value_empty',
  code_input_incomplete: 'code_input_incomplete',
  http_url_empty: 'http_url_empty',
  context_extract_empty: 'context_extract_empty',
  tool_call_empty: 'tool_call_empty',
  tool_inactive: 'tool_inactive',
  tool_waiting_config: 'tool_inactive',
  tool_missing: 'tool_missing',
  tool_load_failed: 'tool_load_failed',
  tool_no_permission: 'tool_no_permission',
  tool_offline: 'tool_offline',
  loop_run_missing_break: 'if_else_incomplete',
  variable_update_incomplete: 'code_input_incomplete'
};

/** 待处理：引用无效、工具不可访问或加载失败。其余均为待完善。 */
export const WORKFLOW_CHECK_PENDING_HANDLE_CODES = new Set<string>([
  'invalid_reference',
  'tool_missing',
  'tool_load_failed',
  'tool_no_permission',
  'tool_offline'
]);

export type WorkflowCheckUIStatus = 'pending_improve' | 'pending_handle';

/** 按 issue code 映射 UI 状态前缀，不直接使用 level 字段。 */
export const getWorkflowCheckIssueUIStatus = (code: string): WorkflowCheckUIStatus =>
  WORKFLOW_CHECK_PENDING_HANDLE_CODES.has(code) ? 'pending_handle' : 'pending_improve';

const workflowCheckMessageFallback: Record<
  WorkflowCheckMessageCode,
  (params?: { inputName?: string }) => string
> = {
  required_input_empty: ({ inputName } = {}) => `需填写必填项 ${inputName ?? ''}`.trim(),
  no_upstream: () => '未与其他节点连线',
  invalid_reference: ({ inputName } = {}) => `${inputName ?? ''} 引用了无效变量，需删除`.trim(),
  if_else_incomplete: () => '存在未完成的条件配置，请完善',
  user_select_empty: () => '需配置至少一个选项',
  user_select_value_empty: () => '选项不可为空',
  form_input_empty: () => '需配置至少一个字段',
  classify_question_empty: () => '需配置至少一个分类',
  classify_question_value_empty: () => '分类值不可为空',
  code_input_incomplete: () => '存在未完成的输入变量配置，请完善',
  http_url_empty: () => '需配置请求地址',
  context_extract_empty: () => '需配置至少一个目标字段',
  tool_call_empty: () => '需配置工具或开启虚拟机',
  tool_inactive: () => '该工具尚未激活，请激活使用',
  tool_missing: () => '该工具不存在，请删除',
  tool_load_failed: () => '工具加载失败，请稍后重试',
  tool_no_permission: () => '当前账号无权限访问该资源',
  tool_offline: () => '该工具已停用，请删除'
};

const PLUGIN_DATA_PERMISSION_ERROR_CODES = new Set<string>([
  AppErrEnum.unAuthApp,
  PluginErrEnum.unAuth
]);

const PLUGIN_DATA_MISSING_ERROR_CODES = new Set<string>([
  AppErrEnum.unExist,
  PluginErrEnum.unExist
]);

/** pluginData.error 可能是 statusText 或 getErrText 翻译后的 message，需两种都识别。 */
const resolvePluginDataErrorIssueCode = (error: string): WorkflowCheckMessageCode => {
  if (
    PLUGIN_DATA_PERMISSION_ERROR_CODES.has(error) ||
    error === ERROR_RESPONSE[AppErrEnum.unAuthApp]?.message ||
    error === ERROR_RESPONSE[PluginErrEnum.unAuth]?.message
  ) {
    return 'tool_no_permission';
  }

  if (
    PLUGIN_DATA_MISSING_ERROR_CODES.has(error) ||
    error === ERROR_RESPONSE[AppErrEnum.unExist]?.message ||
    error === ERROR_RESPONSE[PluginErrEnum.unExist]?.message
  ) {
    return 'tool_missing';
  }

  return 'tool_load_failed';
};

const resolveWorkflowCheckMessageCode = (issueCode: string): WorkflowCheckMessageCode | undefined =>
  WORKFLOW_CHECK_ISSUE_MESSAGE_CODE_MAP[issueCode];

/**
 * 使用显式分支保留所有翻译 key 的静态字面量引用，避免 i18n 清理脚本误删动态 key。
 */
const translateWorkflowCheckIssueMessage = (
  messageCode: WorkflowCheckMessageCode,
  t: TFunction,
  params?: { inputName?: string }
) => {
  switch (messageCode) {
    case 'required_input_empty':
      return t('common:core.workflow.check.required_input_empty', params);
    case 'no_upstream':
      return t('common:core.workflow.check.no_upstream', params);
    case 'invalid_reference':
      return t('common:core.workflow.check.invalid_reference', params);
    case 'if_else_incomplete':
      return t('common:core.workflow.check.if_else_incomplete', params);
    case 'user_select_empty':
      return t('common:core.workflow.check.user_select_empty', params);
    case 'user_select_value_empty':
      return t('common:core.workflow.check.user_select_value_empty', params);
    case 'form_input_empty':
      return t('common:core.workflow.check.form_input_empty', params);
    case 'classify_question_empty':
      return t('common:core.workflow.check.classify_question_empty', params);
    case 'classify_question_value_empty':
      return t('common:core.workflow.check.classify_question_value_empty', params);
    case 'code_input_incomplete':
      return t('common:core.workflow.check.code_input_incomplete', params);
    case 'http_url_empty':
      return t('common:core.workflow.check.http_url_empty', params);
    case 'context_extract_empty':
      return t('common:core.workflow.check.context_extract_empty', params);
    case 'tool_call_empty':
      return t('common:core.workflow.check.tool_call_empty', params);
    case 'tool_inactive':
      return t('common:core.workflow.check.tool_inactive', params);
    case 'tool_missing':
      return t('common:core.workflow.check.tool_missing', params);
    case 'tool_load_failed':
      return t('common:core.workflow.check.tool_load_failed', params);
    case 'tool_no_permission':
      return t('common:core.workflow.check.tool_no_permission', params);
    case 'tool_offline':
      return t('common:core.workflow.check.tool_offline', params);
  }
};

/** 根据 issue.code 返回设计稿固定提示文案，不自由拼接或生成表外文案。 */
export const getWorkflowCheckIssueMessage = (
  issueCode: string,
  t?: TFunction,
  params?: { inputName?: string }
) => {
  const messageCode = resolveWorkflowCheckMessageCode(issueCode);
  if (!messageCode) return '';

  if (t) {
    return translateWorkflowCheckIssueMessage(messageCode, t, params);
  }
  return workflowCheckMessageFallback[messageCode](params);
};

const createWorkflowCheckContext = ({
  nodes,
  edges
}: {
  nodes: Node<FlowNodeItemType, string | undefined>[];
  edges: Edge<any>[];
}): WorkflowCheckContext => {
  const nodeMap = new Map<string, Node<FlowNodeItemType, string | undefined>>();
  const nodeOutputMap = new Map<string, Set<string>>();
  const incomingEdgesMap = new Map<string, Edge<any>[]>();
  const outgoingEdgesMap = new Map<string, Edge<any>[]>();

  nodes.forEach((node) => {
    nodeMap.set(node.data.nodeId, node);
    nodeOutputMap.set(node.data.nodeId, new Set(node.data.outputs.map((output) => output.id)));
    incomingEdgesMap.set(node.data.nodeId, []);
    outgoingEdgesMap.set(node.data.nodeId, []);
  });

  edges.forEach((edge) => {
    const sourceNode = nodeMap.get(edge.source);
    if (!isWorkflowEdgeSourceHandleValid(sourceNode, edge.sourceHandle)) {
      return;
    }

    outgoingEdgesMap.get(edge.source)?.push(edge);
    incomingEdgesMap.get(edge.target)?.push(edge);
  });

  const reachableNodeSet = new Set<string>();
  const visit = (nodeId: string) => {
    if (reachableNodeSet.has(nodeId)) return;
    reachableNodeSet.add(nodeId);

    outgoingEdgesMap.get(nodeId)?.forEach((edge) => visit(edge.target));
  };

  nodes.forEach((node) => {
    if (
      node.data.flowNodeType === FlowNodeTypeEnum.workflowStart ||
      node.data.flowNodeType === FlowNodeTypeEnum.pluginInput ||
      node.data.flowNodeType === FlowNodeTypeEnum.nestedStart ||
      node.data.flowNodeType === FlowNodeTypeEnum.loopRunStart
    ) {
      visit(node.data.nodeId);
    }
  });

  return {
    nodeMap,
    nodeOutputMap,
    incomingEdgesMap,
    outgoingEdgesMap,
    reachableNodeSet
  };
};

const referenceValueIsLive = (
  value: ReferenceItemValueType | undefined,
  context: WorkflowCheckContext
) => {
  if (!isValidReferenceValueFormat(value)) return false;
  const [refNodeId, refOutputId] = value;
  if (!refNodeId || !refOutputId) return false;
  if (refNodeId === VARIABLE_NODE_ID) return true;

  return context.nodeOutputMap.get(refNodeId)?.has(refOutputId) === true;
};

/** 引用输入是否尚未选择（空占位 / 未选变量），区别于曾经选中但已失效的引用。 */
const isUnsetReferenceValue = (value: unknown) => {
  if (value === undefined || value === null || value === '') return true;
  if (!Array.isArray(value)) return true;
  if (value.length === 0) return true;

  // 单引用 [nodeId, outputId]；占位符 ['', ''] 或格式不完整均视为未选择
  if (value.length === 2 && !Array.isArray(value[0])) {
    const [refNodeId, refOutputId] = value;
    if (typeof refNodeId !== 'string') return true;
    return !refNodeId || !refOutputId;
  }

  return false;
};

/** 引用曾经有效配置过，但目标节点或输出已不存在（如上游节点被删除）。 */
const isStaleReferenceValue = (value: unknown, context: WorkflowCheckContext) => {
  if (!isValidReferenceValueFormat(value)) return false;
  const [refNodeId, refOutputId] = value;
  if (!refNodeId || !refOutputId) return false;
  return !referenceValueIsLive(value as ReferenceItemValueType, context);
};

const isEmptyReferenceInputValue = (value: unknown, isArrayType: boolean) => {
  if (isArrayType) {
    return !Array.isArray(value) || value.length === 0;
  }
  return isUnsetReferenceValue(value);
};

const isVariableUpdateTargetEmpty = (
  variable: unknown,
  nodeIds: string[],
  context: WorkflowCheckContext
) =>
  !isValidReferenceValue(variable, nodeIds) ||
  !referenceValueIsLive(variable as ReferenceItemValueType, context);

const isVariableUpdateValueEmpty = (item: TUpdateListItem, context: WorkflowCheckContext) => {
  if (item.renderType === FlowNodeInputTypeEnum.reference) {
    if (isValidReferenceValueFormat(item.value)) {
      return !referenceValueIsLive(item.value as ReferenceItemValueType, context);
    }
    return (
      !Array.isArray(item.value) ||
      item.value.length === 0 ||
      (item.value as ReferenceItemValueType[]).some((v) => !referenceValueIsLive(v, context))
    );
  }

  if (item.arrayMode === 'clear') return false;
  if (item.booleanMode) return false;
  const inputVal = item.value?.[1];
  return inputVal === undefined || inputVal === null || inputVal === '';
};

/** 根据流程开始节点输出，计算目标 input 的默认引用值；无匹配规则时返回 undefined。 */
const getWorkflowStartAutoFillValue = ({
  inputKey,
  workflowStartNodeId,
  hasUserFilesOutput
}: {
  inputKey: string;
  workflowStartNodeId: string;
  hasUserFilesOutput: boolean;
}): ReferenceValueType | undefined => {
  if (inputKey === NodeInputKeyEnum.userChatInput) {
    return [workflowStartNodeId, NodeOutputKeyEnum.userChatInput];
  }

  if (inputKey === NodeInputKeyEnum.datasetSearchInput) {
    const refs: ReferenceItemValueType[] = [[workflowStartNodeId, NodeOutputKeyEnum.userChatInput]];
    if (hasUserFilesOutput) {
      refs.push([workflowStartNodeId, NodeOutputKeyEnum.userFiles]);
    }
    return refs;
  }

  if (inputKey === NodeInputKeyEnum.fileUrlList) {
    if (!hasUserFilesOutput) return undefined;
    return [[workflowStartNodeId, NodeOutputKeyEnum.userFiles]];
  }

  return undefined;
};

/**
 * 为空白引用输入自动填充「流程开始」上游输出引用。
 * 仅处理引用类输入且 value 尚未配置的场景，不覆盖已有合法手动引用。
 */
export const applyWorkflowStartInputAutoFill = ({
  inputs,
  workflowStartNodeId,
  workflowStartOutputs
}: {
  inputs: FlowNodeInputItemType[];
  workflowStartNodeId: string;
  workflowStartOutputs: FlowNodeOutputItemType[];
}): FlowNodeInputItemType[] => {
  const hasUserFilesOutput = workflowStartOutputs.some(
    (output) => output.id === NodeOutputKeyEnum.userFiles
  );

  return inputs.map((input) => {
    if (!nodeInputIsReference(input) || !isUnsetReferenceValue(input.value)) {
      return input;
    }

    const autoFillValue = getWorkflowStartAutoFillValue({
      inputKey: input.key,
      workflowStartNodeId,
      hasUserFilesOutput
    });

    if (autoFillValue === undefined) {
      return input;
    }

    return {
      ...input,
      value: autoFillValue
    };
  });
};

type WorkflowStartAutoFillPatch = {
  nodeId: string;
  key: string;
  value: FlowNodeInputItemType;
};

const collectWorkflowReachableNodeIds = ({
  startNodeId,
  edges
}: {
  startNodeId: string;
  edges: Array<Pick<Edge, 'source' | 'target'>>;
}) => {
  const reachableNodeIds = new Set<string>();
  const queue = [startNodeId];

  while (queue.length > 0) {
    const sourceNodeId = queue.shift();
    if (!sourceNodeId) continue;

    edges.forEach((edge) => {
      if (edge.source !== sourceNodeId || reachableNodeIds.has(edge.target)) return;
      reachableNodeIds.add(edge.target);
      queue.push(edge.target);
    });
  }

  return reachableNodeIds;
};

/**
 * 收集从流程开始节点可达的下游节点自动填充补丁。
 * 文件上传等系统输入可能在连线之后才开启，因此这里按当前 edge 图整体扫描，
 * 只补空白引用输入，避免覆盖用户已经手动选择的变量。
 */
export const collectWorkflowStartInputAutoFillPatches = ({
  nodes,
  edges,
  workflowStartNode
}: {
  nodes: Node<FlowNodeItemType, string | undefined>[];
  edges: Array<Pick<Edge, 'source' | 'target'>>;
  workflowStartNode: FlowNodeItemType;
}): WorkflowStartAutoFillPatch[] => {
  const nodeMap = new Map(nodes.map((node) => [node.data.nodeId, node.data]));
  const reachableNodeIds = collectWorkflowReachableNodeIds({
    startNodeId: workflowStartNode.nodeId,
    edges
  });

  const patches: WorkflowStartAutoFillPatch[] = [];

  reachableNodeIds.forEach((nodeId) => {
    const targetNode = nodeMap.get(nodeId);
    if (!targetNode) return;

    const nextInputs = applyWorkflowStartInputAutoFill({
      inputs: targetNode.inputs,
      workflowStartNodeId: workflowStartNode.nodeId,
      workflowStartOutputs: workflowStartNode.outputs
    });

    nextInputs.forEach((input) => {
      const prevInput = targetNode.inputs.find((item) => item.key === input.key);
      if (prevInput && !isEqual(prevInput.value, input.value)) {
        patches.push({
          nodeId: targetNode.nodeId,
          key: input.key,
          value: input
        });
      }
    });
  });

  return patches;
};

/** 判断 input.value 是否为流程开始自动填充产生的引用，用于断线回滚时避免误清手动配置。 */
const isWorkflowStartAutoFilledValue = ({
  inputKey,
  value,
  workflowStartNodeId,
  hasUserFilesOutput
}: {
  inputKey: string;
  value: unknown;
  workflowStartNodeId: string;
  hasUserFilesOutput: boolean;
}) => {
  const autoFillValue = getWorkflowStartAutoFillValue({
    inputKey,
    workflowStartNodeId,
    hasUserFilesOutput
  });
  if (autoFillValue === undefined) return false;
  return isEqual(value, autoFillValue);
};

/**
 * 断开与流程开始的连线后，回滚此前自动写入的引用值。
 * 仅清除与自动填充结果完全一致的 value，保留手动配置或其他上游引用。
 */
export const revertWorkflowStartInputAutoFill = ({
  inputs,
  workflowStartNodeId,
  workflowStartOutputs
}: {
  inputs: FlowNodeInputItemType[];
  workflowStartNodeId: string;
  workflowStartOutputs: FlowNodeOutputItemType[];
}): FlowNodeInputItemType[] => {
  const hasUserFilesOutput = workflowStartOutputs.some(
    (output) => output.id === NodeOutputKeyEnum.userFiles
  );

  return inputs.map((input) => {
    if (
      !isWorkflowStartAutoFilledValue({
        inputKey: input.key,
        value: input.value,
        workflowStartNodeId,
        hasUserFilesOutput
      })
    ) {
      return input;
    }

    return {
      ...input,
      value: undefined
    };
  });
};

/**
 * 根据被删除的连线，收集需要回滚的流程开始自动填充补丁。
 * 任意位置断线都可能让部分下游节点失去流程开始可达性，因此这里比较删除前后
 * 每个流程开始节点的可达集合，只清理「删除前可达、删除后不可达」节点上的自动填充值。
 */
export const collectWorkflowStartAutoFillRevertPatches = ({
  removedEdges,
  remainingEdges,
  getNodeById
}: {
  removedEdges: Array<Pick<Edge, 'id' | 'source' | 'target'>>;
  remainingEdges: Array<Pick<Edge, 'id' | 'source' | 'target'>>;
  getNodeById: (nodeId: string) => FlowNodeItemType | undefined;
}): Array<{ nodeId: string; key: string; value: FlowNodeInputItemType }> => {
  const patches: Array<{ nodeId: string; key: string; value: FlowNodeInputItemType }> = [];
  const processedNodes = new Set<string>();
  const previousEdges = remainingEdges.concat(removedEdges);
  const workflowStartNodes = Array.from(
    new Map(
      previousEdges
        .map((edge) => getNodeById(edge.source))
        .filter((node): node is FlowNodeItemType => {
          return node?.flowNodeType === FlowNodeTypeEnum.workflowStart;
        })
        .map((node) => [node.nodeId, node])
    ).values()
  );

  workflowStartNodes.forEach((sourceNode) => {
    const previousReachableNodeIds = collectWorkflowReachableNodeIds({
      startNodeId: sourceNode.nodeId,
      edges: previousEdges
    });
    const nextReachableNodeIds = collectWorkflowReachableNodeIds({
      startNodeId: sourceNode.nodeId,
      edges: remainingEdges
    });

    previousReachableNodeIds.forEach((nodeId) => {
      if (nextReachableNodeIds.has(nodeId) || processedNodes.has(nodeId)) return;

      const targetNode = getNodeById(nodeId);
      if (!targetNode) return;

      processedNodes.add(nodeId);
      const nextInputs = revertWorkflowStartInputAutoFill({
        inputs: targetNode.inputs,
        workflowStartNodeId: sourceNode.nodeId,
        workflowStartOutputs: sourceNode.outputs
      });

      nextInputs.forEach((input) => {
        const prevInput = targetNode.inputs.find((item) => item.key === input.key);
        if (prevInput && !isEqual(prevInput.value, input.value)) {
          patches.push({
            nodeId: targetNode.nodeId,
            key: input.key,
            value: input
          });
        }
      });
    });
  });

  return patches;
};

/**
 * 结构化校验工作流节点和连线。
 * 函数只读取入参并返回每个节点的错误列表，调用方负责写入 React state、toast 或定位画布。
 */
export const checkWorkflowNodeIssues = ({
  nodes,
  edges,
  nodeId,
  t
}: {
  nodes: Node<FlowNodeItemType, string | undefined>[];
  edges: Edge<any>[];
  nodeId?: string;
  t?: TFunction;
}): WorkflowCheckNodeIssueMap => {
  const context = createWorkflowCheckContext({ nodes, edges });
  const issueMap: WorkflowCheckNodeIssueMap = {};
  const nodeIds = nodes.map((node) => node.data.nodeId);
  const targetNodes = nodeId ? nodes.filter((node) => node.data.nodeId === nodeId) : nodes;

  const addIssue = ({
    node,
    code,
    message,
    inputKey
  }: {
    node: Node<FlowNodeItemType, string | undefined>;
    code: string;
    message: string;
    inputKey?: string;
  }) => {
    const issue: WorkflowCheckIssue = {
      nodeId: node.data.nodeId,
      nodeName: node.data.name,
      nodeType: node.data.flowNodeType,
      level: 'error',
      code,
      message,
      inputKey
    };
    issueMap[node.data.nodeId] = [...(issueMap[node.data.nodeId] ?? []), issue];
  };

  for (const node of targetNodes) {
    const data = node.data;
    const inputs = data.inputs;
    const inputMap = new Map(inputs.map((input) => [input.key, input]));
    const isToolNode = context.incomingEdgesMap
      .get(data.nodeId)
      ?.some((edge) => edge.targetHandle === NodeOutputKeyEnum.selectedTools);

    if (data.pluginData?.error) {
      const issueCode = resolvePluginDataErrorIssueCode(data.pluginData.error);
      addIssue({
        node,
        code: issueCode,
        message: getWorkflowCheckIssueMessage(issueCode, t)
      });
    }

    const status = data.status ?? data.pluginData?.status;
    if (status === PluginStatusEnum.Offline) {
      addIssue({
        node,
        code: 'tool_offline',
        message: getWorkflowCheckIssueMessage('tool_offline', t)
      });
    }

    // 工具调用下游工具：与 NodeSecret / getToolConfigStatus 共用「尚未激活」判定。
    if (isToolNode) {
      const configStatus = getToolConfigStatus({ tool: data });
      if (configStatus.status === 'waitingForConfig') {
        addIssue({
          node,
          code: 'tool_waiting_config',
          message: getWorkflowCheckIssueMessage('tool_waiting_config', t),
          inputKey: NodeInputKeyEnum.systemInputConfig
        });
      }
    }

    if (!workflowCheckSkipNodeRuleTypes.has(data.flowNodeType)) {
      if (data.flowNodeType === FlowNodeTypeEnum.ifElseNode) {
        const ifElseList = inputMap.get(NodeInputKeyEnum.ifElseList)?.value as
          | IfElseListItemType[]
          | undefined;
        const hasIncompleteCondition = (ifElseList ?? []).some((item) =>
          item.list.some(
            (listItem) =>
              listItem.variable === undefined ||
              listItem.condition === undefined ||
              (listItem.value === undefined &&
                listItem.condition !== VariableConditionEnum.isEmpty &&
                listItem.condition !== VariableConditionEnum.isNotEmpty)
          )
        );

        if (!ifElseList || hasIncompleteCondition) {
          addIssue({
            node,
            code: 'if_else_incomplete',
            message: getWorkflowCheckIssueMessage('if_else_incomplete', t),
            inputKey: NodeInputKeyEnum.ifElseList
          });
        }
      }

      if (data.flowNodeType === FlowNodeTypeEnum.userSelect) {
        const configValue = inputMap.get(NodeInputKeyEnum.userSelectOptions)?.value as
          | Array<{ value?: string }>
          | undefined;
        if (!configValue || configValue.length === 0) {
          addIssue({
            node,
            code: 'user_select_empty',
            message: getWorkflowCheckIssueMessage('user_select_empty', t),
            inputKey: NodeInputKeyEnum.userSelectOptions
          });
        } else if (configValue.some((item) => !item.value)) {
          addIssue({
            node,
            code: 'user_select_value_empty',
            message: getWorkflowCheckIssueMessage('user_select_value_empty', t),
            inputKey: NodeInputKeyEnum.userSelectOptions
          });
        }
      }

      if (data.flowNodeType === FlowNodeTypeEnum.formInput) {
        const value = inputMap.get(NodeInputKeyEnum.userInputForms)?.value as unknown[] | undefined;
        if (!value || value.length === 0) {
          addIssue({
            node,
            code: 'form_input_empty',
            message: getWorkflowCheckIssueMessage('form_input_empty', t),
            inputKey: NodeInputKeyEnum.userInputForms
          });
        }
      }

      if (data.flowNodeType === FlowNodeTypeEnum.datasetConcatNode) {
        const quoteInputs = inputs.filter((input) => input.canEdit);
        if (quoteInputs.length === 0) {
          addIssue({
            node,
            code: 'required_input_empty',
            message: getWorkflowCheckIssueMessage('required_input_empty', t, {
              inputName: t ? t('common:core.workflow.Dataset quote' as any) : '知识库引用'
            }),
            inputKey: NodeInputKeyEnum.datasetQuoteList
          });
        }
      }

      if (data.flowNodeType === FlowNodeTypeEnum.classifyQuestion) {
        const agents = inputMap.get(NodeInputKeyEnum.agents)?.value as
          | Array<{ value?: string; key?: string }>
          | undefined;
        if (!agents || agents.length === 0) {
          addIssue({
            node,
            code: 'classify_question_empty',
            message: getWorkflowCheckIssueMessage('classify_question_empty', t),
            inputKey: NodeInputKeyEnum.agents
          });
        } else if (agents.some((item) => !item.value)) {
          addIssue({
            node,
            code: 'classify_question_value_empty',
            message: getWorkflowCheckIssueMessage('classify_question_value_empty', t),
            inputKey: NodeInputKeyEnum.agents
          });
        }
      }

      if (data.flowNodeType === FlowNodeTypeEnum.code) {
        const hasIncompleteDynamicInput = inputs.some((input) => {
          if (
            [
              NodeInputKeyEnum.code,
              NodeInputKeyEnum.codeType,
              NodeInputKeyEnum.addInputParam
            ].includes(input.key as NodeInputKeyEnum)
          ) {
            return false;
          }
          if (!input.canEdit) {
            return false;
          }
          return !input.key || !input.label || isUnsetReferenceValue(input.value);
        });
        if (hasIncompleteDynamicInput) {
          addIssue({
            node,
            code: 'code_input_incomplete',
            message: getWorkflowCheckIssueMessage('code_input_incomplete', t)
          });
        }
      }

      if (data.flowNodeType === FlowNodeTypeEnum.httpRequest468) {
        const urlInput = inputMap.get(NodeInputKeyEnum.httpReqUrl);
        if (isEmptyWorkflowInputValue(urlInput?.value)) {
          addIssue({
            node,
            code: 'http_url_empty',
            message: getWorkflowCheckIssueMessage('http_url_empty', t),
            inputKey: NodeInputKeyEnum.httpReqUrl
          });
        }
      }

      if (data.flowNodeType === FlowNodeTypeEnum.contentExtract) {
        const extractKeys = inputMap.get(NodeInputKeyEnum.extractKeys)?.value as
          | unknown[]
          | undefined;
        if (!extractKeys || extractKeys.length === 0) {
          addIssue({
            node,
            code: 'context_extract_empty',
            message: getWorkflowCheckIssueMessage('context_extract_empty', t),
            inputKey: NodeInputKeyEnum.extractKeys
          });
        }
      }

      if (data.flowNodeType === FlowNodeTypeEnum.loopRun) {
        const mode = inputMap.get(NodeInputKeyEnum.loopRunMode)?.value as
          | LoopRunModeEnum
          | undefined;
        if (mode === LoopRunModeEnum.conditional) {
          const children =
            (inputMap.get(NodeInputKeyEnum.childrenNodeIdList)?.value as string[]) ?? [];
          const childSet = new Set(children);
          const hasBreak = nodes.some(
            (n) =>
              childSet.has(n.data.nodeId) && n.data.flowNodeType === FlowNodeTypeEnum.loopRunBreak
          );
          if (!hasBreak) {
            addIssue({
              node,
              code: 'loop_run_missing_break',
              message: getWorkflowCheckIssueMessage('loop_run_missing_break', t)
            });
          }
        }
      }

      if (data.flowNodeType === FlowNodeTypeEnum.toolCall) {
        const toolConnections = context.outgoingEdgesMap
          .get(data.nodeId)
          ?.filter((edge) => edge.sourceHandle === NodeOutputKeyEnum.selectedTools);
        const useAgentSandbox = inputMap.get(NodeInputKeyEnum.useAgentSandbox)?.value;
        if ((toolConnections?.length ?? 0) === 0 && !useAgentSandbox) {
          addIssue({
            node,
            code: 'tool_call_empty',
            message: getWorkflowCheckIssueMessage('tool_call_empty', t),
            inputKey: NodeInputKeyEnum.useAgentSandbox
          });
        }
      }

      if (data.flowNodeType === FlowNodeTypeEnum.variableUpdate) {
        const updateList = inputMap.get(NodeInputKeyEnum.updateList)?.value as
          | TUpdateListItem[]
          | undefined;

        const addVariableUpdateRequiredIssue = (field: 'variable' | 'value') => {
          const inputName = (() => {
            if (field === 'variable') {
              return t ? t('common:core.workflow.variable' as any) : '变量';
            }

            return t ? t('common:value' as any) : '值';
          })();

          addIssue({
            node,
            code: 'required_input_empty',
            message: getWorkflowCheckIssueMessage('required_input_empty', t, {
              inputName
            }),
            inputKey: NodeInputKeyEnum.updateList
          });
        };

        if (!updateList || updateList.length === 0) {
          addVariableUpdateRequiredIssue('variable');
          addVariableUpdateRequiredIssue('value');
        } else {
          updateList.forEach((item) => {
            if (isVariableUpdateTargetEmpty(item.variable, nodeIds, context)) {
              addVariableUpdateRequiredIssue('variable');
            }
            if (isVariableUpdateValueEmpty(item, context)) {
              addVariableUpdateRequiredIssue('value');
            }
          });
        }
      }

      inputs.forEach((input) => {
        if (input.key === NodeInputKeyEnum.loopRunInputArray) {
          const loopRunMode = inputMap.get(NodeInputKeyEnum.loopRunMode)?.value as
            | LoopRunModeEnum
            | undefined;
          if (
            data.flowNodeType === FlowNodeTypeEnum.loopRun &&
            loopRunMode === LoopRunModeEnum.conditional
          ) {
            return;
          }
        }

        if (shouldSkipGenericRequiredInputCheck(input)) {
          return;
        }

        if (isToolNode && input.toolDescription) {
          return;
        }

        const isReferenceInput = nodeInputIsReference(input);
        const isArrayReference = isReferenceInput && !!input.valueType?.startsWith('array');
        const inputValueIsEmpty = isReferenceInput
          ? isEmptyReferenceInputValue(input.value, isArrayReference)
          : isEmptyWorkflowInputValue(input.value);

        if (
          input.required &&
          inputValueIsEmpty &&
          !(data.flowNodeType === FlowNodeTypeEnum.code && input.canEdit)
        ) {
          addIssue({
            node,
            code: 'required_input_empty',
            message: getWorkflowCheckIssueMessage('required_input_empty', t, {
              inputName: getInputLabel(input, t)
            }),
            inputKey: input.key
          });
        }

        if (isReferenceInput) {
          if (isArrayReference) {
            const value = Array.isArray(input.value) ? input.value : [];
            const hasStaleReference = value.some((item) => isStaleReferenceValue(item, context));

            if (hasStaleReference) {
              addIssue({
                node,
                code: 'invalid_reference',
                message: getWorkflowCheckIssueMessage('invalid_reference', t, {
                  inputName: getInputLabel(input, t)
                }),
                inputKey: input.key
              });
            }
          } else if (isStaleReferenceValue(input.value, context)) {
            addIssue({
              node,
              code: 'invalid_reference',
              message: getWorkflowCheckIssueMessage('invalid_reference', t, {
                inputName: getInputLabel(input, t)
              }),
              inputKey: input.key
            });
          }
        }
      });
    }

    if (!workflowCheckSkipConnectionTypes.has(data.flowNodeType)) {
      const isStartNode = workflowCheckStartTypes.has(data.flowNodeType);
      const incomingEdges = context.incomingEdgesMap.get(data.nodeId) ?? [];
      const outgoingEdges = context.outgoingEdgesMap.get(data.nodeId) ?? [];
      const meaningfulOutgoingEdges =
        data.flowNodeType === FlowNodeTypeEnum.toolCall
          ? outgoingEdges.filter((edge) => edge.sourceHandle !== NodeOutputKeyEnum.selectedTools)
          : outgoingEdges;
      const hasAnyMeaningfulEdge = incomingEdges.length > 0 || meaningfulOutgoingEdges.length > 0;

      if (!isStartNode && incomingEdges.length === 0) {
        addIssue({
          node,
          code: 'no_upstream',
          message: getWorkflowCheckIssueMessage('no_upstream', t)
        });
      } else if (!isStartNode && !context.reachableNodeSet.has(data.nodeId)) {
        addIssue({
          node,
          code: 'unreachable_from_start',
          message: getWorkflowCheckIssueMessage('unreachable_from_start', t)
        });
      } else if (!hasAnyMeaningfulEdge) {
        addIssue({
          node,
          code: 'isolated_node',
          message: getWorkflowCheckIssueMessage('isolated_node', t)
        });
      }
    }
  }

  return issueMap;
};

export const checkWorkflowHasError = (nodeIssueMap: WorkflowCheckNodeIssueMap) =>
  Object.values(nodeIssueMap).some((issues) => issues.some((issue) => issue.level === 'error'));

/** 返回存在 error 的 nodeId 列表；传入 nodeOrder 时按画布节点顺序排列，便于稳定定位第一个错误节点。 */
export const getWorkflowCheckErrorNodeIds = (
  nodeIssueMap: WorkflowCheckNodeIssueMap,
  nodeOrder?: string[]
) => {
  const errorNodeIdSet = new Set(
    Object.entries(nodeIssueMap)
      .filter(([, issues]) => issues.some((issue) => issue.level === 'error'))
      .map(([nodeId]) => nodeId)
  );

  if (nodeOrder) {
    return nodeOrder.filter((nodeId) => errorNodeIdSet.has(nodeId));
  }

  return [...errorNodeIdSet];
};

/** 运行/发布前全量扫描，并按画布节点顺序返回第一个 error 节点。 */
export const checkWorkflowBeforeRunOrPublish = ({
  nodes,
  edges,
  t
}: {
  nodes: Node<FlowNodeItemType, string | undefined>[];
  edges: Edge<any>[];
  t?: TFunction;
}) => {
  const issueMap = checkWorkflowNodeIssues({ nodes, edges, t });
  const nodeOrder = nodes.map((node) => node.data.nodeId);
  const errorNodeIds = getWorkflowCheckErrorNodeIds(issueMap, nodeOrder);

  return {
    issueMap,
    hasError: errorNodeIds.length > 0,
    firstErrorNodeId: errorNodeIds[0],
    errorNodeIds
  };
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
