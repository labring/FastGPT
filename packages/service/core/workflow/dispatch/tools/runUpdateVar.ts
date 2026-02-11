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
import { normalizeUpdateItem } from '@fastgpt/global/core/workflow/template/system/variableUpdate/utils';
import { FlowNodeInputTypeEnum } from '@fastgpt/global/core/workflow/node/constant';

const numOp = (fn: (cur: number, operand: number) => number) => (cur: any, operand: any) => {
  const n = Number(operand);
  return isNaN(n) ? cur : fn(Number(cur) || 0, n);
};

const operatorHandlerMap: Record<string, (cur: any, operand: any) => any> = {
  [VariableUpdateOperatorEnum.set]: (_cur, operand) => operand,
  [VariableUpdateOperatorEnum.add]: numOp((cur, n) => cur + n),
  [VariableUpdateOperatorEnum.sub]: numOp((cur, n) => cur - n),
  [VariableUpdateOperatorEnum.mul]: numOp((cur, n) => cur * n),
  [VariableUpdateOperatorEnum.div]: numOp((cur, n) => (n !== 0 ? cur / n : cur)),
  [VariableUpdateOperatorEnum.negate]: (cur) => !cur,
  [VariableUpdateOperatorEnum.push]: (cur, operand) => [
    ...(Array.isArray(cur) ? cur : []),
    operand
  ],
  [VariableUpdateOperatorEnum.clear]: () => []
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
  console.log(updateList);
  const nodeIds = runtimeNodes.map((node) => node.nodeId);

  const result = updateList.map((rawItem) => {
    const item = normalizeUpdateItem(rawItem);
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
      const operator = item.updateType ?? VariableUpdateOperatorEnum.set;
      const operand =
        item.renderType === FlowNodeInputTypeEnum.reference
          ? getReferenceVariableValue({
              value: item.referenceValue as ReferenceValueType,
              variables,
              nodes: runtimeNodes
            })
          : replaceEditorVariable({ text: item.inputValue, nodes: runtimeNodes, variables });

      const handler = operatorHandlerMap[operator];
      if (!handler) return operand ?? null;

      if (operator === VariableUpdateOperatorEnum.set) {
        return valueTypeFormat(operand, item.valueType);
      }

      const currentValue = getReferenceVariableValue({
        value: variable,
        variables,
        nodes: runtimeNodes
      });
      console.log(currentValue, item.valueType);
      const typedCurrentValue = valueTypeFormat(currentValue, item.valueType) ?? currentValue;

      const processedOperand =
        operator === VariableUpdateOperatorEnum.push &&
        typeof operand === 'string' &&
        (item.valueType === WorkflowIOValueTypeEnum.arrayObject ||
          item.valueType === WorkflowIOValueTypeEnum.arrayAny)
          ? (() => {
              try {
                return JSON.parse(operand);
              } catch {
                return operand;
              }
            })()
          : operand;

      return handler(typedCurrentValue, processedOperand);
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
