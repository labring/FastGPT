import {
  NodeInputKeyEnum,
  NodeOutputKeyEnum,
  VARIABLE_NODE_ID
} from '@fastgpt/global/core/workflow/constants';
import {
  FlowNodeInputTypeEnum,
  FlowNodeTypeEnum
} from '@fastgpt/global/core/workflow/node/constant';
import type { RuntimeNodeItemType } from '@fastgpt/global/core/workflow/runtime/type';
import type { RuntimeEdgeItemType } from '@fastgpt/global/core/workflow/type/edge';
import type { WorkflowVariableStateLike } from '../../types/runtime';
import {
  getReferenceVariableValue,
  valueTypeFormat
} from '@fastgpt/global/core/workflow/runtime/utils';
import {
  getSelectedInputRenderType,
  nodeInputIsReference
} from '@fastgpt/global/common/workflow/reference';
import { getSecretReferenceValue } from '@fastgpt/global/common/secret/utils';
import {
  filterSelectableWorkflowNodeOutputs,
  getWorkflowReferenceItems,
  getWorkflowReferenceItemsFromValue,
  isWorkflowEdgeSourceHandleValid,
  isWorkflowReferenceItem
} from '@fastgpt/global/core/workflow/editor/utils';
import { formatCollectionFilterMatchParam } from '@fastgpt/global/core/dataset/search/tagFilter';
import { replaceEditorVariable } from './replaceEditorVariable';

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
  runtimeEdges,
  runtimeEdgeIndex
}: {
  node: RuntimeNodeItemType;
  runtimeNodesMap: Map<string, RuntimeNodeItemType>;
  variableState: WorkflowVariableStateLike;
  runtimeEdges?: readonly RuntimeEdgeItemType[];
  runtimeEdgeIndex?: {
    byTarget: ReadonlyMap<string, readonly RuntimeEdgeItemType[]>;
  };
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

  const reverseEdges = runtimeEdgeIndex
    ? undefined
    : runtimeEdges
      ? runtimeEdges.reduce<Map<string, string[]>>((map, edge) => {
          if (
            edge.sourceHandle === NodeOutputKeyEnum.selectedTools ||
            edge.targetHandle === NodeOutputKeyEnum.selectedTools ||
            !isWorkflowEdgeSourceHandleValid(runtimeNodesMap.get(edge.source), edge.sourceHandle)
          ) {
            return map;
          }
          const sources = map.get(edge.target) ?? [];
          sources.push(edge.source);
          map.set(edge.target, sources);
          return map;
        }, new Map())
      : undefined;

  const containerNodeIds = [node.nodeId];
  const containerNodeIdSet = new Set(containerNodeIds);
  let parentNodeId = node.parentNodeId;
  while (parentNodeId && !containerNodeIdSet.has(parentNodeId)) {
    const parentNode = runtimeNodesMap.get(parentNodeId);
    if (!parentNode) break;
    containerNodeIds.push(parentNodeId);
    containerNodeIdSet.add(parentNodeId);
    parentNodeId = parentNode.parentNodeId;
  }

  /** 引用输入只保留可执行来源；无效项按 main 行为过滤，不升级为参数异常。 */
  const resolveReferenceInputValue = (value: unknown) => {
    const references = getWorkflowReferenceItems(value);
    const isReferenceArray = Array.isArray(value) && !isWorkflowReferenceItem(value);
    if (references.length === 0) {
      const isPlainArray =
        Array.isArray(value) &&
        !value.some(Array.isArray) &&
        !(value.length === 2 && value.every((item) => typeof item === 'string'));
      return isPlainArray ? value : undefined;
    }
    const variables = getRuntimeVariables();
    const isReachableSource = (sourceNodeId: string) => {
      const byTarget = runtimeEdgeIndex?.byTarget;
      if (!reverseEdges && !byTarget) return true;
      // 编辑器把祖先容器作为遍历起点，但容器自身不因此成为子节点的可引用来源。
      if (sourceNodeId === node.nodeId) return true;
      const pending = [...containerNodeIds];
      const visited = new Set<string>();
      while (pending.length > 0) {
        const targetNodeId = pending.pop()!;
        if (visited.has(targetNodeId)) continue;
        visited.add(targetNodeId);

        if (targetNodeId !== node.nodeId && containerNodeIdSet.has(targetNodeId)) {
          const container = runtimeNodesMap.get(targetNodeId);
          for (const input of container?.inputs ?? []) {
            if (!nodeInputIsReference(input) || input.key === NodeInputKeyEnum.childrenNodeIdList) {
              continue;
            }
            const references = getWorkflowReferenceItemsFromValue(
              input.value ?? input.defaultValue
            );
            for (const [referenceSourceId] of references) {
              if (
                referenceSourceId === VARIABLE_NODE_ID ||
                !runtimeNodesMap.has(referenceSourceId)
              ) {
                continue;
              }
              if (referenceSourceId === sourceNodeId) return true;
              pending.push(referenceSourceId);
            }
          }
        }

        const upstreamNodeIds = byTarget
          ? (byTarget.get(targetNodeId) ?? []).map((edge) => edge.source)
          : (reverseEdges?.get(targetNodeId) ?? []);
        if (upstreamNodeIds.includes(sourceNodeId)) return true;
        pending.push(...upstreamNodeIds);
      }
      return false;
    };

    const validReferences = references.filter(([sourceNodeId, outputId]) => {
      if (!outputId) return false;
      if (sourceNodeId === VARIABLE_NODE_ID) {
        return Object.prototype.hasOwnProperty.call(variables, outputId);
      }
      const sourceNode = runtimeNodesMap.get(sourceNodeId);
      // Agent 生成参数引用节点 input；它不是可执行 output，但仍需保留旧的 undefined 语义。
      const isAgentGeneratedInput =
        sourceNode?.inputs.some(
          (input) => input.key === outputId && input.defaultToAgentGenerated === true
        ) === true;
      if (isAgentGeneratedInput) return true;
      const output = sourceNode?.outputs.find((item) => item.id === outputId);
      if (!sourceNode || !output) return false;
      if (
        filterSelectableWorkflowNodeOutputs({
          outputs: [output],
          catchError: sourceNode.catchError
        }).length === 0
      ) {
        return false;
      }
      return isReachableSource(sourceNodeId);
    });
    if (validReferences.length === 0) return undefined;

    return getReferenceVariableValue({
      value: (isReferenceArray ? validReferences : validReferences[0]) as Parameters<
        typeof getReferenceVariableValue
      >[0]['value'],
      nodesMap: runtimeNodesMap,
      variables
    });
  };

  node.inputs.forEach((input) => {
    // Special input, not format
    if (input.key === dynamicInput?.key) return;

    // 用户选择节点自行展开动态选项，其他节点的同名自定义参数仍需正常解析和聚合。
    if (
      [NodeInputKeyEnum.childrenNodeIdList, NodeInputKeyEnum.httpJsonBody].includes(
        input.key as NodeInputKeyEnum
      ) ||
      (node.flowNodeType === FlowNodeTypeEnum.userSelect &&
        input.key === NodeInputKeyEnum.userSelectOptions)
    ) {
      params[input.key] = input.value;
      return;
    }

    const rawValue = input.value;
    const isReferenceInput = nodeInputIsReference(input);
    const isSecretInput = getSelectedInputRenderType(input) === FlowNodeInputTypeEnum.password;
    const needsTextReplace = typeof rawValue === 'string' && rawValue.includes('{{');
    let value = rawValue;

    if (isSecretInput) {
      value = resolveSecretInputReference(value);
    }

    if (isReferenceInput && !needsTextReplace) {
      value = resolveReferenceInputValue(value);
    } else {
      if (needsTextReplace) {
        value = replaceEditorVariable({
          text: value,
          nodesMap: runtimeNodesMap,
          variables: getRuntimeVariables()
        });
      }

      if (isReferenceInput) {
        value = resolveReferenceInputValue(value);
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
          resolveReference: (refValue) => resolveReferenceInputValue(refValue)
        })
      };
    }

    if (input.key === NodeInputKeyEnum.collectionFilterMatch) {
      const formatted = formatCollectionFilterMatchParam({
        value,
        resolveReference: (refValue) => resolveReferenceInputValue(refValue)
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
