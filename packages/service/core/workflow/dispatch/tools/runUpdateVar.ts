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
import { replaceEditorVariable } from '@fastgpt/global/core/workflow/utils';

type Props = ModuleDispatchProps<{
  [NodeInputKeyEnum.updateList]: TUpdateListItem[];
}>;
type Response = DispatchNodeResultType<{}>;

export const dispatchUpdateVariable = async (props: Props): Promise<Response> => {
  const { params, variables, runtimeNodes, workflowStreamResponse, node } = props;

  const { updateList } = params;
  const result = updateList.map((item) => {
    const varNodeId = item.variable?.[0];
    const varKey = item.variable?.[1];

    if (!varNodeId || !varKey) {
      return null;
    }

    const value = (() => {
      if (!item.value?.[0]) {
        const formatValue = valueTypeFormat(item.value?.[1], item.valueType);

        return typeof formatValue === 'string'
          ? replaceEditorVariable({
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

    // Global variable
    if (varNodeId === VARIABLE_NODE_ID) {
      variables[varKey] = value;
    } else {
      // Other nodes
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

  workflowStreamResponse?.({
    event: SseResponseEventEnum.updateVariables,
    data: removeSystemVariable(variables)
  });

  return {
    [DispatchNodeResponseKeyEnum.nodeResponse]: {
      updateVarResult: result
    }
  };
};
