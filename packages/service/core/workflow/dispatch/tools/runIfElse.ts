import { NodeInputKeyEnum, NodeOutputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { DispatchNodeResponseKeyEnum } from '@fastgpt/global/core/workflow/runtime/constants';
import { DispatchNodeResultType } from '@fastgpt/global/core/workflow/runtime/type';
import {
  IfElseResultEnum,
  VariableConditionEnum
} from '@fastgpt/global/core/workflow/template/system/ifElse/constant';
import {
  ConditionListItemType,
  IfElseConditionType,
  IfElseListItemType
} from '@fastgpt/global/core/workflow/template/system/ifElse/type';
import { ModuleDispatchProps } from '@fastgpt/global/core/workflow/type';
import { getElseIFLabel, getHandleId } from '@fastgpt/global/core/workflow/utils';
import { getReferenceVariableValue } from '@fastgpt/global/core/workflow/runtime/utils';

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

function checkCondition(condition: VariableConditionEnum, variableValue: any, value: string) {
  const operations = {
    [VariableConditionEnum.isEmpty]: () => isEmpty(variableValue),
    [VariableConditionEnum.isNotEmpty]: () => !isEmpty(variableValue),

    [VariableConditionEnum.equalTo]: () => String(variableValue) === value,
    [VariableConditionEnum.notEqual]: () => String(variableValue) !== value,

    // number
    [VariableConditionEnum.greaterThan]: () => Number(variableValue) > Number(value),
    [VariableConditionEnum.lessThan]: () => Number(variableValue) < Number(value),
    [VariableConditionEnum.greaterThanOrEqualTo]: () => Number(variableValue) >= Number(value),
    [VariableConditionEnum.lessThanOrEqualTo]: () => Number(variableValue) <= Number(value),

    // array or string
    [VariableConditionEnum.include]: () => isInclude(variableValue, value),
    [VariableConditionEnum.notInclude]: () => !isInclude(variableValue, value),

    // string
    [VariableConditionEnum.startWith]: () => variableValue?.startsWith(value),
    [VariableConditionEnum.endWith]: () => variableValue?.endsWith(value),

    // array
    [VariableConditionEnum.lengthEqualTo]: () => variableValue?.length === Number(value),
    [VariableConditionEnum.lengthNotEqualTo]: () => variableValue?.length !== Number(value),
    [VariableConditionEnum.lengthGreaterThan]: () => variableValue?.length > Number(value),
    [VariableConditionEnum.lengthGreaterThanOrEqualTo]: () =>
      variableValue?.length >= Number(value),
    [VariableConditionEnum.lengthLessThan]: () => variableValue?.length < Number(value),
    [VariableConditionEnum.lengthLessThanOrEqualTo]: () => variableValue?.length <= Number(value)
  };

  return (operations[condition] || (() => false))();
}

function getResult(
  condition: IfElseConditionType,
  list: ConditionListItemType[],
  variables: any,
  runtimeNodes: any[]
) {
  const listResult = list.map((item) => {
    const { variable, condition: variableCondition, value } = item;

    const variableValue = getReferenceVariableValue({
      value: variable,
      variables,
      nodes: runtimeNodes
    });

    return checkCondition(variableCondition as VariableConditionEnum, variableValue, value || '');
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
