import type { StoreNodeItemType, FlowNodeItemType } from '@fastgpt/global/core/workflow/type/node';
import type { FlowNodeTemplateType } from '@fastgpt/global/core/workflow/type/node';
import type { Edge, Node, XYPosition } from 'reactflow';
import { moduleTemplatesFlat } from '@fastgpt/global/core/workflow/template/constants';
import {
  AppNodeFlowNodeTypeMap,
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
  isValidReferenceValueFormat
} from '@fastgpt/global/core/workflow/utils';
import { type TFunction } from 'next-i18next';
import {
  type FlowNodeInputItemType,
  type FlowNodeOutputItemType,
  type ReferenceItemValueType
} from '@fastgpt/global/core/workflow/type/io';
import { type IfElseListItemType } from '@fastgpt/global/core/workflow/template/system/ifElse/type';
import { type TUpdateListItem } from '@fastgpt/global/core/workflow/template/system/variableUpdate/type';
import { VariableConditionEnum } from '@fastgpt/global/core/workflow/template/system/ifElse/constant';
import { type AppChatConfigType } from '@fastgpt/global/core/app/type';
import { cloneDeep, isEqual } from 'lodash';
import { workflowSystemVariables } from '../app/utils';
import type { WorkflowDataContextType } from '@/pageComponents/app/detail/WorkflowComponents/context/workflowInitContext';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import type { LLMModelItemType } from '@fastgpt/global/core/ai/model.schema';

