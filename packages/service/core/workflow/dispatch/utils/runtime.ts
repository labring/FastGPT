import type { ModerationRuntimeContext } from '@fastgpt/global/core/plugin/moderation/type';
import {
  NodeInputKeyEnum,
  NodeOutputKeyEnum,
  VARIABLE_NODE_ID,
  type WorkflowIOValueTypeEnum
} from '@fastgpt/global/core/workflow/constants';
import {
  FlowNodeInputTypeEnum,
  FlowNodeOutputTypeEnum,
  FlowNodeTypeEnum,
  isNestedParentNodeType
} from '@fastgpt/global/core/workflow/node/constant';
import type { AppChatConfigType } from '@fastgpt/global/core/app/type';
import type { RuntimeNodeItemType } from '@fastgpt/global/core/workflow/runtime/type';
import type { WorkflowVariableStateLike } from '../context/variables';
import type { RuntimeEdgeItemType } from '@fastgpt/global/core/workflow/type/edge';
import type {
  FlowNodeInputItemType,
  ReferenceValueType
} from '@fastgpt/global/core/workflow/type/io';
import { valueTypeFormat } from '@fastgpt/global/core/workflow/runtime/utils';
import { getReferenceVariableValue } from '@fastgpt/global/common/workflow/runtime';
import {
  areWorkflowValueTypesCompatible,
  filterSelectableWorkflowNodeOutputs,
  getSelectedInputRenderType,
  getWorkflowReferenceSourceNodes,
  getWorkflowReferenceVariables,
  isValidReferenceValueFormat,
  isWorkflowArrayReferenceInput,
  isWorkflowEdgeSourceHandleValid,
  isWorkflowErrorBranchReachable,
  isWorkflowReferenceItem,
  nodeInputIsReference
} from '@fastgpt/global/common/workflow/reference';
import { getSecretReferenceValue } from '@fastgpt/global/common/secret/utils';
import { formatCollectionFilterMatchParam } from '@fastgpt/global/core/dataset/search/tagFilter';
import { replaceEditorVariable } from './replaceEditorVariable';

type RuntimeReferenceGraph = {
  getIncomingEdges: (nodeId: string) => readonly RuntimeEdgeItemType[];
  hasToolCallEdge?: (nodeId: string) => boolean;
  getReachableTargets?: (sourceId: string) => Set<string>;
  getLegacyParentId?: (nodeId: string) => string | undefined;
  getVariableTypes?: (
    chatConfig?: AppChatConfigType
  ) => ReadonlyMap<string, WorkflowIOValueTypeEnum | undefined>;
};

const getWorkflowVariableTypes = (chatConfig: AppChatConfigType = {}) =>
  new Map(
    getWorkflowReferenceVariables({ chatConfig }).map(({ key, valueType }) => [key, valueType])
  );

type RuntimeReferenceContext = RuntimeReferenceGraph & {
  node: RuntimeNodeItemType;
  runtimeNodesMap: Map<string, RuntimeNodeItemType>;
  chatConfig?: AppChatConfigType;
};

/** 旧容器只记录成员清单。多个父容器同时声明时没有可靠归属。 */
const createLegacyParentReader = (runtimeNodesMap: Map<string, RuntimeNodeItemType>) => {
  let legacyParents: Map<string, string | undefined> | undefined;
  return (nodeId: string) => {
    if (!legacyParents) {
      legacyParents = new Map();
      for (const parent of runtimeNodesMap.values()) {
        if (!isNestedParentNodeType(parent.flowNodeType)) continue;
        const children = parent.inputs.find(
          (input) => input.key === NodeInputKeyEnum.childrenNodeIdList && input.canEdit !== true
        )?.value;
        if (!Array.isArray(children)) continue;
        for (const childId of children) {
          if (typeof childId !== 'string' || childId === parent.nodeId) continue;
          const child = runtimeNodesMap.get(childId);
          if (!child || child.parentNodeId) continue;
          if (!legacyParents.has(childId)) legacyParents.set(childId, parent.nodeId);
          else if (legacyParents.get(childId) !== parent.nodeId)
            legacyParents.set(childId, undefined);
        }
      }
    }
    return legacyParents.get(nodeId);
  };
};

