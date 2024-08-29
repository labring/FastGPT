import { NodeInputKeyEnum, VARIABLE_NODE_ID } from '@fastgpt/global/core/workflow/constants';
import {
  DispatchNodeResponseKeyEnum,
  SseResponseEventEnum
} from '@fastgpt/global/core/workflow/runtime/constants';
import { DispatchNodeResultType } from '@fastgpt/global/core/workflow/runtime/type';
import { getReferenceVariableValue } from '@fastgpt/global/core/workflow/runtime/utils';
import { TUpdateListItem } from '@fastgpt/global/core/workflow/template/system/variableUpdate/type';
import { ModuleDispatchProps } from '@fastgpt/global/core/workflow/runtime/type';
import { removeSystemVariable, valueTypeFormat } from '../utils';
import { replaceVariableLabel } from '@fastgpt/global/core/workflow/utils';

type Props = ModuleDispatchProps<{
  [NodeInputKeyEnum.updateList]: TUpdateListItem[];
}>;
type Response = DispatchNodeResultType<{}>;

export const dispatchUpdateVariable = async (props: Props): Promise<Response> => {
  const { params, variables, runtimeNodes, workflowStreamResponse, node } = props;

  const { updateList } = params;
  updateList.forEach((item) => {
    const varNodeId = item.variable?.[0];
    const varKey = item.variable?.[1];

    if (!varNodeId || !varKey) {
      return;
    }

    const value = (() => {
      if (!item.value?.[0]) {
        const formatValue = valueTypeFormat(item.value?.[1], item.valueType);

        return typeof formatValue === 'string'
          ? replaceVariableLabel({
              text: formatValue,
              nodes: runtimeNodes,
              variables,
              runningNode: node
            })
          : formatValue;
      } else {
        return getReferenceVariableValue({
          value: item.value,
          variables,
          nodes: runtimeNodes
        });
      }
    })();

    if (varNodeId === VARIABLE_NODE_ID) {
      // update global variable
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
  });

  workflowStreamResponse?.({
    event: SseResponseEventEnum.updateVariables,
    data: removeSystemVariable(variables)
  });

  return {
    [DispatchNodeResponseKeyEnum.nodeResponse]: {
      totalPoints: 0
    }
  };
};