/* ====== node ======= */
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

  const templateInputs = template.inputs.filter(
    (input) => !input.canEdit && input.deprecated !== true
  );
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
    version: template.version || storeNode.version,
    catchError: storeNode.catchError ?? template.catchError,
    // template 中的输入必须都有
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
          value: storeInput.value
        };
      })
      .concat(
        // 合并 store 中有，template 中没有的输入
        storeNode.inputs
          .filter((item) => !templateInputs.find((input) => input.key === item.key))
          .map((item) => {
            if (!dynamicInput) return item;
            const templateInput = template.inputs.find((input) => input.key === item.key);

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
    llmModelType: input.llmModelType,
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

/** 引用变量列表展示：挂在 loopPro 子画布下的循环开始/结束使用 Pro 系列图标（节点数据里仍为模板 avatar） */
export const resolveReferenceListNodeAvatar = (
  node: FlowNodeItemType,
  getNodeById: (nodeId: string | null | undefined) => FlowNodeItemType | undefined
): string => {
  const parentId = node.parentNodeId;
  if (!parentId) return node.avatar || '';
  const parent = getNodeById(parentId);
  if (parent?.flowNodeType !== FlowNodeTypeEnum.loopPro) return node.avatar || '';
  if (node.flowNodeType === FlowNodeTypeEnum.loopStart) {
    return 'core/workflow/template/loopProStart';
  }
  if (
    node.flowNodeType === FlowNodeTypeEnum.loopProEnd ||
    node.flowNodeType === FlowNodeTypeEnum.loopEnd
  ) {
    return 'core/workflow/template/loopProEnd';
  }
  return node.avatar || '';
};

/** 完整响应侧边栏：父节点为 loopPro 时，子链路中的循环开始/结束使用 Pro 系列图标（与画布、引用选择器一致） */
export const resolveLoopProSubflowAvatarOverride = (
  parentModuleType: FlowNodeTypeEnum | undefined,
  moduleType: FlowNodeTypeEnum
): string | undefined => {
  if (parentModuleType !== FlowNodeTypeEnum.loopPro) return undefined;
  if (moduleType === FlowNodeTypeEnum.loopStart) {
    return 'core/workflow/template/loopProStart';
  }
  if (moduleType === FlowNodeTypeEnum.loopProEnd || moduleType === FlowNodeTypeEnum.loopEnd) {
    return 'core/workflow/template/loopProEnd';
  }
  return undefined;
};

/**
 * loop / batch / loopPro：父容器输入里配置的「引用」往往只写在 input.value 中、图上没有边；
 * 子画布内选引用时需把这些上游节点也纳入可选范围（再沿边继续反向展开）。
 */
const getContainerParentReferenceSeedNodeIds = (parent: FlowNodeItemType): string[] => {
  const seeds = new Set<string>();
  const tryAdd = (value: unknown) => {
    if (!isValidReferenceValueFormat(value)) return;
    const refNodeId = value[0];
    if (refNodeId && refNodeId !== VARIABLE_NODE_ID) seeds.add(refNodeId);
  };

  for (const input of parent.inputs || []) {
    const renderType = input.renderTypeList?.[input.selectedTypeIndex ?? 0];
    if (renderType === FlowNodeInputTypeEnum.reference) {
      tryAdd(input.value);
      continue;
    }
    if (Array.isArray(input.value) && input.value.length > 0) {
      for (const item of input.value) {
        tryAdd(item);
      }
    }
  }
  return [...seeds];
};

/**
 * 引用下拉可选的上游节点：沿入边反向递归，并注入全局变量伪节点。
 * 子画布内若只沿边，会选不到仅出现在父容器（batch/loop/loopPro）输入引用里的主画布节点，故额外用父输入中的引用作为种子再沿边展开。
 */
export const getNodeAllSource = ({
  nodeId,
  systemConfigNode,
  getNodeById,
  edges,
  chatConfig,
  t
}: {
  nodeId: string;
  systemConfigNode?: StoreNodeItemType;
  getNodeById: (nodeId: string | null | undefined) => FlowNodeItemType | undefined;
  edges: Edge[];
  chatConfig: AppChatConfigType;
  t: TFunction;
}): FlowNodeItemType[] => {
  // get current node
  const node = getNodeById(nodeId);
  if (!node) {
    return [];
  }

  const parentId = node.parentNodeId;
  const sourceNodes = new Map<string, FlowNodeItemType>();
  // 根据 edge 获取所有的 source 节点（source节点会继续向前递归获取）
  const findSourceNode = (nodeId: string) => {
    const targetEdges = edges.filter((item) => item.target === nodeId || item.target === parentId);
    targetEdges.forEach((edge) => {
      const sourceNode = getNodeById(edge.source);
      if (!sourceNode) return;

      // 去重
      if (sourceNodes.has(sourceNode.nodeId)) {
        return;
      }
      sourceNodes.set(sourceNode.nodeId, sourceNode);
      findSourceNode(sourceNode.nodeId);
    });
  };
  findSourceNode(nodeId);

  if (parentId) {
    const parent = getNodeById(parentId);
    if (
      parent &&
      [FlowNodeTypeEnum.batch, FlowNodeTypeEnum.loop, FlowNodeTypeEnum.loopPro].includes(
        parent.flowNodeType
      )
    ) {
      for (const seedId of getContainerParentReferenceSeedNodeIds(parent)) {
        const seedNode = getNodeById(seedId);
        if (!seedNode) continue;
        if (!sourceNodes.has(seedNode.nodeId)) {
          sourceNodes.set(seedNode.nodeId, seedNode);
        }
        findSourceNode(seedId);
      }
    }
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
// Connectivity check result type
type ConnectivityIssue = {
  nodeId: string;
  issue: 'isolated' | 'no_input' | 'unreachable_from_start';
};

/** loop / batch：子画布内必须恰好 1 个「结束」节点 */
export const checkLoopBatchSingleLoopEnd = ({
  nodes
}: {
  nodes: Node<FlowNodeItemType, string | undefined>[];
}): string[] | undefined => {
  for (const wfNode of nodes) {
    const ft = wfNode.data.flowNodeType;
    if (ft !== FlowNodeTypeEnum.loop && ft !== FlowNodeTypeEnum.batch) continue;

    const parentId = wfNode.data.nodeId;
    const endCount = nodes.filter(
      (n) => n.data.parentNodeId === parentId && n.data.flowNodeType === FlowNodeTypeEnum.loopEnd
    ).length;
    if (endCount !== 1) {
      return [wfNode.data.nodeId];
    }
  }
  return undefined;
};

/** loop_pro: There must be a directed path from "Loop Start" to "Loop End" within the subgraph (verified when strict is enabled for release/debug; applicable to both array and conditional patterns). */
export const checkLoopProConditionTermination = ({
  nodes,
  edges
}: {
  nodes: Node<FlowNodeItemType, string | undefined>[];
  edges: Edge<any>[];
}): string[] | undefined => {
  for (const wfNode of nodes) {
    if (wfNode.data.flowNodeType !== FlowNodeTypeEnum.loopPro) continue;

    const parentId = wfNode.data.nodeId;
    const childIds = new Set(
      nodes.filter((n) => n.data.parentNodeId === parentId).map((n) => n.data.nodeId)
    );

    const loopStart = nodes.find(
      (n) => n.data.parentNodeId === parentId && n.data.flowNodeType === FlowNodeTypeEnum.loopStart
    );
    const loopEndIds = new Set(
      nodes
        .filter(
          (n) =>
            n.data.parentNodeId === parentId &&
            (n.data.flowNodeType === FlowNodeTypeEnum.loopProEnd ||
              n.data.flowNodeType === FlowNodeTypeEnum.loopEnd)
        )
        .map((n) => n.data.nodeId)
    );

    if (!loopStart || loopEndIds.size === 0) {
      return [wfNode.data.nodeId];
    }

    const queue: string[] = [loopStart.data.nodeId];
    const visited = new Set<string>();
    let reachedEnd = false;

    while (queue.length > 0) {
      const id = queue.shift()!;
      if (loopEndIds.has(id)) {
        reachedEnd = true;
        break;
      }
      if (visited.has(id)) continue;
      visited.add(id);

      for (const edge of edges) {
        if (edge.source !== id) continue;
        if (!childIds.has(edge.target)) continue;
        queue.push(edge.target);
      }
    }

    if (!reachedEnd) {
      return [wfNode.data.nodeId];
    }
  }

  return undefined;
};

/** 保存期：loopEnd / loopProEnd 禁止出边；边的两端须在同一 parent 作用域（与 ConnectionHandle 规则一致） */
export const checkWorkflowEdgesStructure = (
  nodes: Node<FlowNodeItemType, string | undefined>[],
  edges: Edge<any>[]
): string[] | undefined => {
  const nodeById = new Map(nodes.map((n) => [n.data.nodeId, n]));

  for (const node of nodes) {
    const ft = node.data.flowNodeType;
    if (ft !== FlowNodeTypeEnum.loopEnd && ft !== FlowNodeTypeEnum.loopProEnd) continue;
    if (edges.some((e) => e.source === node.data.nodeId)) {
      return [node.data.nodeId];
    }
  }

  for (const edge of edges) {
    const sourceNode = nodeById.get(edge.source);
    const targetNode = nodeById.get(edge.target);
    if (!sourceNode || !targetNode) continue;

    const sourceParent = sourceNode.data.parentNodeId;
    const targetParent = targetNode.data.parentNodeId;
    if (sourceParent !== targetParent) {
      return [edge.source];
    }
  }

  return undefined;
};

/** 批量并行子画布内禁止通过「变量更新」写入应用级全局变量（可读不可写） */
export const checkBatchParallelNoGlobalVariableWrites = (
  nodes: Node<FlowNodeItemType, string | undefined>[]
): string[] | undefined => {
  const nodeById = new Map(nodes.map((n) => [n.data.nodeId, n]));
  const violating: string[] = [];

  for (const node of nodes) {
    const parentId = node.data.parentNodeId;
    if (!parentId) continue;
    const parent = nodeById.get(parentId);
    if (!parent || parent.data.flowNodeType !== FlowNodeTypeEnum.batch) continue;
    if (node.data.flowNodeType !== FlowNodeTypeEnum.variableUpdate) continue;

    const updateList = node.data.inputs.find((i) => i.key === NodeInputKeyEnum.updateList)
      ?.value as TUpdateListItem[] | undefined;
    if (!Array.isArray(updateList)) continue;

    const writesGlobal = updateList.some(
      (item) => item?.variable?.[0] === VARIABLE_NODE_ID && !!item?.variable?.[1]
    );
    if (writesGlobal) {
      violating.push(node.data.nodeId);
    }
  }

  return violating.length > 0 ? violating : undefined;
};

export const isBatchGlobalWriteViolation = (
  nodes: Node<FlowNodeItemType, string | undefined>[],
  failedNodeIds: string[]
): boolean => {
  const violations = checkBatchParallelNoGlobalVariableWrites(nodes);
  if (!violations?.length) return false;
  return failedNodeIds.some((id) => violations.includes(id));
};

export const checkWorkflowNodeAndConnection = ({
  nodes,
  edges,
  options
}: {
  nodes: Node<FlowNodeItemType, string | undefined>[];
  edges: Edge<any>[];
  options?: { strictLoopProCondition?: boolean };
}): string[] | undefined => {
  const batchGlobalWriteIssue = checkBatchParallelNoGlobalVariableWrites(nodes);
  if (batchGlobalWriteIssue) {
    return batchGlobalWriteIssue;
  }

  // Node check
  for (const node of nodes) {
    const data = node.data;
    const inputs = data.inputs;
    const isToolNode = edges.some(
      (edge) =>
        edge.targetHandle === NodeOutputKeyEnum.selectedTools && edge.target === node.data.nodeId
    );

    if (data.pluginData?.error) {
      return [data.nodeId];
    }

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
    if (data.flowNodeType === FlowNodeTypeEnum.userSelect) {
      const configValue = data.inputs.find(
        (input) => input.key === NodeInputKeyEnum.userSelectOptions
      )?.value;
      if (
        !configValue ||
        configValue.length === 0 ||
        configValue.some((item: any) => !item.value)
      ) {
        return [data.nodeId];
      }
    }
    if (data.flowNodeType === FlowNodeTypeEnum.formInput) {
      const value = data.inputs.find(
        (input) => input.key === NodeInputKeyEnum.userInputForms
      )?.value;
      if (!value || value.length === 0) {
        return [data.nodeId];
      }
    }
    if (data.flowNodeType === FlowNodeTypeEnum.toolCall) {
      const toolConnections = edges.filter(
        (edge) =>
          edge.source === data.nodeId && edge.sourceHandle === NodeOutputKeyEnum.selectedTools
      );
      const useAgentSandbox = inputs.find(
        (input) => input.key === NodeInputKeyEnum.useAgentSandbox
      )?.value;
      if (toolConnections.length === 0 && !useAgentSandbox) {
        return [data.nodeId];
      }
    }

    // check node input
    if (
      inputs.some((input) => {
        if (
          data.flowNodeType === FlowNodeTypeEnum.loopPro &&
          input.key === NodeInputKeyEnum.loopInputArray
        ) {
          const mode = inputs.find((i) => i.key === NodeInputKeyEnum.loopProMode)?.value ?? 'array';
          if (mode === 'condition') {
            return false;
          }
        }

        if (
          !input.valueType ||
          [WorkflowIOValueTypeEnum.any, WorkflowIOValueTypeEnum.boolean].includes(input.valueType)
        ) {
          return false;
        }
        // check is tool input
        if (isToolNode && input.toolDescription) {
          return false;
        }

        if (input.required) {
          if (input.value === undefined && input.valueType !== WorkflowIOValueTypeEnum.boolean) {
            return true;
          }
          if (Array.isArray(input.value) && input.value.length === 0) return true;
        }
        // check reference invalid
        const renderType = input.renderTypeList[input.selectedTypeIndex || 0];
        if (renderType === FlowNodeInputTypeEnum.reference) {
          // 无效引用时，返回 true
          const checkValueValid = (value: ReferenceItemValueType) => {
            const nodeId = value?.[0];
            const outputId = value?.[1];

            if (!nodeId || !outputId) return false;

            if (nodeId === VARIABLE_NODE_ID) {
              return true;
            }

            return !!nodes
              .find((node) => node.data.nodeId === nodeId)
              ?.data.outputs.find((output) => output.id === outputId);
          };

          if (input.valueType?.startsWith('array')) {
            input.value = input.value ?? [];
            // 如果内容为空，则报错
            if (input.required && input.value.length === 0) {
              return true;
            }
          } else {
            // Single reference
            if (input.required) {
              return !checkValueValid(input.value);
            }
          }
        }
        return false;
      })
    ) {
      return [data.nodeId];
    }

    // Check node has invalid edge
    const edgeFilted = edges.filter(
      (edge) =>
        !(
          data.flowNodeType === FlowNodeTypeEnum.toolCall &&
          edge.sourceHandle === NodeOutputKeyEnum.selectedTools
        )
    );
    // Check node has edge
    const hasEdge = edgeFilted.some(
      (edge) => edge.source === data.nodeId || edge.target === data.nodeId
    );
    if (!hasEdge) {
      return [data.nodeId];
    }
  }

  const structureIssues = checkWorkflowEdgesStructure(nodes, edges);
  if (structureIssues) {
    return structureIssues;
  }

  const batchLoopEndIssue = checkLoopBatchSingleLoopEnd({ nodes });
  if (batchLoopEndIssue) {
    return batchLoopEndIssue;
  }

  // Edge check

  /**
   * Check graph connectivity and identify connectivity issues
   */
  const checkConnectivity = (
    nodes: Node<FlowNodeItemType, string | undefined>[],
    edges: Edge<any>[]
  ): string[] => {
    // Find start node
    const startNode = nodes.find(
      (node) =>
        node.data.flowNodeType === FlowNodeTypeEnum.workflowStart ||
        node.data.flowNodeType === FlowNodeTypeEnum.pluginInput
    );

    if (!startNode) {
      // No start node found - this is a critical issue
      return nodes.map((node) => node.data.nodeId);
    }

    const issues: ConnectivityIssue[] = [];

    // Build adjacency lists for both directions
    const outgoing = new Map<string, string[]>();
    const incoming = new Map<string, string[]>();

    nodes.forEach((node) => {
      outgoing.set(node.data.nodeId, []);
      incoming.set(node.data.nodeId, []);
    });

    edges.forEach((edge) => {
      const outList = outgoing.get(edge.source) || [];
      outList.push(edge.target);
      outgoing.set(edge.source, outList);

      const inList = incoming.get(edge.target) || [];
      inList.push(edge.source);
      incoming.set(edge.target, inList);
    });

    // Check reachability from start node（Start node/Loop start 可以到达的地方）
    const reachableFromStart = new Set<string>();
    const dfsFromStart = (nodeId: string) => {
      if (reachableFromStart.has(nodeId)) return;
      reachableFromStart.add(nodeId);

      const neighbors = outgoing.get(nodeId) || [];
      neighbors.forEach((neighbor) => dfsFromStart(neighbor));
    };
    dfsFromStart(startNode.data.nodeId);
    nodes.forEach((node) => {
      if (node.data.flowNodeType === FlowNodeTypeEnum.loopStart) {
        dfsFromStart(node.data.nodeId);
      }
    });

    // Check each node for connectivity issues
    for (const node of nodes) {
      const nodeId = node.data.nodeId;
      const nodeType = node.data.flowNodeType;

      // Skip system nodes that don't need connectivity checks
      if (
        nodeType === FlowNodeTypeEnum.systemConfig ||
        nodeType === FlowNodeTypeEnum.pluginConfig ||
        nodeType === FlowNodeTypeEnum.comment ||
        nodeType === FlowNodeTypeEnum.globalVariable ||
        nodeType === FlowNodeTypeEnum.emptyNode
      ) {
        continue;
      }

      const hasIncoming = (incoming.get(nodeId) || []).length > 0;
      const hasOutgoing = (outgoing.get(nodeId) || []).length > 0;
      const isStartNode = [
        FlowNodeTypeEnum.workflowStart,
        FlowNodeTypeEnum.pluginInput,
        FlowNodeTypeEnum.loopStart
      ].includes(nodeType);

      // Check if node is reachable from start
      if (!isStartNode && !reachableFromStart.has(nodeId)) {
        issues.push({
          nodeId,
          issue: 'unreachable_from_start'
        });
        break;
      }
    }

    return issues.map((issue) => issue.nodeId);
  };

  const connectivityIssues = checkConnectivity(nodes, edges);
  if (connectivityIssues.length > 0) {
    return connectivityIssues;
  }

  if (options?.strictLoopProCondition) {
    const loopProIssue = checkLoopProConditionTermination({ nodes, edges });
    if (loopProIssue) {
      return loopProIssue;
    }
  }
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
            // set to arrayAny for loopInputArray to skip valueType comparison
            // valueType: input.key === NodeInputKeyEnum.loopInputArray ? 'arrayAny' : input.valueType,
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
