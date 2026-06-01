import type {
  ChatItemValueItemType,
  UserChatItemValueItemType
} from '@fastgpt/global/core/chat/type';
import { type ChatBoxInputType, type UserInputFileItemType } from '../type';
import { getFileIcon } from '@fastgpt/global/common/file/icon';
import { ChatFileTypeEnum } from '@fastgpt/global/core/chat/constants';

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
        'file' in item && item.file
          ? {
              id: item.file.url,
              type: item.file.type,
              name: item.file.name,
              icon:
                item.file.type === ChatFileTypeEnum.image
                  ? item.file.url
                  : getFileIcon(item.file.name),
              url: item.file.url,
              key: item.file.key
            }
          : undefined
      )
      .filter(Boolean) as UserInputFileItemType[]) || [];

  return {
    text,
    files
  };
};

export const stripChatValueFileUrls = (value: UserChatItemValueItemType[] = []) =>
  value.map((item) => {
    if ('file' in item && item.file?.key) {
      return {
        ...item,
        file: {
          ...item.file,
          url: ''
        }
      };
    }

    return item;
  });
