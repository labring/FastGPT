import { ModuleInputKeyEnum } from '@fastgpt/global/core/module/constants';
import type { ModuleDispatchProps } from '@/types/core/chat/type';
export type UserChatInputProps = ModuleDispatchProps<{
  [ModuleInputKeyEnum.userChatInput]: string;
}>;

export const dispatchChatInput = (props: Record<string, any>) => {
  const {
    inputs: { userChatInput }
  } = props as UserChatInputProps;
  return {
    userChatInput
  };
};
