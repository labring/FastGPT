import type { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { VARIABLE_NODE_ID } from '@fastgpt/global/core/workflow/constants';
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
import { type ModuleDispatchProps } from '@fastgpt/global/core/workflow/runtime/type';
import { runtimeSystemVar2StoreType } from '../utils';
import { isValidReferenceValue } from '@fastgpt/global/core/workflow/utils';
import { valueTypeFormat } from '@fastgpt/global/core/workflow/runtime/utils';
import { parseUrlToFileType } from '@fastgpt/global/common/file/tools';
import { z } from 'zod';

type Props = ModuleDispatchProps<{
  [NodeInputKeyEnum.updateList]: TUpdateListItem[];
}>;
type Response = DispatchNodeResultType<{}>;

export const dispatchUpdateVariable = async (props: Props): Promise<Response> => {
  const {
    chatConfig,
    params,
    variables,
    cloneVariables,
    runtimeNodes,
    workflowStreamResponse,
    externalProvider,
    runningAppInfo
  } = props;

  const { updateList } = params;
  const nodeIds = runtimeNodes.map((node) => node.nodeId);
  const urlSchema = z.string().url();

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
        const val =
          typeof item.value?.[1] === 'string'
            ? replaceEditorVariable({
                text: item.value?.[1],
                nodes: runtimeNodes,
                variables
              })
            : item.value?.[1];

        return valueTypeFormat(val, item.valueType);
      } else {
        const val = getReferenceVariableValue({
          value: item.value,
          variables,
          nodes: runtimeNodes
        });

        if (
          Array.isArray(val) &&
          val.every((url) => typeof url === 'string' && urlSchema.safeParse(url).success)
        ) {
          return val.map((url) => parseUrlToFileType(url)).filter(Boolean);
        }
        return val;
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

  if (!runningAppInfo.isChildApp) {
    workflowStreamResponse?.({
      event: SseResponseEventEnum.updateVariables,
      data: runtimeSystemVar2StoreType({
        variables,
        cloneVariables,
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
