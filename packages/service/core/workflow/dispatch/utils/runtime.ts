import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
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

    // Code 节点作为工具时，Agent 生成的参数在执行前注入 inputs，不会出现在 outputs；
    // 这里允许同节点其他输入引用自身工具参数，跨节点引用仍只解析 outputs。
    if (
      value === undefined &&
      node.flowNodeType === FlowNodeTypeEnum.code &&
      isValidReferenceValueFormat(rawValue) &&
      rawValue[0] === node.nodeId
    ) {
      value = node.inputs.find(
        (item) =>
          item.key === rawValue[1] && item.canEdit === true && item.defaultToAgentGenerated === true
      )?.value;
    }

    // Dynamic input is stored in the dynamic key
    if (input.canEdit && dynamicInput && params[dynamicInput.key]) {
      params[dynamicInput.key][input.key] = valueTypeFormat(value, input.valueType);
    }
    params[input.key] = valueTypeFormat(value, input.valueType);
  });

  return params;
};
