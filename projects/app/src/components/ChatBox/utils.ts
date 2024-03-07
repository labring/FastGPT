import { ChatItemValueItemType } from '@fastgpt/global/core/chat/type';
import { ChatBoxInputType } from './type';

export const formatChatValue2InputType = (value: ChatItemValueItemType[]): ChatBoxInputType => {
  const text = value
    .filter((item) => item.text?.content)
    .map((item) => item.text?.content || '')
    .join('');
  const files = value.filter((item) => item.file).map((item) => item.file) || [];

  return {
    text,
    files
  };
};
