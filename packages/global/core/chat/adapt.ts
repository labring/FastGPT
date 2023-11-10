import type { ChatItemType } from '../../core/chat/type.d';
import { ChatRoleEnum } from '../../core/chat/constants';
import { ChatCompletionRequestMessageRoleEnum } from '../../core/ai/constant';
import type { ChatMessageItemType } from '../../core/ai/type.d';

const chat2Message = {
  [ChatRoleEnum.AI]: ChatCompletionRequestMessageRoleEnum.Assistant,
  [ChatRoleEnum.Human]: ChatCompletionRequestMessageRoleEnum.User,
  [ChatRoleEnum.System]: ChatCompletionRequestMessageRoleEnum.System,
  [ChatRoleEnum.Function]: ChatCompletionRequestMessageRoleEnum.Function,
  [ChatRoleEnum.Tool]: ChatCompletionRequestMessageRoleEnum.Tool
};
const message2Chat = {
  [ChatCompletionRequestMessageRoleEnum.System]: ChatRoleEnum.System,
  [ChatCompletionRequestMessageRoleEnum.User]: ChatRoleEnum.Human,
  [ChatCompletionRequestMessageRoleEnum.Assistant]: ChatRoleEnum.AI,
  [ChatCompletionRequestMessageRoleEnum.Function]: ChatRoleEnum.Function,
  [ChatCompletionRequestMessageRoleEnum.Tool]: ChatRoleEnum.Tool
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
}): ChatMessageItemType[] => {
  return messages.map((item) => ({
    ...(reserveId && { dataId: item.dataId }),
    role: chat2Message[item.obj],
    content: item.value || ''
  }));
};
