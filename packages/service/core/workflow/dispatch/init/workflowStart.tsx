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

export const dispatchWorkflowStart = (props: Record<string, any>): Response => {
  const {
    query,
    params: { userChatInput }
  } = props as UserChatInputProps;

  const { text, files } = chatValue2RuntimePrompt(query);

  return {
    [DispatchNodeResponseKeyEnum.nodeResponse]: {},
    [NodeInputKeyEnum.userChatInput]: text || userChatInput,
    [NodeOutputKeyEnum.userFiles]: files
      .map((item) => {
        return item?.url ?? '';
      })
      .filter(Boolean)
    // [NodeInputKeyEnum.inputFiles]: files
  };
};
