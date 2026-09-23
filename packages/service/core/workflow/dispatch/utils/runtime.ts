import { NodeInputKeyEnum, WorkflowIOValueTypeEnum } from '@fastgpt/global/core/workflow/constants';
import {
  FlowNodeInputTypeEnum,
  FlowNodeTypeEnum
} from '@fastgpt/global/core/workflow/node/constant';
import type { RuntimeNodeItemType } from '@fastgpt/global/core/workflow/runtime/type';
import type { ReferenceValueType } from '@fastgpt/global/core/workflow/type/io';
import type { WorkflowVariableStateLike } from '../../types/runtime';
import {
  getReferenceVariableValue,
  valueTypeFormat
} from '@fastgpt/global/core/workflow/runtime/utils';
import {
  getSelectedInputRenderType,
  nodeInputIsReference
} from '@fastgpt/global/core/workflow/utils';
import { formatCollectionFilterMatchParam } from '@fastgpt/global/core/dataset/workflowTagFilter';
import { replaceEditorVariable } from './replaceEditorVariable';
import { replaceJsonBodyString } from './replaceJsonBodyString';

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

  // JSON Editor / object / array 入参是 JSON 文本，变量替换必须按 JSON 转义。
  // 普通文本替换遇到引号、换行、反斜杠会弄坏 JSON，valueTypeFormat 随后把对象解析成 {}。
  const isJsonRuntimeInput = (input: (typeof node.inputs)[number]) => {
    if (getSelectedInputRenderType(input) === FlowNodeInputTypeEnum.JSONEditor) return true;
    const valueType = input.valueType;
    return (
      valueType === WorkflowIOValueTypeEnum.object ||
      valueType === WorkflowIOValueTypeEnum.chatHistory ||
      valueType === WorkflowIOValueTypeEnum.datasetQuote ||
      valueType === WorkflowIOValueTypeEnum.dynamic ||
      valueType === WorkflowIOValueTypeEnum.selectDataset ||
      valueType === WorkflowIOValueTypeEnum.selectApp ||
      (!!valueType && valueType.startsWith('array'))
    );
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
      value = getReferenceVariableValue({
        value,
        nodesMap: runtimeNodesMap,
        variables: getRuntimeVariables(),
        isReferenceVal: true
      });
    } else {
      if (needsTextReplace) {
        value = isJsonRuntimeInput(input)
          ? replaceJsonBodyString(
              { text: value },
              {
                allVariables: getRuntimeVariables(),
                runtimeNodesMap
              }
            )
          : replaceEditorVariable({
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
      params[dynamicInput.key][input.key] = valueTypeFormat(value, input.valueType);
    }
    params[input.key] = valueTypeFormat(value, input.valueType);
  });

  return params;
};
