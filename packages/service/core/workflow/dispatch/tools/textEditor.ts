import { DispatchNodeResponseKeyEnum } from '@fastgpt/global/core/workflow/runtime/constants';
import type { ModuleDispatchProps } from '@fastgpt/global/core/workflow/runtime/type';
import type { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { NodeOutputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { type DispatchNodeResultType } from '@fastgpt/global/core/workflow/runtime/type';
import { replaceVariable } from '@fastgpt/global/common/string/tools';
import { SYSTEM_MAX_STRING_LENGTH } from '../../../../env';

type Props = ModuleDispatchProps<{
  [NodeInputKeyEnum.textareaInput]: string;
  [NodeInputKeyEnum.addInputParam]: Record<string, any>;
}>;
type Response = DispatchNodeResultType<{
  [NodeOutputKeyEnum.text]: string;
}>;

export const dispatchTextEditor = (props: Record<string, any>): Response => {
  const {
    variableState,
    params: { system_textareaInput: text = '', system_addInputParam: customVariables = {} }
  } = props as Props;

  const runtimeVariables = variableState.toRuntimeRecord();
  const variables = new Proxy(runtimeVariables, {
    has(target, key) {
      if (typeof key !== 'string') return key in target;

      return (
        Object.prototype.hasOwnProperty.call(target, key) ||
        Object.prototype.hasOwnProperty.call(customVariables, key)
      );
    },
    get(target, key) {
      if (typeof key !== 'string') return Reflect.get(target, key);
      if (Object.prototype.hasOwnProperty.call(target, key)) return target[key];
      if (!Object.prototype.hasOwnProperty.call(customVariables, key)) return undefined;

      const val = customVariables[key];
      if (typeof val === 'object') return JSON.stringify(val, null, 2);
      if (typeof val === 'number') return String(val);
      if (typeof val === 'boolean') return val ? 'true' : 'false';
      return val;
    }
  }) as Record<string, any>;

  const textResult = replaceVariable(text, variables, {
    maxStringLength: SYSTEM_MAX_STRING_LENGTH
  });

  return {
    data: {
      [NodeOutputKeyEnum.text]: textResult
    },
    [DispatchNodeResponseKeyEnum.nodeResponse]: {
      textOutput: textResult
    }
  };
};
