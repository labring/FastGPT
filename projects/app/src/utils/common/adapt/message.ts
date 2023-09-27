import type { ChatItemType } from '@/types/chat';
import { ChatRoleEnum } from '@/constants/chat';
import { ChatCompletionRequestMessageRoleEnum } from '@fastgpt/core/aiApi/constant';
import type { MessageItemType } from '@/types/core/chat/type';

const chat2Message = {
  [ChatRoleEnum.AI]: ChatCompletionRequestMessageRoleEnum.Assistant,
  [ChatRoleEnum.Human]: ChatCompletionRequestMessageRoleEnum.User,
  [ChatRoleEnum.System]: ChatCompletionRequestMessageRoleEnum.System
};
const message2Chat = {
  [ChatCompletionRequestMessageRoleEnum.System]: ChatRoleEnum.System,
  [ChatCompletionRequestMessageRoleEnum.User]: ChatRoleEnum.Human,
  [ChatCompletionRequestMessageRoleEnum.Assistant]: ChatRoleEnum.AI,
  [ChatCompletionRequestMessageRoleEnum.Function]: 'function'
};

export function adaptRole_Chat2Message(role: `${ChatRoleEnum}`) {
  return chat2Message[role];
}
export function adaptRole_Message2Chat(role: `${ChatCompletionRequestMessageRoleEnum}`) {
  return message2Chat[role];
}

export const adaptChat2GptMessages = ({
  messages,
  reserveId
}: {
  messages: ChatItemType[];
  reserveId: boolean;
}): MessageItemType[] => {
  return messages.map((item) => ({
    ...(reserveId && { dataId: item.dataId }),
    role: chat2Message[item.obj] || ChatCompletionRequestMessageRoleEnum.System,
    content: item.value || ''
  }));
};
