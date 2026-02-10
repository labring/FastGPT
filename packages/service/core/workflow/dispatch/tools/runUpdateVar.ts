import type { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { VARIABLE_NODE_ID, WorkflowIOValueTypeEnum } from '@fastgpt/global/core/workflow/constants';
import {
  DispatchNodeResponseKeyEnum,
  SseResponseEventEnum
} from '@fastgpt/global/core/workflow/runtime/constants';
import { type DispatchNodeResultType } from '@fastgpt/global/core/workflow/runtime/type';
import {
  getReferenceVariableValue,
  replaceEditorVariable
} from '@fastgpt/global/core/workflow/runtime/utils';
import { type TUpdateListItem } from '@fastgpt/global/core/workflow/template/system/variableUpdate/type';
import type { ReferenceValueType } from '@fastgpt/global/core/workflow/type/io';
import { type ModuleDispatchProps } from '@fastgpt/global/core/workflow/runtime/type';
import { runtimeSystemVar2StoreType } from '../utils';
import { isValidReferenceValue } from '@fastgpt/global/core/workflow/utils';
import { valueTypeFormat } from '@fastgpt/global/core/workflow/runtime/utils';
import { VariableUpdateOperatorEnum } from '@fastgpt/global/core/workflow/template/system/variableUpdate/constants';
import type { TOperationValue } from '@fastgpt/global/core/workflow/template/system/variableUpdate/type';

const operatorHandlerMap: Record<string, (cur: any, operand: any) => any> = {
  [VariableUpdateOperatorEnum.set]: (_cur, operand) => operand,
  [VariableUpdateOperatorEnum.add]: (cur, operand) => (Number(cur) || 0) + operand,
  [VariableUpdateOperatorEnum.sub]: (cur, operand) => (Number(cur) || 0) - operand,
  [VariableUpdateOperatorEnum.mul]: (cur, operand) => (Number(cur) || 0) * operand,
  [VariableUpdateOperatorEnum.div]: (cur, operand) =>
    operand !== 0 ? (Number(cur) || 0) / operand : Number(cur) || 0,
  [VariableUpdateOperatorEnum.negate]: (cur) => !cur
};

type Props = ModuleDispatchProps<{
  [NodeInputKeyEnum.updateList]: TUpdateListItem[];
}>;
type Response = DispatchNodeResultType<{}>;

export const dispatchUpdateVariable = async (props: Props): Promise<Response> => {
  const {
    chatConfig,
    params,
    variables,
    runtimeNodes,
    workflowStreamResponse,
    externalProvider,
    runningAppInfo
  } = props;

  const { updateList } = params;
  const nodeIds = runtimeNodes.map((node) => node.nodeId);

  const result = updateList.map((item) => {
    const variable = item.variable;

    if (!isValidReferenceValue(variable, nodeIds)) {
      return null;
    }

    const varNodeId = variable[0];
    const varKey = variable[1];

    if (!varKey) {
      return null;
    }

    const value = (() => {
      if (item.value?.[0]) {
        return getReferenceVariableValue({
          value: item.value as ReferenceValueType,
          variables,
          nodes: runtimeNodes
        });
      }

      const rawVal = item.value?.[1];

      if (typeof rawVal === 'object' && rawVal !== null && 'operator' in rawVal) {
        const { operator, value: operand } = rawVal as TOperationValue;
        const handler = operatorHandlerMap[operator];
        if (!handler) return operand ?? null;

        const currentValue = getReferenceVariableValue({
          value: variable,
          variables,
          nodes: runtimeNodes
        });

        if (operator === VariableUpdateOperatorEnum.set) {
          if (item.valueType === WorkflowIOValueTypeEnum.number) {
            if (operand === '' || operand === undefined || operand === null) return null;
            return Number(operand);
          }
          return valueTypeFormat(operand, item.valueType);
        }

        const numOperand = Number(operand);
        if (operator !== VariableUpdateOperatorEnum.negate && isNaN(numOperand)) {
          return currentValue;
        }

        const typedCurrentValue = valueTypeFormat(currentValue, item.valueType) ?? currentValue;
        return handler(typedCurrentValue, numOperand);
      }

      const val =
        typeof rawVal === 'string'
          ? replaceEditorVariable({ text: rawVal, nodes: runtimeNodes, variables })
          : rawVal;

      return valueTypeFormat(val, item.valueType);
    })();

    if (varNodeId === VARIABLE_NODE_ID) {
      variables[varKey] = value;
    } else {
      runtimeNodes
        .find((node) => node.nodeId === varNodeId)
        ?.outputs?.find((output) => {
          if (output.id === varKey) {
            output.value = value;
            return true;
          }
        });
    }

    return value;
  });

  if (!runningAppInfo.isChildApp) {
    workflowStreamResponse?.({
      event: SseResponseEventEnum.updateVariables,
      data: runtimeSystemVar2StoreType({
        variables,
        removeObj: externalProvider.externalWorkflowVariables,
        userVariablesConfigs: chatConfig?.variables
      })
    });
  }

  return {
    [DispatchNodeResponseKeyEnum.newVariables]: variables,
    [DispatchNodeResponseKeyEnum.nodeResponse]: {
      updateVarResult: result
    }
  };
};
