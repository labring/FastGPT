import { chatValue2RuntimePrompt } from '@fastgpt/global/core/chat/adapt';
import { UserChatItemValueItemType } from '@fastgpt/global/core/chat/type';
import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import type { ModuleDispatchProps } from '@fastgpt/global/core/workflow/type/index.d';
export type UserChatInputProps = ModuleDispatchProps<{
  [NodeInputKeyEnum.userChatInput]: string;
  [NodeInputKeyEnum.inputFiles]: UserChatItemValueItemType['file'][];
}>;

export const dispatchWorkflowStart = (props: Record<string, any>) => {
  const {
    query,
    params: { userChatInput }
  } = props as UserChatInputProps;

  const { text, files } = chatValue2RuntimePrompt(query);

  return {
    [NodeInputKeyEnum.userChatInput]: text || userChatInput,
    [NodeInputKeyEnum.inputFiles]: files
  };
};