/** 同一张执行图共享入边、旧容器归属及已确认的来源可达关系。 */
export const createRuntimeReferenceGraph = ({
  runtimeEdges,
  runtimeNodesMap
}: {
  runtimeEdges: readonly RuntimeEdgeItemType[];
  runtimeNodesMap: Map<string, RuntimeNodeItemType>;
}) => {
  const toolCallerIds = new Set<string>();
  const reachableTargetsBySource = new Map<string, Set<string>>();
  let variableTypes: ReturnType<typeof getWorkflowVariableTypes> | undefined;
  let byTarget: Map<string, RuntimeEdgeItemType[]> | undefined;
  const getEdgeIndex = () => {
    if (byTarget) return byTarget;
    byTarget = new Map();
    for (const edge of runtimeEdges) {
      const source = runtimeNodesMap.get(edge.source);
      if (!source) continue;
      // 工具挂载提供调用者的上游来源。普通连线按出口规则过滤旧快照中的已删除分支。
      if (edge.targetHandle === NodeOutputKeyEnum.selectedTools) toolCallerIds.add(edge.source);
      else if (!isWorkflowEdgeSourceHandleValid(source, edge.sourceHandle)) continue;

      const incoming = byTarget.get(edge.target);
      if (incoming) incoming.push(edge);
      else byTarget.set(edge.target, [edge]);
    }
    return byTarget;
  };

  return {
    getIncomingEdges: (nodeId: string) => getEdgeIndex().get(nodeId) ?? [],
    hasToolCallEdge: (nodeId: string) => {
      getEdgeIndex();
      return toolCallerIds.has(nodeId);
    },
    getReachableTargets: (sourceId: string) => {
      let targets = reachableTargetsBySource.get(sourceId);
      if (!targets) reachableTargetsBySource.set(sourceId, (targets = new Set()));
      return targets;
    },
    getLegacyParentId: createLegacyParentReader(runtimeNodesMap),
    getVariableTypes: (chatConfig?: AppChatConfigType) =>
      (variableTypes ??= getWorkflowVariableTypes(chatConfig))
  } satisfies RuntimeReferenceGraph;
};

