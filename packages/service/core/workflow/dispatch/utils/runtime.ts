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
  LEGACY_DATASET_PARAMS_MODEL_KEY_MAP,
  LEGACY_MODEL_INPUT_KEY_MAP,
  nodeInputIsReference
} from '@fastgpt/global/core/workflow/utils';
import { replaceEditorVariable } from './replaceEditorVariable';

/** 双 key 补 canonical：legacy-only 输入把 legacy 值回填到 canonical 字段（canonical 已存在时以 canonical 为准）。 */
const fillCanonicalFromLegacy = (
  params: Record<string, any>,
  legacyKey: string,
  canonicalKey: string
) => {
  const legacyValue = params[legacyKey];
  if (legacyValue === undefined || legacyValue === null || legacyValue === '') return;
  if (
    params[canonicalKey] === undefined ||
    params[canonicalKey] === null ||
    params[canonicalKey] === ''
  ) {
    params[canonicalKey] = legacyValue;
  }
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

    // Dynamic input is stored in the dynamic key
    if (input.canEdit && dynamicInput && params[dynamicInput.key]) {
      params[dynamicInput.key][input.key] = valueTypeFormat(value, input.valueType);
    }
    params[input.key] = valueTypeFormat(value, input.valueType);
  });

  // ⚠️ 热升级兼容：参数双字段输出（§6.4 item 2）。节点业务代码继续读 canonical
  // 字段（getter 兼容 name/id）；legacy 字段保留供模型名展示路径读取。
  // 双 key 并存时以有效 canonical 为准（迁移窗口写冻结，不会发生新旧实例漂移）。
  for (const [legacyKey, canonicalKey] of Object.entries(LEGACY_MODEL_INPUT_KEY_MAP)) {
    fillCanonicalFromLegacy(params, legacyKey, canonicalKey);
  }

  // datasetParams 内嵌模型字段双 key（§6.4 item 6）
  const datasetParams = params[NodeInputKeyEnum.datasetParams];
  if (datasetParams && typeof datasetParams === 'object' && !Array.isArray(datasetParams)) {
    for (const [legacyKey, canonicalKey] of Object.entries(LEGACY_DATASET_PARAMS_MODEL_KEY_MAP)) {
      fillCanonicalFromLegacy(datasetParams, legacyKey, canonicalKey);
    }
  }

  return params;
};
