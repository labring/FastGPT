import { NodeInputKeyEnum, NodeOutputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { DispatchNodeResponseKeyEnum } from '@fastgpt/global/core/workflow/runtime/constants';
import { DispatchNodeResultType } from '@fastgpt/global/core/workflow/runtime/type';
import { VariableConditionEnum } from '@fastgpt/global/core/workflow/template/system/ifElse/constant';
import {
  ConditionListItemType,
  IfElseConditionType,
  IfElseListItemType
} from '@fastgpt/global/core/workflow/template/system/ifElse/type';
import { ModuleDispatchProps } from '@fastgpt/global/core/workflow/type';
import { getHandleId } from '@fastgpt/global/core/workflow/utils';
import { getReferenceVariableValue } from '@fastgpt/global/core/workflow/runtime/utils';

type Props = ModuleDispatchProps<{
  [NodeInputKeyEnum.condition]: IfElseConditionType;
  [NodeInputKeyEnum.ifElseList]: IfElseListItemType[];
}>;
type Response = DispatchNodeResultType<{
  [NodeOutputKeyEnum.ifElseResult]: string;
}>;

function checkCondition(condition: VariableConditionEnum, variableValue: any, value: string) {
  const operations = {
    [VariableConditionEnum.isEmpty]: () => !variableValue,
    [VariableConditionEnum.isNotEmpty]: () => !!variableValue,
    [VariableConditionEnum.equalTo]: () => variableValue === value,
    [VariableConditionEnum.notEqual]: () => variableValue !== value,
    [VariableConditionEnum.greaterThan]: () => Number(variableValue) > Number(value),
    [VariableConditionEnum.lessThan]: () => Number(variableValue) < Number(value),
    [VariableConditionEnum.greaterThanOrEqualTo]: () => Number(variableValue) >= Number(value),
    [VariableConditionEnum.lessThanOrEqualTo]: () => Number(variableValue) <= Number(value),
    [VariableConditionEnum.include]: () => variableValue?.includes(value),
    [VariableConditionEnum.notInclude]: () => !variableValue?.includes(value),
    [VariableConditionEnum.startWith]: () => variableValue?.startsWith(value),
    [VariableConditionEnum.endWith]: () => variableValue?.endsWith(value),
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

  let res = 'ELSE';
  for (let i = 0; i < ifElseList.length; i++) {
    const item = ifElseList[i];
    const result = getResult(item.condition, item.list, variables, runtimeNodes);
    if (result) {
      res = `IF${i}`;
      break;
    }
  }

  const resArray = Array.from({ length: ifElseList.length + 1 }, (_, index) => {
    const label = index < ifElseList.length ? `IF${index}` : 'ELSE';
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