/** 判断执行时可消费的引用。图和变量目录只在当前节点首次需要时查询。 */
export const createRuntimeReferenceCheck = ({
  node,
  runtimeNodesMap,
  getIncomingEdges,
  hasToolCallEdge,
  getReachableTargets,
  getLegacyParentId = createLegacyParentReader(runtimeNodesMap),
  getVariableTypes = getWorkflowVariableTypes,
  chatConfig
}: RuntimeReferenceContext) => {
  const getNodeById = (id: string) => {
    const entry = id === node.nodeId ? node : runtimeNodesMap.get(id);
    if (!entry || entry.parentNodeId) return entry;
    const parentNodeId = getLegacyParentId(id);
    return parentNodeId ? { ...entry, parentNodeId } : entry;
  };
  let allowedSourceIds: Set<string> | undefined;
  const checkedSourceIds = new Map<string, boolean>();
  let variableTypes: ReadonlyMap<string, WorkflowIOValueTypeEnum | undefined> | undefined;
  let parentByNodeId: Map<string, string> | undefined;

  const hasSourceNode = (sourceId: string) => {
    if (allowedSourceIds) return allowedSourceIds.has(sourceId);
    const checked = checkedSourceIds.get(sourceId);
    if (checked !== undefined) return checked;

    const stopAtSourceId = hasToolCallEdge?.(sourceId) === false ? sourceId : undefined;
    const sources = getWorkflowReferenceSourceNodes({
      nodeId: node.nodeId,
      getNodeById,
      getIncomingEdges,
      stopAtSourceId,
      reachableTargets: stopAtSourceId ? getReachableTargets?.(stopAtSourceId) : undefined
    });
    if (!stopAtSourceId) {
      allowedSourceIds = new Set(sources.map(({ nodeId }) => nodeId));
      return allowedSourceIds.has(sourceId);
    }
    const found = sources.some(({ nodeId }) => nodeId === sourceId);
    checkedSourceIds.set(sourceId, found);
    return found;
  };

  return (
    [sourceId, outputId]: [string, string],
    {
      valueType,
      excludeValueTypes,
      includeChildren = false,
      allowUndeclaredVariable = false
    }: {
      valueType?: WorkflowIOValueTypeEnum;
      excludeValueTypes?: readonly WorkflowIOValueTypeEnum[];
      includeChildren?: boolean;
      allowUndeclaredVariable?: boolean;
    } = {}
  ) => {
    if (sourceId === VARIABLE_NODE_ID) {
      variableTypes ??= getVariableTypes(chatConfig);
      if (!variableTypes.has(outputId)) return allowUndeclaredVariable;
      const type = variableTypes.get(outputId);
      return (
        areWorkflowValueTypesCompatible({ actual: type, expected: valueType }) &&
        (type === undefined || !excludeValueTypes?.includes(type))
      );
    }
    if (sourceId === node.nodeId) return false;
    const source = getNodeById(sourceId);
    const output = source?.outputs.find(({ id }) => id === outputId);
    if (!source || !output) return false;

    // 旧版本保存过推理输出的编辑器派生标记；执行时使用本次产出并尊重显式关闭。
    const referenceOutput =
      source.flowNodeType === FlowNodeTypeEnum.chatNode &&
      output.key === NodeOutputKeyEnum.reasoningText
        ? {
            ...output,
            invalid:
              typeof output.value !== 'string' ||
              source.inputs.find(({ key }) => key === NodeInputKeyEnum.aiChatReasoningEffort)
                ?.value === 'none'
          }
        : output;
    const [selectableOutput] = filterSelectableWorkflowNodeOutputs({
      outputs: [referenceOutput],
      catchError: source.catchError,
      valueType,
      excludeValueTypes
    });
    if (!selectableOutput) return false;

    const isVisibleChild =
      includeChildren &&
      isNestedParentNodeType(node.flowNodeType) &&
      source.parentNodeId === node.nodeId;
    if (!isVisibleChild && !hasSourceNode(sourceId)) return false;
    // 循环输出在本轮结束后取值，直接子节点的捕获结果无需通过外层容器的 catch 边。
    if (
      output.type !== FlowNodeOutputTypeEnum.error ||
      (isVisibleChild && node.flowNodeType === FlowNodeTypeEnum.loopRun)
    )
      return true;

    parentByNodeId ??= new Map(
      [...runtimeNodesMap.keys()].flatMap((nodeId) => {
        const parentNodeId = getNodeById(nodeId)?.parentNodeId;
        return parentNodeId ? [[nodeId, parentNodeId]] : [];
      })
    );
    return isWorkflowErrorBranchReachable({
      sourceNodeId: sourceId,
      targetNodeId: node.nodeId,
      parentByNodeId,
      getIncomingEdges
    });
  };
};

/** 清理已知引用输入的执行值，保留有效项的顺序及单选、多选形态。 */
export const filterRuntimeReferenceInput = ({
  input,
  value,
  isSelectable
}: {
  input: Pick<FlowNodeInputItemType, 'valueType' | 'canEdit'>;
  value: unknown[];
  isSelectable: ReturnType<typeof createRuntimeReferenceCheck>;
}) => {
  const isValid = (item: unknown) =>
    isWorkflowReferenceItem(item) &&
    isSelectable(item, {
      valueType: input.valueType,
      includeChildren: input.canEdit === true,
      // 普通引用仍可读取未在应用配置中声明、仅由运行时写入的变量。
      allowUndeclaredVariable: true
    });
  return typeof value[0] === 'string'
    ? isValid(value)
      ? value
      : undefined
    : value.filter(isValid);
};

/**
 * 解析单个工作流节点运行参数。
 *
 * 这是调度热路径：每个节点执行前都会经过。这里按需构造 runtime variables，
 * 并在调度层跳过静态输入的文本替换，避免无变量节点也复制整张变量表。
 */
