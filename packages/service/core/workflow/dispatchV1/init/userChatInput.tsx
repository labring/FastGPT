import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import type { ModuleDispatchProps } from '@fastgpt/global/core/workflow/runtime/type';
export type UserChatInputProps = ModuleDispatchProps<{
  [NodeInputKeyEnum.userChatInput]: string;
}>;

export const dispatchChatInput = (props: Record<string, any>) => {
  const {
    params: { userChatInput }
  } = props as UserChatInputProps;
  return {
    userChatInput
  };
};
