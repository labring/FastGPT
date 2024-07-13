import { ChatItemValueItemType } from '@fastgpt/global/core/chat/type';
import { ChatBoxInputType, UserInputFileItemType } from './type';
import { getNanoid } from '@fastgpt/global/common/string/tools';

export const formatChatValue2InputType = (value?: ChatItemValueItemType[]): ChatBoxInputType => {
  if (!value) {
    return { text: '', files: [] };
  }

  if (!Array.isArray(value)) {
    console.error('value is error', value);
    return { text: '', files: [] };
  }
  const text = value
    .filter((item) => item.text?.content)
    .map((item) => item.text?.content || '')
    .join('');
  const files =
    (value
      .map((item) =>
        item.type === 'file' && item.file
          ? {
              id: getNanoid(),
              type: item.file.type,
              name: item.file.name,
              icon: '',
              url: item.file.url
            }
          : undefined
      )
      .filter(Boolean) as UserInputFileItemType[]) || [];

  return {
    text,
    files
  };
};
