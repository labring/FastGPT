import { NodeInputKeyEnum, VARIABLE_NODE_ID } from '@fastgpt/global/core/workflow/constants';
import {
  DispatchNodeResponseKeyEnum,
  SseResponseEventEnum
} from '@fastgpt/global/core/workflow/runtime/constants';
import { DispatchNodeResultType } from '@fastgpt/global/core/workflow/runtime/type';
import {
  getReferenceVariableValue,
  replaceEditorVariable
} from '@fastgpt/global/core/workflow/runtime/utils';
import { TUpdateListItem } from '@fastgpt/global/core/workflow/template/system/variableUpdate/type';
import { ModuleDispatchProps } from '@fastgpt/global/core/workflow/runtime/type';
import { removeSystemVariable, valueTypeFormat } from '../utils';
import { isValidReferenceValue } from '@fastgpt/global/core/workflow/utils';

type Props = ModuleDispatchProps<{
  [NodeInputKeyEnum.updateList]: TUpdateListItem[];
}>;
type Response = DispatchNodeResultType<{}>;

export const dispatchUpdateVariable = async (props: Props): Promise<Response> => {
  const { params, variables, runtimeNodes, workflowStreamResponse, node } = props;

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
      // If first item is empty, it means it is a input value
      if (!item.value?.[0]) {
        const formatValue = valueTypeFormat(item.value?.[1], item.valueType);

        return typeof formatValue === 'string'
          ? replaceEditorVariable({
              text: formatValue,
              nodes: runtimeNodes,
              variables
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

    // Update node output
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
    [DispatchNodeResponseKeyEnum.newVariables]: variables,
    [DispatchNodeResponseKeyEnum.nodeResponse]: {
      updateVarResult: result
    }
  };
};
