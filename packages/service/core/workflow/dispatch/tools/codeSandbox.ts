import type { ModuleDispatchProps } from '@fastgpt/global/core/workflow/runtime/type';
import { NodeInputKeyEnum, NodeOutputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { type DispatchNodeResultType } from '@fastgpt/global/core/workflow/runtime/type';
import axios from 'axios';
import { DispatchNodeResponseKeyEnum } from '@fastgpt/global/core/workflow/runtime/constants';
import { SandboxCodeTypeEnum } from '@fastgpt/global/core/workflow/template/system/sandbox/constants';
import { getErrText } from '@fastgpt/global/common/error/utils';

type RunCodeType = ModuleDispatchProps<{
  [NodeInputKeyEnum.codeType]: string;
  [NodeInputKeyEnum.code]: string;
  [NodeInputKeyEnum.addInputParam]: Record<string, any>;
}>;
type RunCodeResponse = DispatchNodeResultType<
  {
    [NodeOutputKeyEnum.error]?: any; // @deprecated
    [NodeOutputKeyEnum.rawResponse]?: Record<string, any>;
    [key: string]: any;
  },
  {
    [NodeOutputKeyEnum.error]: string;
  }
>;

function getURL(codeType: string): string {
  if (codeType == SandboxCodeTypeEnum.py) {
    return `${process.env.SANDBOX_URL}/sandbox/python`;
  } else {
    return `${process.env.SANDBOX_URL}/sandbox/js`;
  }
}

export const dispatchCodeSandbox = async (props: RunCodeType): Promise<RunCodeResponse> => {
  const {
    node: { catchError },
    params: { codeType, code, [NodeInputKeyEnum.addInputParam]: customVariables }
  } = props;

  if (!process.env.SANDBOX_URL) {
    return {
      error: {
        [NodeOutputKeyEnum.error]: 'Can not find SANDBOX_URL in env'
      },
      [DispatchNodeResponseKeyEnum.nodeResponse]: {
        errorText: 'Can not find SANDBOX_URL in env',
        customInputs: customVariables
      }
    };
  }

  const sandBoxRequestUrl = getURL(codeType);
  try {
    const { data: runResult } = await axios.post<{
      success: boolean;
      data: {
        codeReturn: Record<string, any>;
        log: string;
      };
    }>(sandBoxRequestUrl, {
      code,
      variables: customVariables
    });

    if (runResult.success) {
      return {
        data: {
          [NodeOutputKeyEnum.rawResponse]: runResult.data.codeReturn,
          ...runResult.data.codeReturn
        },
        [DispatchNodeResponseKeyEnum.nodeResponse]: {
          customInputs: customVariables,
          customOutputs: runResult.data.codeReturn,
          codeLog: runResult.data.log
        },
        [DispatchNodeResponseKeyEnum.toolResponses]: runResult.data.codeReturn
      };
    } else {
      throw new Error('Run code failed');
    }
  } catch (error) {
    const text = getErrText(error);

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

    return {
      error: {
        [NodeOutputKeyEnum.error]: text
      },
      [DispatchNodeResponseKeyEnum.nodeResponse]: {
        customInputs: customVariables,
        errorText: text
      }
    };
  }
};
