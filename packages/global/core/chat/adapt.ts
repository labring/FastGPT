import type { ChatItemType } from '../../core/chat/type.d';
import { ChatRoleEnum } from '../../core/chat/constants';
import type { ChatCompletionMessageParam } from '../../core/ai/type.d';
import { ChatCompletionRequestMessageRoleEnum } from '../../core/ai/constants';

const chat2GPT = {
  [ChatRoleEnum.AI]: ChatCompletionRequestMessageRoleEnum.Assistant,
  [ChatRoleEnum.Human]: ChatCompletionRequestMessageRoleEnum.User,
  [ChatRoleEnum.System]: ChatCompletionRequestMessageRoleEnum.System,
  [ChatRoleEnum.Function]: ChatCompletionRequestMessageRoleEnum.Function,
  [ChatRoleEnum.Tool]: ChatCompletionRequestMessageRoleEnum.Tool
};
const GPT2Chat = {
  [ChatCompletionRequestMessageRoleEnum.System]: ChatRoleEnum.System,
  [ChatCompletionRequestMessageRoleEnum.User]: ChatRoleEnum.Human,
  [ChatCompletionRequestMessageRoleEnum.Assistant]: ChatRoleEnum.AI,
  [ChatCompletionRequestMessageRoleEnum.Function]: ChatRoleEnum.Function,
  [ChatCompletionRequestMessageRoleEnum.Tool]: ChatRoleEnum.Tool
};

export function adaptRole_Message2Chat(role: `${ChatCompletionRequestMessageRoleEnum}`) {
  return GPT2Chat[role];
}

export const adaptChat2GptMessages = ({
  messages,
  reserveId
}: {
  messages: ChatItemType[];
  reserveId: boolean;
}): ChatCompletionMessageParam[] => {
  // @ts-ignore
  return messages.map((item) => ({
    ...(reserveId && { dataId: item.dataId }),
    role: chat2GPT[item.obj],
    content: item.value
  }));
};

export const adaptGPTMessages2Chats = (messages: ChatCompletionMessageParam[]): ChatItemType[] => {
  return messages.map((item) => ({
    dataId: item.dataId,
    obj: GPT2Chat[item.role],
    value: item.content || ''
  }));
};
