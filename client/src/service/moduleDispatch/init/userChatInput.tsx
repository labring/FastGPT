import { SystemInputEnum } from '@/constants/app';

export type UserChatInputProps = {
  [SystemInputEnum.userChatInput]: string;
};

export const dispatchChatInput = (props: Record<string, any>) => {
  const { userChatInput } = props as UserChatInputProps;
  return {
    userChatInput
  };
};
