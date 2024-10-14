import {
  AIChatItemValueItemType,
  ChatItemValueItemType,
  ChatSiteItemType
} from '@fastgpt/global/core/chat/type';
import { ChatBoxInputType, UserInputFileItemType } from './type';
import { getFileIcon } from '@fastgpt/global/common/file/icon';
import { ChatItemValueTypeEnum, ChatStatusEnum } from '@fastgpt/global/core/chat/constants';

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

export const checkIsInteractiveByHistories = (chatHistories: ChatSiteItemType[]) => {
  const lastAIHistory = chatHistories[chatHistories.length - 1];
  if (!lastAIHistory) return false;

  const lastMessageValue = lastAIHistory.value[
    lastAIHistory.value.length - 1
  ] as AIChatItemValueItemType;

  if (
    lastMessageValue &&
    lastMessageValue.type === ChatItemValueTypeEnum.interactive &&
    !!lastMessageValue?.interactive?.params
  ) {
    const params = lastMessageValue.interactive.params;
    // 如果用户选择了，则不认为是交互模式（可能是上一轮以交互结尾，发起的新的一轮对话）
    if ('userSelectOptions' in params) {
      return !params.userSelectedVal;
    } else if ('inputForm' in params) {
      return !params.submitted;
    }
  }

  return false;
};

export const setUserSelectResultToHistories = (
  histories: ChatSiteItemType[],
  interactiveVal: string
): ChatSiteItemType[] => {
  if (histories.length === 0) return histories;

  // @ts-ignore
  return histories.map((item, i) => {
    if (i !== histories.length - 1) return item;

    const value = item.value.map((val, i) => {
      if (
        i !== item.value.length - 1 ||
        val.type !== ChatItemValueTypeEnum.interactive ||
        !val.interactive
      )
        return val;

      if (val.interactive.type === 'userSelect') {
        return {
          ...val,
          interactive: {
            ...val.interactive,
            params: {
              ...val.interactive.params,
              userSelectedVal: val.interactive.params.userSelectOptions.find(
                (item) => item.value === interactiveVal
              )?.value
            }
          }
        };
      }

      if (val.interactive.type === 'userInput') {
        return {
          ...val,
          interactive: {
            ...val.interactive,
            params: {
              ...val.interactive.params,
              submitted: true
            }
          }
        };
      }
    });

    return {
      ...item,
      status: ChatStatusEnum.loading,
      value
    };
  });
};
