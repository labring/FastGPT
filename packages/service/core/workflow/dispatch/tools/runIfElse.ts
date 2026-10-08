import type { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { NodeOutputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { DispatchNodeResponseKeyEnum } from '@fastgpt/global/core/workflow/runtime/constants';
import type { RuntimeNodeItemType } from '@fastgpt/global/core/workflow/runtime/type';
import {
  IfElseResultEnum,
  VariableConditionEnum
} from '@fastgpt/global/core/workflow/template/system/ifElse/constant';
import {
  type ConditionListItemType,
  type IfElseConditionType,
  type IfElseListItemType
} from '@fastgpt/global/core/workflow/template/system/ifElse/type';
import { getIfElseBranchHandleKey } from '@fastgpt/global/core/workflow/template/system/ifElse/utils';
import type {
  DispatchNodeResultType,
  ModuleDispatchProps,
  WorkflowVariableStateLike
} from '../../types/runtime';
import { getElseIFLabel, getHandleId } from '@fastgpt/global/core/workflow/utils';
import { getReferenceVariableValue } from '@fastgpt/global/core/workflow/runtime/utils';
import { type ReferenceItemValueType } from '@fastgpt/global/core/workflow/type/io';

type Props = ModuleDispatchProps<{
  [NodeInputKeyEnum.condition]: IfElseConditionType;
  [NodeInputKeyEnum.ifElseList]: IfElseListItemType[];
}>;
type Response = DispatchNodeResultType<{
  [NodeOutputKeyEnum.ifElseResult]: string;
}>;

function isEmpty(value: any) {
  return (
    // 检查未定义或null值
    value === undefined ||
    value === null ||
    // 检查空字符串
    (typeof value === 'string' && value.trim() === '') ||
    // 检查NaN
    (typeof value === 'number' && isNaN(value)) ||
    // 检查空数组
    (Array.isArray(value) && value.length === 0) ||
    // 检查空对象
    (typeof value === 'object' && Object.keys(value).length === 0)
  );
}

function isInclude(value: any, target: any) {
  if (Array.isArray(value)) {
    return value.map((item: any) => String(item)).includes(target);
  } else if (typeof value === 'string') {
    return value.includes(target);
  } else {
    return false;
  }
}

function checkCondition(condition: VariableConditionEnum, inputValue: any, value: any) {
  // any 类型的变量也提供「开始为/结束为」，运行时可能拿到数字、布尔等非字符串值；
  // 与 equalTo 一样先转成字符串，直接调用 trim 会抛 TypeError 导致整个判断器报错。
  // null/undefined 仍视为不匹配。
  const getInputText = () =>
    inputValue === undefined || inputValue === null ? undefined : String(inputValue).trim();

  const operations: Record<VariableConditionEnum, () => boolean> = {
    [VariableConditionEnum.isEmpty]: () => isEmpty(inputValue),
    [VariableConditionEnum.isNotEmpty]: () => !isEmpty(inputValue),

    [VariableConditionEnum.equalTo]: () => String(inputValue).trim() === String(value).trim(),
    [VariableConditionEnum.notEqual]: () => String(inputValue).trim() !== String(value).trim(),

    // number
    [VariableConditionEnum.greaterThan]: () => Number(inputValue) > Number(value),
    [VariableConditionEnum.lessThan]: () => Number(inputValue) < Number(value),
    [VariableConditionEnum.greaterThanOrEqualTo]: () => Number(inputValue) >= Number(value),
    [VariableConditionEnum.lessThanOrEqualTo]: () => Number(inputValue) <= Number(value),

    // array or string
    [VariableConditionEnum.include]: () => isInclude(inputValue, value),
    [VariableConditionEnum.notInclude]: () => !isInclude(inputValue, value),

    // string
    [VariableConditionEnum.startWith]: () => getInputText()?.startsWith(value) ?? false,
    [VariableConditionEnum.endWith]: () => getInputText()?.endsWith(value) ?? false,
    [VariableConditionEnum.reg]: () => {
      // 与「开始为/结束为」一致：any 类型变量运行时可能是数字、布尔等非字符串值，按文本匹配；
      // 右侧选择引用变量时，正则本身也可能不是字符串，直接调用 startsWith 会抛 TypeError。
      const inputText = getInputText();
      if (inputText === undefined || value === undefined || value === null || value === '') {
        return false;
      }
      let pattern = String(value);
      if (pattern.startsWith('/')) {
        pattern = pattern.slice(1);
      }
      if (pattern.endsWith('/')) {
        pattern = pattern.slice(0, -1);
      }
      // 空数组等引用值字符串化后为空模式；空模式会匹配任意输入，
      // 不能把缺失模式当成成功条件。
      if (pattern === '') {
        return false;
      }

      const reg = new RegExp(pattern, 'g');
      return reg.test(inputText);
    },

    // array
    [VariableConditionEnum.lengthEqualTo]: () => inputValue?.length === Number(value),
    [VariableConditionEnum.lengthNotEqualTo]: () => inputValue?.length !== Number(value),
    [VariableConditionEnum.lengthGreaterThan]: () => inputValue?.length > Number(value),
    [VariableConditionEnum.lengthGreaterThanOrEqualTo]: () => inputValue?.length >= Number(value),
    [VariableConditionEnum.lengthLessThan]: () => inputValue?.length < Number(value),
    [VariableConditionEnum.lengthLessThanOrEqualTo]: () => inputValue?.length <= Number(value)
  };

  return operations[condition]?.() ?? false;
}

function getResult(
  condition: IfElseConditionType,
  list: ConditionListItemType[],
  variableState: WorkflowVariableStateLike,
  runtimeNodesMap: Map<string, RuntimeNodeItemType>
) {
  const runtimeVariables = variableState.toRuntimeRecord();
  const listResult = list.map((item) => {
    const { variable, condition: variableCondition, value, valueType } = item;
    if (!variableCondition) return;

    const conditionLeftValue = getReferenceVariableValue({
      value: variable,
      variables: runtimeVariables,
      nodesMap: runtimeNodesMap
    });

    const conditionRightValue =
      valueType === 'reference'
        ? getReferenceVariableValue({
            value: value as ReferenceItemValueType,
            variables: runtimeVariables,
            nodesMap: runtimeNodesMap
          })
        : value;

    return checkCondition(variableCondition, conditionLeftValue, conditionRightValue);
  });

  return condition === 'AND' ? listResult.every(Boolean) : listResult.some(Boolean);
}

export const dispatchIfElse = async (props: Props): Promise<Response> => {
  const {
    params,
    runtimeEdges,
    runtimeNodesMap,
    variableState,
    node: { nodeId }
  } = props;
  const { ifElseList } = params;

  let selectedLabel = IfElseResultEnum.ELSE as string;
  let selectedHandleKey = IfElseResultEnum.ELSE as string;
  for (let i = 0; i < ifElseList.length; i++) {
    const item = ifElseList[i];
    const result = getResult(item.condition, item.list, variableState, runtimeNodesMap);
    if (result) {
      selectedLabel = getElseIFLabel(i);
      selectedHandleKey = getIfElseBranchHandleKey(item, i);
      break;
    }
  }

  const selectedHandleId = getHandleId(nodeId, 'source', selectedHandleKey);
  const sourceHandlePrefix = `${nodeId}-source-`;
  const sourceHandleIds = Array.from(
    new Set(
      runtimeEdges
        .filter(
          (edge) => edge.source === nodeId && edge.sourceHandle.startsWith(sourceHandlePrefix)
        )
        .map((edge) => edge.sourceHandle)
    )
  );

  return {
    data: {
      [NodeOutputKeyEnum.ifElseResult]: selectedLabel
    },
    [DispatchNodeResponseKeyEnum.nodeResponse]: {
      totalPoints: 0,
      ifElseResult: selectedLabel
    },
    [DispatchNodeResponseKeyEnum.toolResponse]: selectedLabel,
    [DispatchNodeResponseKeyEnum.skipHandleId]: sourceHandleIds.filter(
      (handleId) => handleId !== selectedHandleId
    )
  };
};
