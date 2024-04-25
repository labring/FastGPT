import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { DispatchNodeResponseKeyEnum } from '@fastgpt/global/core/workflow/runtime/constants';
import { DispatchNodeResultType } from '@fastgpt/global/core/workflow/runtime/type';
import { VariableConditionEnum } from '@fastgpt/global/core/workflow/template/system/ifElse/constant';
import {
  IfElseConditionType,
  IfElseListItemType
} from '@fastgpt/global/core/workflow/template/system/ifElse/type';
import { ModuleDispatchProps } from '@fastgpt/global/core/workflow/type';
import { getHandleId } from '@fastgpt/global/core/workflow/utils';

type Props = ModuleDispatchProps<{
  [NodeInputKeyEnum.condition]: IfElseConditionType;
  [NodeInputKeyEnum.ifElseList]: IfElseListItemType[];
}>;

function checkCondition(condition: VariableConditionEnum, variableValue: any, value: string) {
  const operations = {
    [VariableConditionEnum.isEmpty]: () => !variableValue,
    [VariableConditionEnum.isNotEmpty]: () => !!variableValue,
    [VariableConditionEnum.equalTo]: () => variableValue === value,
    [VariableConditionEnum.notEqual]: () => variableValue !== value,
    [VariableConditionEnum.greaterThan]: () => variableValue > Number(value),
    [VariableConditionEnum.lessThan]: () => variableValue < Number(value),
    [VariableConditionEnum.greaterThanOrEqualTo]: () => variableValue >= Number(value),
    [VariableConditionEnum.lessThanOrEqualTo]: () => variableValue <= Number(value),
    [VariableConditionEnum.include]: () => variableValue.includes(value),
    [VariableConditionEnum.notInclude]: () => !variableValue.includes(value),
    [VariableConditionEnum.startWith]: () => variableValue.startsWith(value),
    [VariableConditionEnum.endWith]: () => variableValue.endsWith(value),
    [VariableConditionEnum.lengthEqualTo]: () => variableValue.length === Number(value),
    [VariableConditionEnum.lengthNotEqualTo]: () => variableValue.length !== Number(value),
    [VariableConditionEnum.lengthGreaterThan]: () => variableValue.length > Number(value),
    [VariableConditionEnum.lengthGreaterThanOrEqualTo]: () => variableValue.length >= Number(value),
    [VariableConditionEnum.lengthLessThan]: () => variableValue.length < Number(value),
    [VariableConditionEnum.lengthLessThanOrEqualTo]: () => variableValue.length <= Number(value)
  };

  return (operations[condition] || (() => false))();
}

export const dispatchIfElse = async (props: Props): Promise<DispatchNodeResultType<{}>> => {
  const {
    params,
    runtimeNodes,
    node: { nodeId }
  } = props;
  const { condition, ifElseList } = params;
  const listResult = ifElseList.map((item) => {
    const { variable, condition: variableCondition, value } = item;

    const variableValue = runtimeNodes
      .find((node) => node.nodeId === variable[0])
      ?.outputs?.find((item) => item.id === variable[1])?.value;

    return checkCondition(variableCondition as VariableConditionEnum, variableValue, value || '');
  });

  const result = condition === 'AND' ? listResult.every(Boolean) : listResult.some(Boolean);

  return {
    [DispatchNodeResponseKeyEnum.nodeResponse]: {
      totalPoints: 0,
      ifElseResult: result ? 'IF' : 'ELSE'
    },
    [DispatchNodeResponseKeyEnum.skipHandleId]: result
      ? [getHandleId(nodeId, 'source', 'ELSE')]
      : [getHandleId(nodeId, 'source', 'IF')]
  };
};
