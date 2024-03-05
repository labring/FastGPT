import { ModuleInputKeyEnum } from '@fastgpt/global/core/module/constants';
import type { ModuleDispatchProps } from '@fastgpt/global/core/module/type.d';
export type UserChatInputProps = ModuleDispatchProps<{
  [ModuleInputKeyEnum.userChatInput]: string;
}>;

export const dispatchRunTools = (props: Record<string, any>) => {
  const {
    params: { userChatInput }
  } = props as UserChatInputProps;
  return {
    userChatInput
  };
};
