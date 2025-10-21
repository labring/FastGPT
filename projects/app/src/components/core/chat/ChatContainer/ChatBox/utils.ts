import {
  type AIChatItemValueItemType,
  type ChatItemValueItemType,
  type ChatSiteItemType
} from '@fastgpt/global/core/chat/type';
import { type ChatBoxInputType, type UserInputFileItemType } from './type';
import { getFileIcon } from '@fastgpt/global/common/file/icon';
import { ChatStatusEnum } from '@fastgpt/global/core/chat/constants';
import { extractDeepestInteractive } from '@fastgpt/global/core/workflow/runtime/utils';

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

  if (lastMessageValue && !!lastMessageValue?.interactive?.params) {
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
      if (i !== item.value.length - 1) {
        return val;
      }
      if (!('interactive' in val) || !val.interactive) return val;

      const finalInteractive = extractDeepestInteractive(val.interactive);
      if (finalInteractive.type === 'userSelect') {
        return {
          ...val,
          interactive: {
            ...finalInteractive,
            params: {
              ...finalInteractive.params,
              userSelectedVal: finalInteractive.params.userSelectOptions.find(
                (item) => item.value === interactiveVal
              )?.value
            }
          }
        };
      }

      if (finalInteractive.type === 'userInput') {
        return {
          ...val,
          interactive: {
            ...finalInteractive,
            params: {
              ...finalInteractive.params,
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
