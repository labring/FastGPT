import { NodeInputKeyEnum, VARIABLE_NODE_ID } from '@fastgpt/global/core/workflow/constants';
import {
  FlowNodeInputTypeEnum,
  FlowNodeTypeEnum
} from '@fastgpt/global/core/workflow/node/constant';
import type { RuntimeNodeItemType } from '@fastgpt/global/core/workflow/runtime/type';
import type { WorkflowVariableStateLike } from '../../types/runtime';
import {
  getReferenceVariableValue,
  valueTypeFormat
} from '@fastgpt/global/core/workflow/runtime/utils';
import {
  isValidReferenceValueFormat,
  nodeInputIsReference
} from '@fastgpt/global/core/workflow/utils';
import { formatCollectionFilterMatchParam } from '@fastgpt/global/core/dataset/workflowTagFilter';
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
  variableState
}: {
  node: RuntimeNodeItemType;
  runtimeNodesMap: Map<string, RuntimeNodeItemType>;
  variableState: WorkflowVariableStateLike;
}) => {
  if (node.flowNodeType === FlowNodeTypeEnum.pluginInput) {
    // Format plugin input to object
    return node.inputs.reduce<Record<string, any>>((acc, item) => {
      // 内部变量不从工具参数进入，缺少 runtime value 时使用节点声明的默认值。
      acc[item.key] = valueTypeFormat(item.value ?? item.defaultValue, item.valueType);
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

  let runtimeVariables: Record<string, unknown> | undefined;
  const getRuntimeVariables = () => {
    runtimeVariables ??= variableState.toRuntimeRecord();
    return runtimeVariables;
  };

  /** 引用输入在执行前必须至少命中一个现存来源；部分失效由解析器裁剪，全部失效直接拒绝执行。 */
  const resolveReferenceInputValue = (value: unknown) => {
    const isExecutableReference = (item: unknown): item is [string, string] =>
      isValidReferenceValueFormat(item) &&
      item[0].length > 0 &&
      typeof item[1] === 'string' &&
      item[1].length > 0;
    const references = isExecutableReference(value)
      ? [value]
      : Array.isArray(value) && value.length > 0 && value.every(isExecutableReference)
        ? (value as [string, string][])
        : [];
    const variables = getRuntimeVariables();
    const hasLiveSource = references.some(([sourceNodeId, outputId]) => {
      if (sourceNodeId === VARIABLE_NODE_ID) {
        return Object.prototype.hasOwnProperty.call(variables, outputId);
      }
      const sourceNode = runtimeNodesMap.get(sourceNodeId);
      // Agent 生成参数引用节点 input；它不是可执行 output，但仍需保留旧的 undefined 语义。
      return (
        sourceNode?.outputs.some((output) => output.id === outputId) === true ||
        sourceNode?.inputs.some(
          (input) => input.key === outputId && input.defaultToAgentGenerated === true
        ) === true
      );
    });
    if (references.length > 0 && !hasLiveSource) {
      throw new Error('Workflow reference source is unavailable');
    }

    return getReferenceVariableValue({
      value: value as Parameters<typeof getReferenceVariableValue>[0]['value'],
      nodesMap: runtimeNodesMap,
      variables,
      isReferenceVal: true
    });
  };

  node.inputs.forEach((input) => {
    // Special input, not format
    if (input.key === dynamicInput?.key) return;

    // Skip some special key
    if (
      [NodeInputKeyEnum.childrenNodeIdList, NodeInputKeyEnum.httpJsonBody].includes(
        input.key as NodeInputKeyEnum
      )
    ) {
      params[input.key] = input.value;
      return;
    }

    const rawValue = input.value;
    const isReferenceInput = nodeInputIsReference(input);
    const needsTextReplace = typeof rawValue === 'string' && rawValue.includes('{{');
    let value = rawValue;

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
      params[dynamicInput.key][input.key] = valueTypeFormat(value, input.valueType);
    }
    params[input.key] = valueTypeFormat(value, input.valueType);
  });

  return params;
};
