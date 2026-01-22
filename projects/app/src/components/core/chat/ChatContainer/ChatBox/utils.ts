import { type ChatItemValueItemType, type ChatSiteItemType } from '@fastgpt/global/core/chat/type';
import { type ChatBoxInputType, type UserInputFileItemType } from './type';
import { getFileIcon } from '@fastgpt/global/common/file/icon';
import { ChatStatusEnum } from '@fastgpt/global/core/chat/constants';
import {
  extractDeepestInteractive,
  getLastInteractiveValue
} from '@fastgpt/global/core/workflow/runtime/utils';
import type { WorkflowInteractiveResponseType } from '@fastgpt/global/core/workflow/template/system/interactive/type';
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

// 用于判断当前对话框状态。所以，如果是 child 的 interactive，需要递归去找到最后一个。
export const getInteractiveByHistories = (
  chatHistories: ChatSiteItemType[]
): {
  interactive: WorkflowInteractiveResponseType | undefined;
  canSendQuery: boolean;
} => {
  const lastInreactive = getLastInteractiveValue(chatHistories);
  if (!lastInreactive) {
    return {
      interactive: undefined,
      canSendQuery: true
    };
  }

  const finalInteractive = extractDeepestInteractive(lastInreactive);

  // 如果用户选择了，则不认为是交互模式（可能是上一轮以交互结尾，发起的新的一轮对话）
  if (finalInteractive.type === 'userSelect' && !finalInteractive.params.userSelectedVal) {
    return {
      interactive: finalInteractive,
      canSendQuery: false
    };
  } else if (finalInteractive.type === 'userInput' && !finalInteractive.params.submitted) {
    return {
      interactive: finalInteractive,
      canSendQuery: false
    };
  } else if (finalInteractive.type === 'paymentPause' && !finalInteractive.params.continue) {
    return {
      interactive: finalInteractive,
      canSendQuery: false
    };
  } else if (finalInteractive.type === 'agentPlanCheck' && !finalInteractive.params.confirmed) {
    return {
      interactive: finalInteractive,
      canSendQuery: true
    };
  } else if (
    finalInteractive.type === 'agentPlanAskQuery' ||
    finalInteractive.type === 'agentPlanAskUserForm'
  ) {
    return {
      interactive: finalInteractive,
      canSendQuery: true
    };
  }

  return {
    interactive: undefined,
    canSendQuery: true
  };
};

export const rewriteHistoriesByInteractiveResponse = ({
  histories,
  interactiveVal,
  interactive
}: {
  histories: ChatSiteItemType[];
  interactiveVal: string;
  interactive: WorkflowInteractiveResponseType;
}): ChatSiteItemType[] => {
  if (interactive.type === 'agentPlanAskQuery') {
    return histories;
  }

  const formatHistories = (() => {
    // 确认 plan 的事件，可以发送 query
    if (interactive.type === 'agentPlanCheck' && interactiveVal !== ConfirmPlanAgentText) {
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
      console.log(finalInteractive);
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

      if (finalInteractive.type === 'agentPlanCheck' && interactiveVal === ConfirmPlanAgentText) {
        return {
          ...val,
          interactive: {
            ...finalInteractive,
            params: {
              ...finalInteractive.params,
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
