import type { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { NodeOutputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { DispatchNodeResponseKeyEnum } from '@fastgpt/global/core/workflow/runtime/constants';
import {
  type RuntimeNodeItemType,
  type DispatchNodeResultType
} from '@fastgpt/global/core/workflow/runtime/type';
import {
  IfElseResultEnum,
  VariableConditionEnum
} from '@fastgpt/global/core/workflow/template/system/ifElse/constant';
import {
  type ConditionListItemType,
  type IfElseConditionType,
  type IfElseListItemType
} from '@fastgpt/global/core/workflow/template/system/ifElse/type';
import { type ModuleDispatchProps } from '@fastgpt/global/core/workflow/runtime/type';
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
  const operations: Record<VariableConditionEnum, () => boolean> = {
    [VariableConditionEnum.isEmpty]: () => isEmpty(inputValue),
    [VariableConditionEnum.isNotEmpty]: () => !isEmpty(inputValue),

    [VariableConditionEnum.equalTo]: () => String(inputValue).trim() === value.trim(),
    [VariableConditionEnum.notEqual]: () => String(inputValue).trim() !== value.trim(),

    // number
    [VariableConditionEnum.greaterThan]: () => Number(inputValue) > Number(value),
    [VariableConditionEnum.lessThan]: () => Number(inputValue) < Number(value),
    [VariableConditionEnum.greaterThanOrEqualTo]: () => Number(inputValue) >= Number(value),
    [VariableConditionEnum.lessThanOrEqualTo]: () => Number(inputValue) <= Number(value),

    // array or string
    [VariableConditionEnum.include]: () => isInclude(inputValue, value),
    [VariableConditionEnum.notInclude]: () => !isInclude(inputValue, value),

    // string
    [VariableConditionEnum.startWith]: () => inputValue?.trim()?.startsWith(value),
    [VariableConditionEnum.endWith]: () => inputValue?.trim()?.endsWith(value),
    [VariableConditionEnum.reg]: () => {
      if (typeof inputValue !== 'string' || !value) return false;
      if (value.startsWith('/')) {
        value = value.slice(1);
      }
      if (value.endsWith('/')) {
        value = value.slice(0, -1);
      }

      const reg = new RegExp(value, 'g');
      const result = reg.test(inputValue.trim());

      return result;
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
  variables: Record<string, any>,
  runtimeNodes: RuntimeNodeItemType[]
) {
  const listResult = list.map((item) => {
    const { variable, condition: variableCondition, value, valueType } = item;
    if (!variableCondition) return;

    const conditionLeftValue = getReferenceVariableValue({
      value: variable,
      variables,
      nodes: runtimeNodes
    });

    const conditionRightValue =
      valueType === 'reference'
        ? getReferenceVariableValue({
            value: value as ReferenceItemValueType,
            variables,
            nodes: runtimeNodes
          })
        : value;

    return checkCondition(variableCondition, conditionLeftValue, conditionRightValue);
  });

  return condition === 'AND' ? listResult.every(Boolean) : listResult.some(Boolean);
}

export const dispatchIfElse = async (props: Props): Promise<Response> => {
  const {
    params,
    runtimeNodes,
    variables,
    node: { nodeId }
  } = props;
  const { ifElseList } = params;

  let res = IfElseResultEnum.ELSE as string;
  for (let i = 0; i < ifElseList.length; i++) {
    const item = ifElseList[i];
    const result = getResult(item.condition, item.list, variables, runtimeNodes);
    if (result) {
      res = getElseIFLabel(i);
      break;
    }
  }

  const resArray = Array.from({ length: ifElseList.length + 1 }, (_, index) => {
    const label = index < ifElseList.length ? getElseIFLabel(index) : IfElseResultEnum.ELSE;
    return getHandleId(nodeId, 'source', label);
  });

  return {
    [NodeOutputKeyEnum.ifElseResult]: res,
    [DispatchNodeResponseKeyEnum.nodeResponse]: {
      totalPoints: 0,
      ifElseResult: res
    },
    [DispatchNodeResponseKeyEnum.skipHandleId]: resArray.filter(
      (item) => item !== getHandleId(nodeId, 'source', res)
    )
  };
};
