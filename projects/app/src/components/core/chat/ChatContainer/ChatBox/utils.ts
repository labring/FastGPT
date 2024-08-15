import { ChatItemValueItemType, ChatSiteItemType } from '@fastgpt/global/core/chat/type';
import { ChatBoxInputType, UserInputFileItemType } from './type';
import { getFileIcon } from '@fastgpt/global/common/file/icon';
import { ChatItemValueTypeEnum } from '@fastgpt/global/core/chat/constants';

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

export const setUserSelectResultToHistories = (
  histories: ChatSiteItemType[],
  selectVal: string
): ChatSiteItemType[] => {
  if (histories.length === 0) return histories;

  // @ts-ignore
  return histories.map((item, i) => {
    if (i !== histories.length - 1) return item;
    item.value;
    const value = item.value.map((val) => {
      if (val.type !== ChatItemValueTypeEnum.interactive || !val.interactive) return val;

      return {
        ...val,
        interactive: {
          ...val.interactive,
          params: {
            ...val.interactive.params,
            userSelectedVal: val.interactive.params.userSelectOptions.find(
              (item) => item.value === selectVal
            )?.value
          }
        }
      };
    });

    return {
      ...item,
      value
    };
  });
};
