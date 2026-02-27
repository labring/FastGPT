import type { ModuleDispatchProps } from '@fastgpt/global/core/workflow/runtime/type';
import { NodeInputKeyEnum, NodeOutputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { type DispatchNodeResultType } from '@fastgpt/global/core/workflow/runtime/type';
import { axios } from '../../../../common/api/axios';
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

const token = process.env.SANDBOX_TOKEN;

export const runCode = async ({
  codeType,
  code,
  variables
}: {
  codeType: string;
  code: string;
  variables: Record<string, any>;
}): Promise<{
  codeReturn: Record<string, any>;
  log: string;
}> => {
  const url = (() => {
    if (codeType == SandboxCodeTypeEnum.py) {
      return `${process.env.SANDBOX_URL}/sandbox/python`;
    } else {
      return `${process.env.SANDBOX_URL}/sandbox/js`;
    }
  })();

  const { data: runResult } = await axios.post<{
    success: boolean;
    data: {
      codeReturn: Record<string, any>;
      log: string;
    };
  }>(
    url,
    {
      code,
      variables
    },
    {
      headers: {
        Authorization: token ? `Bearer ${token}` : undefined
      }
    }
  );

  if (!runResult.success) {
    return Promise.reject('Run code failed');
  }

  return runResult.data;
};

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

  try {
    const { codeReturn, log } = await runCode({ codeType, code, variables: customVariables });

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
      [DispatchNodeResponseKeyEnum.toolResponses]: codeReturn
    };
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
