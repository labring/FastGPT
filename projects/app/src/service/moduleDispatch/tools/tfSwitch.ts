import type { moduleDispatchResType } from '@fastgpt/global/core/chat/type.d';
import type { ModuleDispatchProps } from '@/types/core/chat/type';
import { ModuleInputKeyEnum, ModuleOutputKeyEnum } from '@fastgpt/global/core/module/constants';

type HttpRequestProps = ModuleDispatchProps<{
  [ModuleInputKeyEnum.anyInput]: any;
  [ModuleInputKeyEnum.textareaInput]: string;
}>;
type HttpResponse = {
  [ModuleOutputKeyEnum.responseData]: moduleDispatchResType;
  [ModuleOutputKeyEnum.resultTrue]?: boolean;
  [ModuleOutputKeyEnum.resultFalse]?: boolean;
};

export const dispatchTFSwitch = async (props: HttpRequestProps): Promise<HttpResponse> => {
  const {
    inputs: { system_anyInput: anyInput, system_textareaInput: textareaInput = '' }
  } = props;

  const result = (() => {
    if (typeof anyInput === 'string') {
      const defaultReg: any[] = [undefined, null, false, 'false', 0, '0', 'none'];
      const customReg = textareaInput.split('\n');
      defaultReg.push(...customReg);

      return !defaultReg.find((item) => {
        const reg = typeof item === 'string' ? stringToRegex(item) : null;
        if (reg) {
          return reg.test(anyInput);
        }
        return anyInput === item;
      });
    }

    return !!anyInput;
  })();

  return {
    responseData: {
      price: 0,
      tfSwitchResult: result
    },
    ...(result
      ? {
          [ModuleOutputKeyEnum.resultTrue]: true
        }
      : {
          [ModuleOutputKeyEnum.resultFalse]: false
        })
  };
};

function stringToRegex(str: string) {
  const regexFormat = /^\/(.+)\/([gimuy]*)$/;
  const match = str.match(regexFormat);

  if (match) {
    const [, pattern, flags] = match;
    return new RegExp(pattern, flags);
  } else {
    return null;
  }
}