export const getWorkflowNodeRunParams = ({
  node,
  runtimeNodesMap,
  variableState,
  chatConfig,
  isDebugMode = false,
  getReferenceGraph
}: Pick<RuntimeReferenceContext, 'node' | 'runtimeNodesMap' | 'chatConfig'> & {
  variableState: WorkflowVariableStateLike;
  isDebugMode?: boolean;
  getReferenceGraph?: () => RuntimeReferenceGraph;
}) => {
  let runtimeVariables: Record<string, unknown> | undefined;
  const getRuntimeVariables = () => {
    runtimeVariables ??= variableState.toRuntimeRecord();
    return runtimeVariables;
  };
  const resolveSecretInputReference = (value: unknown) => {
    const reference = getSecretReferenceValue(value);
    if (!reference) return value;

    const resolvedValue = getReferenceVariableValue({
      value: reference,
      nodesMap: runtimeNodesMap,
      variables: getRuntimeVariables()
    });
    // 通用引用解析器会将缺失节点的引用原样返回，避免它被格式化成密码文本。
    return resolvedValue === reference ? undefined : resolvedValue;
  };

  if (node.flowNodeType === FlowNodeTypeEnum.pluginInput) {
    // Format plugin input to object
    return node.inputs.reduce<Record<string, any>>((acc, item) => {
      // 内部变量不从工具参数进入，缺少 runtime value 时使用节点声明的默认值。
      const value = item.value ?? item.defaultValue;
      const isSecretInput = getSelectedInputRenderType(item) === FlowNodeInputTypeEnum.password;
      acc[item.key] = valueTypeFormat(
        isSecretInput ? resolveSecretInputReference(value) : value,
        item.valueType,
        isSecretInput
      );
      return acc;
    }, {});
  }

  // Dynamic input need to store a key.
  const dynamicInput = node.inputs.find(
    (item) => item.renderTypeList[0] === FlowNodeInputTypeEnum.addInputParam
  );
  const params: Record<string, any> = dynamicInput
    ? {
        [dynamicInput.key]: {}
      }
    : {};
  let isReferenceSelectable: ReturnType<typeof createRuntimeReferenceCheck> | undefined;

  node.inputs.forEach((input) => {
    // Special input, not format
    if (input.key === dynamicInput?.key) return;

    const isUserSelectOptions =
      node.flowNodeType === FlowNodeTypeEnum.userSelect &&
      input.key === NodeInputKeyEnum.userSelectOptions;
    const isDebugValueOverride = isDebugMode && input.debugValueOverride === true;
    // 交互选项按保存校验的同一规则回退到默认引用，调试手填参数优先。
    const rawValue =
      !isDebugValueOverride &&
      ((isUserSelectOptions && nodeInputIsReference(input)) ||
        (node.flowNodeType === FlowNodeTypeEnum.formInput &&
          input.key === NodeInputKeyEnum.userInputForms))
        ? (input.value ?? input.defaultValue)
        : input.value;

    // 用户选择节点自行展开动态选项，其他节点的同名自定义参数仍需正常解析和聚合。
    if (
      [NodeInputKeyEnum.childrenNodeIdList, NodeInputKeyEnum.httpJsonBody].includes(
        input.key as NodeInputKeyEnum
      ) ||
      isUserSelectOptions
    ) {
      params[input.key] = rawValue;
      return;
    }

    const isReferenceInput = nodeInputIsReference(input);
    const isSecretInput = getSelectedInputRenderType(input) === FlowNodeInputTypeEnum.password;
    const needsTextReplace = typeof rawValue === 'string' && rawValue.includes('{{');
    let value = rawValue;

    // 保存保留失效引用供编辑器修复，执行只解析当次图中可消费的引用。
    const isStoredReference = !isDebugMode || input.debugValueOverride === false;
    if (getReferenceGraph && isReferenceInput && isStoredReference && Array.isArray(rawValue)) {
      // 旧多选字段的平铺数组可以是字面量，嵌套引用和指向现存来源的单引用仍要检查。
      const legacyArrayLiteral =
        isWorkflowArrayReferenceInput(node.flowNodeType, input) &&
        !isValidReferenceValueFormat(rawValue, runtimeNodesMap) &&
        !rawValue.every((item) => isValidReferenceValueFormat(item));
      if (!legacyArrayLiteral) {
        const isSelectable = (isReferenceSelectable ??= createRuntimeReferenceCheck({
          node,
          runtimeNodesMap,
          chatConfig,
          ...getReferenceGraph()
        }));
        value = filterRuntimeReferenceInput({ input, value: rawValue, isSelectable });
      }
    }

    if (isSecretInput) {
      value = resolveSecretInputReference(value);
    }

    if (isReferenceInput && isDebugValueOverride) {
      // 新调试表单为引用输入提交字面值，跳过引用解析和文本插值。
      value = rawValue;
    } else if (isReferenceInput && !needsTextReplace) {
      value = getReferenceVariableValue({
        value,
        nodesMap: runtimeNodesMap,
        variables: getRuntimeVariables(),
        isReferenceVal: true
      });
    } else {
      if (needsTextReplace) {
        value = replaceEditorVariable({
          text: value,
          nodesMap: runtimeNodesMap,
          variables: getRuntimeVariables()
        });
      }

      if (isReferenceInput) {
        value = getReferenceVariableValue({
          value,
          nodesMap: runtimeNodesMap,
          variables: getRuntimeVariables(),
          isReferenceVal: true
        });
      }
    }

    if (
      input.key === NodeInputKeyEnum.datasetParams &&
      value &&
      typeof value === 'object' &&
      !Array.isArray(value)
    ) {
      const datasetParams = value as Record<string, unknown>;
      value = {
        ...datasetParams,
        collectionFilterMatch: formatCollectionFilterMatchParam({
          value: datasetParams.collectionFilterMatch,
          resolveReference: (refValue) =>
            getReferenceVariableValue({
              value: refValue as ReferenceValueType,
              nodesMap: runtimeNodesMap,
              variables: getRuntimeVariables(),
              isReferenceVal: true
            })
        })
      };
    }

    if (input.key === NodeInputKeyEnum.collectionFilterMatch) {
      const formatted = formatCollectionFilterMatchParam({
        value,
        resolveReference: (refValue) =>
          getReferenceVariableValue({
            value: refValue as ReferenceValueType,
            nodesMap: runtimeNodesMap,
            variables: getRuntimeVariables(),
            isReferenceVal: true
          })
      });
      if (input.canEdit && dynamicInput && params[dynamicInput.key]) {
        params[dynamicInput.key][input.key] = formatted;
      }
      params[input.key] = formatted;
      return;
    }

    // Dynamic input is stored in the dynamic key
    if (input.canEdit && dynamicInput && params[dynamicInput.key]) {
      params[dynamicInput.key][input.key] = valueTypeFormat(value, input.valueType, isSecretInput);
    }
    params[input.key] = valueTypeFormat(value, input.valueType, isSecretInput);
  });

  return params;
};

/**
 * 从节点调度参数中提取内容审查运行时上下文 (ModerationRuntimeContext)
 *
 * 统一收敛各节点调度器对 teamId、tmbId、appId、chatId、nodeId 等元数据的重复拼装
 */
export const getDispatchModerationContext = (props: {
  runningUserInfo?: { teamId?: string; tmbId?: string };
  runningAppInfo?: { sourceId?: string };
  chatId?: string;
  responseChatItemId?: string;
  node?: { nodeId?: string; name?: string };
}): ModerationRuntimeContext => ({
  teamId: props.runningUserInfo?.teamId,
  tmbId: props.runningUserInfo?.tmbId,
  appId: props.runningAppInfo?.sourceId,
  chatId: props.chatId,
  responseChatItemId: props.responseChatItemId,
  nodeId: props.node?.nodeId,
  nodeName: props.node?.name
});
