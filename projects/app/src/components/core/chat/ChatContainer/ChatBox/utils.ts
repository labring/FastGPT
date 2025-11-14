import {
  type AIChatItemValueItemType,
  type ChatItemValueItemType,
  type ChatSiteItemType
} from '@fastgpt/global/core/chat/type';
import { type ChatBoxInputType, type UserInputFileItemType } from './type';
import { getFileIcon } from '@fastgpt/global/common/file/icon';
import { ChatItemValueTypeEnum, ChatStatusEnum } from '@fastgpt/global/core/chat/constants';
import { extractDeepestInteractive } from '@fastgpt/global/core/workflow/runtime/utils';
import type { WorkflowInteractiveResponseType } from '@fastgpt/global/core/workflow/template/system/interactive/type';

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

export const getInteractiveByHistories = (
  chatHistories: ChatSiteItemType[]
): WorkflowInteractiveResponseType | undefined => {
  const lastAIHistory = chatHistories[chatHistories.length - 1];
  if (!lastAIHistory) return;

  const lastMessageValue = lastAIHistory.value[
    lastAIHistory.value.length - 1
  ] as AIChatItemValueItemType;

  if (
    lastMessageValue &&
    lastMessageValue.type === ChatItemValueTypeEnum.interactive &&
    !!lastMessageValue?.interactive?.params
  ) {
    const finalInteractive = extractDeepestInteractive(lastMessageValue.interactive);

    // 如果用户选择了，则不认为是交互模式（可能是上一轮以交互结尾，发起的新的一轮对话）
    if (finalInteractive.type === 'userSelect') {
      if (!!finalInteractive.params.userSelectedVal) return;
    } else if (finalInteractive.type === 'userInput') {
      if (!!finalInteractive.params.submitted) return;
    } else if (finalInteractive.type === 'paymentPause') {
      if (!!finalInteractive.params.continue) return;
    }

    return finalInteractive;
  }

  return;
};

export const setInteractiveResultToHistories = (
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
      ) {
        return val;
      }

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

      if (finalInteractive.type === 'paymentPause') {
        return {
          ...val,
          interactive: {
            ...finalInteractive,
            params: {
              ...finalInteractive.params,
              continue: true
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
