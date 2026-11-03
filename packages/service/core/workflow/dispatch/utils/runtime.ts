import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
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
} from '@fastgpt/global/common/workflow/reference';
import { getSecretReferenceValue } from '@fastgpt/global/common/secret/utils';
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
  variableState
}: {
  node: RuntimeNodeItemType;
  runtimeNodesMap: Map<string, RuntimeNodeItemType>;
  variableState: WorkflowVariableStateLike;
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
