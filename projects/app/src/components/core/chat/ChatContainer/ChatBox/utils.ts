import {
  type AIChatItemValueItemType,
  type ChatItemValueItemType,
  type ChatSiteItemType
} from '@fastgpt/global/core/chat/type';
import { type ChatBoxInputType, type UserInputFileItemType } from './type';
import { getFileIcon } from '@fastgpt/global/common/file/icon';
import { ChatStatusEnum } from '@fastgpt/global/core/chat/constants';
import { extractDeepestInteractive } from '@fastgpt/global/core/workflow/runtime/utils';
import type { InteractiveNodeResponseType } from '@fastgpt/global/core/workflow/template/system/interactive/type';
import { ConfirmPlanAgentText } from '@fastgpt/global/core/workflow/runtime/constants';

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

export const getInteractiveStatus = (
  chatHistories: ChatSiteItemType[]
): {
  interactiveType: InteractiveNodeResponseType['type'] | undefined;
  canSendQuery: boolean;
} => {
  const lastAIHistory = chatHistories[chatHistories.length - 1];
  if (!lastAIHistory)
    return {
      interactiveType: undefined,
      canSendQuery: true
    };

  const lastMessageValue = lastAIHistory.value[
    lastAIHistory.value.length - 1
  ] as AIChatItemValueItemType;

  if (!lastMessageValue || !lastMessageValue.interactive) {
    return {
      interactiveType: undefined,
      canSendQuery: true
    };
  }

  const interactive = lastMessageValue.interactive;

  if (interactive.params) {
    if (interactive.type === 'userSelect' || interactive.type === 'agentPlanAskUserSelect') {
      return {
        interactiveType: !!interactive.params.userSelectedVal ? undefined : 'userSelect',
        canSendQuery: !!interactive.params.userSelectedVal
      };
    }
    if (interactive.type === 'userInput' || interactive.type === 'agentPlanAskUserForm') {
      return {
        interactiveType: !!interactive.params.submitted ? undefined : 'userInput',
        canSendQuery: !!interactive.params.submitted
      };
    }
    if (interactive.type === 'agentPlanCheck') {
      return {
        interactiveType: !!interactive.params.confirmed ? undefined : 'agentPlanCheck',
        canSendQuery: true
      };
    }
    if (interactive.type === 'agentPlanAskQuery') {
      return {
        interactiveType: 'agentPlanAskQuery',
        canSendQuery: true
      };
    }
  }

  return {
    interactiveType: undefined,
    canSendQuery: true
  };
};

export const rewriteHistoriesByInteractiveResponse = ({
  histories,
  interactiveVal,
  interactiveType
}: {
  histories: ChatSiteItemType[];
  interactiveVal: string;
  interactiveType: InteractiveNodeResponseType['type'];
}): ChatSiteItemType[] => {
  const formatHistories = (() => {
    if (interactiveType === 'agentPlanCheck' && interactiveVal !== ConfirmPlanAgentText) {
      return histories;
    }
    return histories.slice(0, -2);
  })();

  const newHistories = formatHistories.map((item, i) => {
    if (i !== formatHistories.length - 1) return item;

    const value = item.value.map((val, i) => {
      if (i !== item.value.length - 1) {
        return val;
      }
      if (!('interactive' in val) || !val.interactive) return val;

      const finalInteractive = extractDeepestInteractive(val.interactive);
      if (
        finalInteractive.type === 'userSelect' ||
        finalInteractive.type === 'agentPlanAskUserSelect'
      ) {
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

      if (
        finalInteractive.type === 'userInput' ||
        finalInteractive.type === 'agentPlanAskUserForm'
      ) {
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

      if (finalInteractive.type === 'agentPlanCheck') {
        return {
          ...val,
          interactive: {
            ...finalInteractive,
            params: {
              confirmed: true
            }
          }
        };
      }

      return val;
    });

    return {
      ...item,
      status: ChatStatusEnum.loading,
      value
    } as ChatSiteItemType;
  });

  return newHistories;
};
