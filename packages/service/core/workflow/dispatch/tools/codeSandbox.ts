import type { ModuleDispatchProps } from '@fastgpt/global/core/workflow/runtime/type';
import { NodeInputKeyEnum, NodeOutputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { type DispatchNodeResultType } from '@fastgpt/global/core/workflow/runtime/type';
import { DispatchNodeResponseKeyEnum } from '@fastgpt/global/core/workflow/runtime/constants';
import { getErrText } from '@fastgpt/global/common/error/utils';
import { codeSandbox } from '../../../../thirdProvider/codeSandbox';
import { serviceEnv } from '../../../../env';
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
    node: { catchError },
    params: { codeType, code, [NodeInputKeyEnum.addInputParam]: customVariables }
  } = props;

  if (!serviceEnv.CODE_SANDBOX_URL) {
    return getNodeErrResponse({
      error: 'Can not find CODE_SANDBOX_URL in env',
      customErr: {
        error: 'Can not find CODE_SANDBOX_URL in env'
      },
      [DispatchNodeResponseKeyEnum.nodeResponse]: {
        errorText: 'Can not find CODE_SANDBOX_URL in env',
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

    // @adapt
    if (catchError === undefined) {
      return {
        data: {
          [NodeOutputKeyEnum.error]: { message: text }
        },
        [DispatchNodeResponseKeyEnum.nodeResponse]: {
          customInputs: customVariables,
          errorText: text
        }
      };
    }

    return getNodeErrResponse({
      error: text,
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
