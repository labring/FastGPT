import { ChatItemValueItemType, ChatSiteItemType } from '@fastgpt/global/core/chat/type';
import { ChatBoxInputType, UserInputFileItemType } from './type';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import { getFileIcon } from '@fastgpt/global/common/file/icon';

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
      ?.map((item) =>
        item.type === 'file' && item.file
          ? {
              id: item.file.url,
              type: item.file.type,
              name: item.file.name,
              icon: getFileIcon(item.file.name),
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

export const setUserSelectedIndex = (history: ChatSiteItemType[], text: string) => {
  if (!history.length) return history;
  const lastItem = history[history.length - 1];
  const interactiveItem = lastItem.value[lastItem.value.length - 1];

  if (interactiveItem && interactiveItem.type === 'interactive') {
    const userSelectOptions = interactiveItem.interactive?.params.userSelectOptions;

    const selectedIndex = userSelectOptions?.findIndex((option) => option.value === text);

    if (selectedIndex !== -1 && selectedIndex !== undefined && interactiveItem.interactive) {
      interactiveItem.interactive.params.userSeletedIndex = selectedIndex;
      return history;
    }
  }

  return history;
};
