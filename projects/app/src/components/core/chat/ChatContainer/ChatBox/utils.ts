import type {
  AIChatItemValueItemType,
  ChatHistoryItemResType,
  ChatItemValueItemType,
  UserChatItemValueItemType
} from '@fastgpt/global/core/chat/type';
import type { ChatSiteItemType } from './type';
import { type ChatBoxInputType, type UserInputFileItemType } from './type';
import { getFileIcon } from '@fastgpt/global/common/file/icon';
import { ChatRoleEnum, ChatStatusEnum } from '@fastgpt/global/core/chat/constants';
import {
  extractDeepestInteractive,
  getLastInteractiveValue
} from '@fastgpt/global/core/workflow/runtime/utils';
import type { WorkflowInteractiveResponseType } from '@fastgpt/global/core/workflow/template/system/interactive/type';
import {
  checkInteractiveResponseStatus,
  mergeChatResponseData
} from '@fastgpt/global/core/chat/utils';
import { FlowNodeInputTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { normalizeFormInputResultFile } from '../../components/FormInputResult';

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

export const shouldResetResumeAiPlaceholder = ({
  hasPreparedResumeAiRecord,
  hasReceivedResumeOutput
}: {
  hasPreparedResumeAiRecord: boolean;
  hasReceivedResumeOutput: boolean;
}) => !hasPreparedResumeAiRecord && !hasReceivedResumeOutput;

export const shouldReplaceResumeAiValue = ({
  hasExistingAiOutput,
  text,
  resetExistingValue
}: {
  hasExistingAiOutput: boolean;
  text: string;
  resetExistingValue?: boolean;
}) => !hasExistingAiOutput && (!!text || !!resetExistingValue);

export const mergeResumeCompletedChatRecords = ({
  currentRecords,
  completedRecords,
  responseChatId
}: {
  currentRecords: ChatSiteItemType[];
  completedRecords: ChatSiteItemType[];
  responseChatId: string;
}) => {
  const currentAiRecordMap = new Map(
    currentRecords
      .filter(
        (item): item is Extract<ChatSiteItemType, { obj: ChatRoleEnum.AI }> =>
          item.obj === ChatRoleEnum.AI && !!item.dataId
      )
      .map((item) => [item.dataId as string, item])
  );
  const currentAiRecord = currentAiRecordMap.get(responseChatId);
  const resumedResponseData = currentAiRecord?.responseData;
  const hasCurrentInteractive = Array.from(currentAiRecordMap.values()).some((record) =>
    record.value.some((value) => value.interactive)
  );
  if (!resumedResponseData?.length && !hasCurrentInteractive) {
    return completedRecords;
  }

  return completedRecords.map((item) => {
    if (item.obj !== ChatRoleEnum.AI) return item;
    const matchedCurrentAiRecord = item.dataId ? currentAiRecordMap.get(item.dataId) : undefined;
    const shouldMergeResponseData = item.dataId === responseChatId;
    const currentValuesForInteractiveMerge = matchedCurrentAiRecord
      ? matchedCurrentAiRecord.value
      : Array.from(currentAiRecordMap.values()).flatMap((record) => record.value);

    if (!currentValuesForInteractiveMerge.length && !shouldMergeResponseData) return item;

    const mergedResponseData =
      shouldMergeResponseData && resumedResponseData?.length
        ? mergeChatResponseData([
            ...(item.responseData || []),
            ...(resumedResponseData.filter(
              (resumedItem) =>
                !item.responseData?.some((completedItem) =>
                  areSameChatResponseDataItem(completedItem, resumedItem)
                )
            ) || [])
          ])
        : item.responseData;

    return {
      ...item,
      value: mergeSubmittedInteractiveValues({
        completedValues: item.value,
        currentValues: currentValuesForInteractiveMerge
      }),
      responseData: mergedResponseData
    };
  });
};

const areSameChatResponseDataItem = (a: ChatHistoryItemResType, b: ChatHistoryItemResType) =>
  a.id === b.id && a.nodeId === b.nodeId;

const areSameInteractive = (
  a: WorkflowInteractiveResponseType,
  b: WorkflowInteractiveResponseType
) => {
  const finalA = extractDeepestInteractive(a);
  const finalB = extractDeepestInteractive(b);

  return (
    finalA.type === finalB.type &&
    (finalA.usageId === finalB.usageId || isSameArray(finalA.entryNodeIds, finalB.entryNodeIds))
  );
};

const mergeSubmittedInteractiveValues = ({
  completedValues,
  currentValues
}: {
  completedValues: AIChatItemValueItemType[];
  currentValues: AIChatItemValueItemType[];
}) => {
  const currentSubmittedInteractives = currentValues
    .map((value) => value.interactive)
    .filter((interactive): interactive is WorkflowInteractiveResponseType => {
      if (!interactive) return false;

      const finalInteractive = extractDeepestInteractive(interactive);
      return finalInteractive.type === 'userInput' && !!finalInteractive.params.submitted;
    });

  if (!currentSubmittedInteractives.length) return completedValues;

  let hasUpdated = false;
  const nextValues = completedValues.map((value) => {
    if (!value.interactive) return value;

    const finalInteractive = extractDeepestInteractive(value.interactive);
    if (finalInteractive.type !== 'userInput') {
      return value;
    }

    const currentInteractive = currentSubmittedInteractives.find((interactive) =>
      areSameInteractive(interactive, value.interactive!)
    );
    if (!currentInteractive) return value;

    hasUpdated = true;
    return {
      ...value,
      interactive: currentInteractive
    };
  });

  return hasUpdated ? nextValues : completedValues;
};

export const shouldAppendResumeInteractive = ({
  existingValues,
  incomingInteractive
}: {
  existingValues: AIChatItemValueItemType[];
  incomingInteractive: WorkflowInteractiveResponseType;
}) => {
  const incomingFinalInteractive = extractDeepestInteractive(incomingInteractive);
  const lastExistingInteractive = existingValues[existingValues.length - 1]?.interactive;

  if (!lastExistingInteractive) return true;

  const existingFinalInteractive = extractDeepestInteractive(lastExistingInteractive);
  const isSameInteractive =
    existingFinalInteractive.type === incomingFinalInteractive.type &&
    (existingFinalInteractive.usageId === incomingFinalInteractive.usageId ||
      isSameArray(existingFinalInteractive.entryNodeIds, incomingFinalInteractive.entryNodeIds));

  if (!isSameInteractive) return true;

  return !(
    existingFinalInteractive.type === 'userInput' && existingFinalInteractive.params.submitted
  );
};

export const refreshSubmittedFormInteractiveValues = ({
  histories,
  nodeResponse
}: {
  histories: ChatSiteItemType[];
  nodeResponse: ChatHistoryItemResType;
}): ChatSiteItemType[] => {
  const formInputResult = nodeResponse.formInputResult;
  if (!formInputResult || typeof formInputResult !== 'object' || Array.isArray(formInputResult)) {
    return histories;
  }

  const formInputValueMap = formInputResult as Record<string, unknown>;
  const formInputKeys = Object.keys(formInputValueMap);
  const submittedFormInteractiveCount = histories.reduce((count, history) => {
    if (history.obj !== ChatRoleEnum.AI) return count;

    return (
      count +
      history.value.filter((value) => {
        if (!value.interactive) return false;
        const finalInteractive = extractDeepestInteractive(value.interactive);
        return finalInteractive.type === 'userInput' && !!finalInteractive.params.submitted;
      }).length
    );
  }, 0);
  let hasUpdated = false;

  const nextHistories = histories.map((history) => {
    if (history.obj !== ChatRoleEnum.AI) return history;

    const nextValues = history.value.map((value) => {
      if (!value.interactive) return value;

      const finalInteractive = extractDeepestInteractive(value.interactive);
      if (finalInteractive.type !== 'userInput') {
        return value;
      }
      if (!finalInteractive.params.submitted) return value;

      const matchedByNodeId = finalInteractive.entryNodeIds?.includes(nodeResponse.nodeId);
      const matchedByOnlySubmittedForm =
        submittedFormInteractiveCount === 1 &&
        finalInteractive.params.inputForm.some((input) => formInputKeys.includes(input.key));
      if (!matchedByNodeId && !matchedByOnlySubmittedForm) return value;

      const nextInputForm = finalInteractive.params.inputForm.map((input) => {
        if (!(input.key in formInputValueMap)) return input;

        const nextValue = (() => {
          const responseValue = formInputValueMap[input.key];
          if (input.type !== FlowNodeInputTypeEnum.fileSelect || !Array.isArray(responseValue)) {
            return responseValue;
          }

          return responseValue
            .map(normalizeFormInputResultFile)
            .filter((file): file is NonNullable<ReturnType<typeof normalizeFormInputResultFile>> =>
              Boolean(file)
            );
        })();

        hasUpdated = true;
        return {
          ...input,
          value: nextValue
        };
      });

      return {
        ...value,
        interactive: {
          ...finalInteractive,
          params: {
            ...finalInteractive.params,
            inputForm: nextInputForm,
            submitted: true
          }
        }
      };
    });

    return {
      ...history,
      value: nextValues
    };
  });

  return hasUpdated ? nextHistories : histories;
};

const isSameArray = (a?: string[], b?: string[]) => {
  if (!a?.length || !b?.length || a.length !== b.length) return false;
  return a.every((item, index) => item === b[index]);
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
  } else if (finalInteractive.type === 'agentPlanAskQuery') {
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
  const status = checkInteractiveResponseStatus({
    interactive,
    input: interactiveVal
  });

  const formatHistories = (() => {
    if (status === 'query') {
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
        const submittedData: Record<string, any> = (() => {
          try {
            return JSON.parse(interactiveVal);
          } catch (error) {
            return {};
          }
        })();

        // 更新 inputForm 中的 value
        const updatedInputForm = finalInteractive.params.inputForm.map((item) => ({
          ...item,
          value: submittedData[item.key] ?? item.value
        }));

        return {
          ...val,
          interactive: {
            ...finalInteractive,
            params: {
              ...finalInteractive.params,
              inputForm: updatedInputForm,
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
