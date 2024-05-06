import { NodeInputKeyEnum, VARIABLE_NODE_ID } from '@fastgpt/global/core/workflow/constants';
import { DispatchNodeResponseKeyEnum } from '@fastgpt/global/core/workflow/runtime/constants';
import { DispatchNodeResultType } from '@fastgpt/global/core/workflow/runtime/type';
import { getReferenceVariableValue } from '@fastgpt/global/core/workflow/runtime/utils';
import { TUpdateListItem } from '@fastgpt/global/core/workflow/template/system/variableUpdate/type';
import { ModuleDispatchProps } from '@fastgpt/global/core/workflow/type';

type Props = ModuleDispatchProps<{
  [NodeInputKeyEnum.updateList]: TUpdateListItem[];
}>;

export const dispatchUpdateVariable = async (
  props: Props
): Promise<DispatchNodeResultType<any>> => {
  const { params, variables, runtimeNodes } = props;

  const { updateList } = params;
  updateList.forEach((item) => {
    const varNodeId = item.variable?.[0];
    const varKey = item.variable?.[1];

    if (!varNodeId || !varKey) {
      return;
    }
    let value = '';
    if (!item.value?.[0]) {
      value = item.value?.[1];
    } else {
      value = getReferenceVariableValue({
        value: item.value,
        variables,
        nodes: runtimeNodes
      });
    }
    if (varNodeId === VARIABLE_NODE_ID) {
      variables[varKey] = value;
    } else {
      const node = runtimeNodes.find((node) => node.nodeId === varNodeId);
      if (node) {
        const output = node.outputs.find((output) => output.id === varKey);
        if (output) {
          output.value = value;
        }
      }
    }
  });

  return {
    [DispatchNodeResponseKeyEnum.nodeResponse]: {
      totalPoints: 0
    }
  };
};
