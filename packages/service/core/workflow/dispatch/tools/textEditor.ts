import { DispatchNodeResponseKeyEnum } from '@fastgpt/global/core/workflow/runtime/constants';
import type { ModuleDispatchProps } from '@fastgpt/global/core/workflow/runtime/type';
import { NodeInputKeyEnum, NodeOutputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { DispatchNodeResultType } from '@fastgpt/global/core/workflow/runtime/type';
import { replaceVariable } from '@fastgpt/global/common/string/tools';

type Props = ModuleDispatchProps<{
  [NodeInputKeyEnum.textareaInput]: string;
  [NodeInputKeyEnum.addInputParam]: Record<string, any>;
}>;
type Response = DispatchNodeResultType<{
  [NodeOutputKeyEnum.text]: string;
}>;

export const dispatchTextEditor = (props: Record<string, any>): Response => {
  const {
    variables,
    params: { system_textareaInput: text = '', system_addInputParam: customVariables = {} }
  } = props as Props;

  // format variable
  Object.keys(customVariables).forEach((key) => {
    let val = customVariables[key];

    if (typeof val === 'object') {
      val = JSON.stringify(val, null, 2);
    } else if (typeof val === 'number') {
      val = String(val);
    } else if (typeof val === 'boolean') {
      val = val ? 'true' : 'false';
    }

    customVariables[key] = val;
  });

  const textResult = replaceVariable(text, {
    ...customVariables,
    ...variables
  });

  return {
    [NodeOutputKeyEnum.text]: textResult,
    [DispatchNodeResponseKeyEnum.nodeResponse]: {
      textOutput: textResult
    }
  };
};
