import { ChatItemValueTypeEnum } from './constants';
import { ChatItemType, ChatItemValueItemType } from './type';

export const getChatTitleFromChatMessage = (message?: ChatItemType, defaultValue = '新对话') => {
  const textMsg = message?.value.find((item) => item.type === ChatItemValueTypeEnum.text);

  if (textMsg?.text?.content) {
    return textMsg.text.content.slice(0, 20);
  }

  return defaultValue;
};
