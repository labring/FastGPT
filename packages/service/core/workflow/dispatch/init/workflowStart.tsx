import { chatValue2RuntimePrompt } from '@fastgpt/global/core/chat/adapt';
import { NodeInputKeyEnum, NodeOutputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { DispatchNodeResponseKeyEnum } from '@fastgpt/global/core/workflow/runtime/constants';
import type {
  DispatchNodeResultType,
  ModuleDispatchProps
} from '@fastgpt/global/core/workflow/runtime/type';

export type UserChatInputProps = ModuleDispatchProps<{
  [NodeInputKeyEnum.userChatInput]: string;
}>;
type Response = DispatchNodeResultType<{
  [NodeOutputKeyEnum.userChatInput]: string;
  [NodeOutputKeyEnum.userFiles]: string[];
}>;

export const dispatchWorkflowStart = async (props: Record<string, any>): Promise<Response> => {
  const {
    query,
    variables,
    params: { userChatInput }
  } = props as UserChatInputProps;

  const { text, files } = chatValue2RuntimePrompt(query);

  const queryFiles = files
    .map((item) => {
      return item?.url ?? '';
    })
    .filter(Boolean);
  const variablesFiles: string[] = Array.isArray(variables?.fileUrlList)
    ? variables.fileUrlList
    : [];

  return {
    [DispatchNodeResponseKeyEnum.nodeResponse]: {},
    data: {
      [NodeInputKeyEnum.userChatInput]: text || userChatInput,
      [NodeOutputKeyEnum.userFiles]: [...queryFiles, ...variablesFiles]
    }
  };
};
