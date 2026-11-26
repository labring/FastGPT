import { NodeInputKeyEnum, NodeOutputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import type { DispatchNodeResultType, ModuleDispatchProps } from '../../types/runtime';
import { DispatchNodeResponseKeyEnum } from '@fastgpt/global/core/workflow/runtime/constants';
import { getErrText } from '@fastgpt/global/common/error/utils';
import { codeSandbox, isCodeSandboxConfigured } from '../../../../thirdProvider/codeSandbox';
import { getNodeErrResponse } from '../utils';

type RunCodeType = ModuleDispatchProps<{
  [NodeInputKeyEnum.codeType]: string;
  [NodeInputKeyEnum.code]: string;
  [NodeInputKeyEnum.addInputParam]: Record<string, any>;
}>;
type RunCodeResponse = DispatchNodeResultType<
  {
    [NodeOutputKeyEnum.rawResponse]?: Record<string, any>;
    [key: string]: any;

    /** @deprecated */
    [NodeOutputKeyEnum.error]?: any;
  },
  {
    [NodeOutputKeyEnum.error]: string;
  }
>;

export const dispatchCodeSandbox = async (props: RunCodeType): Promise<RunCodeResponse> => {
  const {
    params: { codeType, code, [NodeInputKeyEnum.addInputParam]: customVariables }
  } = props;

  if (!isCodeSandboxConfigured()) {
    return getNodeErrResponse({
      error: 'Code sandbox service is not configured or disabled',
      customErr: {
        error: 'Code sandbox service is not configured or disabled'
      },
      [DispatchNodeResponseKeyEnum.nodeResponse]: {
        errorText: 'Code sandbox service is not configured or disabled',
        customInputs: customVariables
      }
    });
  }

  try {
    const { codeReturn, log } = await codeSandbox.runCode({
      codeType,
      code,
      variables: customVariables
    });

    return {
      data: {
        [NodeOutputKeyEnum.rawResponse]: codeReturn,
        ...codeReturn
      },
      [DispatchNodeResponseKeyEnum.nodeResponse]: {
        customInputs: customVariables,
        customOutputs: codeReturn,
        codeLog: log
      },
      [DispatchNodeResponseKeyEnum.toolResponse]: codeReturn
    };
  } catch (error: any) {
    const text = getErrText(error, 'Request code sandbox failed');

    return getNodeErrResponse({
      error,
      errorText: text,
      customErr: {
        [NodeOutputKeyEnum.error]: text
      },
      [DispatchNodeResponseKeyEnum.nodeResponse]: {
        customInputs: customVariables,
        errorText: text
      }
    });
  }
};
