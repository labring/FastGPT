import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import type { ModuleDispatchProps } from '@fastgpt/global/core/workflow/type/index.d';
export type UserChatInputProps = ModuleDispatchProps<{
  [NodeInputKeyEnum.userChatInput]: string;
}>;

export const dispatchSystemConfig = (props: Record<string, any>) => {
  const { variables } = props as UserChatInputProps;
  return variables;
};
