import type { moduleDispatchResType } from '@fastgpt/global/core/chat/type.d';
import type { ModuleDispatchProps } from '@/types/core/chat/type';
import { ModuleInputKeyEnum, ModuleOutputKeyEnum } from '@fastgpt/global/core/module/constants';
import { replaceVariable } from '@fastgpt/global/common/string/tools';

type HttpRequestProps = ModuleDispatchProps<{
  [ModuleInputKeyEnum.textEditorInput]: string;
  [key: string]: any;
}>;
type HttpResponse = {
  [ModuleOutputKeyEnum.text]: string;
  [ModuleOutputKeyEnum.responseData]: moduleDispatchResType;
};

export const dispatchTextEditor = async (props: HttpRequestProps): Promise<HttpResponse> => {
  const {
    inputs: { textEditorInput, ...obj }
  } = props;

  delete obj[ModuleInputKeyEnum.switch];

  const textResult = replaceVariable(textEditorInput, obj);

  return {
    responseData: {
      price: 0,
      textOutput: textResult
    },
    [ModuleOutputKeyEnum.text]: textResult
  };
};
