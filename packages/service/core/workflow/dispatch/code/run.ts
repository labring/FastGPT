import type { ModuleDispatchProps } from '@fastgpt/global/core/workflow/runtime/type';
import { NodeInputKeyEnum, NodeOutputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { DispatchNodeResultType } from '@fastgpt/global/core/workflow/runtime/type';
import axios from 'axios';
import { formatHttpError } from '../utils';
import { DispatchNodeResponseKeyEnum } from '@fastgpt/global/core/workflow/runtime/constants';
import { SandboxCodeTypeEnum } from '@fastgpt/global/core/workflow/template/system/sandbox/constants';

type RunCodeType = ModuleDispatchProps<{
  [NodeInputKeyEnum.codeType]: string;
  [NodeInputKeyEnum.code]: string;
  [NodeInputKeyEnum.addInputParam]: Record<string, any>;
}>;
type RunCodeResponse = DispatchNodeResultType<{
  [NodeOutputKeyEnum.error]?: any;
  [NodeOutputKeyEnum.rawResponse]?: Record<string, any>;
  [key: string]: any;
}>;

function getURL(codeType: string): string {
  if (codeType == SandboxCodeTypeEnum.py) {
    return `${process.env.SANDBOX_URL}/sandbox/python`;
  } else {
    return `${process.env.SANDBOX_URL}/sandbox/js`;
  }
}

export const dispatchRunCode = async (props: RunCodeType): Promise<RunCodeResponse> => {
  const {
    params: { codeType, code, [NodeInputKeyEnum.addInputParam]: customVariables }
  } = props;

  if (!process.env.SANDBOX_URL) {
    return {
      [NodeOutputKeyEnum.error]: 'Can not find SANDBOX_URL in env'
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

    console.log(runResult);

    if (runResult.success) {
      return {
        [NodeOutputKeyEnum.rawResponse]: runResult.data.codeReturn,
        [DispatchNodeResponseKeyEnum.nodeResponse]: {
          customInputs: customVariables,
          customOutputs: runResult.data.codeReturn,
          codeLog: runResult.data.log
        },
        [DispatchNodeResponseKeyEnum.toolResponses]: runResult.data.codeReturn,
        ...runResult.data.codeReturn
      };
    } else {
      return Promise.reject('Run code failed');
    }
  } catch (error) {
    return {
      [NodeOutputKeyEnum.error]: formatHttpError(error),
      [DispatchNodeResponseKeyEnum.nodeResponse]: {
        customInputs: customVariables,
        error: formatHttpError(error)
      }
    };
  }
};
