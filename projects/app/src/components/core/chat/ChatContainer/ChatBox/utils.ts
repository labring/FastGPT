import type {
  AIChatItemValueItemType,
  ChatHistoryItemResType,
  ChatItemValueItemType,
  UserChatItemValueItemType
} from '@fastgpt/global/core/chat/type';
import type { ChatSiteItemType } from './type';
import { type ChatBoxInputType, type UserInputFileItemType } from './type';
import { getFileIcon } from '@fastgpt/global/common/file/icon';
import {
  ChatFileTypeEnum,
  ChatRoleEnum,
  ChatStatusEnum
} from '@fastgpt/global/core/chat/constants';
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

export const getUploadChatFileType = (file: File) => {
  if (file.type.includes('image')) return ChatFileTypeEnum.image;
  if (file.type.includes('audio')) return ChatFileTypeEnum.audio;
  if (file.type.includes('video')) return ChatFileTypeEnum.video;
  return ChatFileTypeEnum.file;
};

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

/**
 * 判断是否应清空恢复流开始前的 AI 占位内容。
 * 仅在「尚未准备 resume AI record」且「尚未收到任何 resume 输出」时重置，
 * 避免恢复过程中误清已 replay 的流式文本或交互状态。
 */
export const shouldResetResumeAiPlaceholder = ({
  hasPreparedResumeAiRecord,
  hasReceivedResumeOutput
}: {
  hasPreparedResumeAiRecord: boolean;
  hasReceivedResumeOutput: boolean;
}) => !hasPreparedResumeAiRecord && !hasReceivedResumeOutput;

/**
 * 判断是否用 resume 占位内容覆盖当前 AI record 的 value。
 * 已有真实 AI 输出时不覆盖；空 record 时可写入「停止中」等提示或占位标记。
 */
export const shouldReplaceResumeAiValue = ({
  hasExistingAiOutput,
  text,
  resetExistingValue
}: {
  hasExistingAiOutput: boolean;
  text: string;
  resetExistingValue?: boolean;
}) => !hasExistingAiOutput && (!!text || !!resetExistingValue);

/**
 * 恢复流结束时，用 completed records 覆盖当前聊天记录，同时保留恢复过程中的中间状态。
 *
 * 覆盖 completed records 会丢失两类恢复期间才存在的数据：
 * 1. 当前 streaming AI record 上 replay 出来的 `responseData`（含 `formInputResult`）；
 * 2. 已提交 `userInput` 交互节点里经 {@link refreshSubmittedFormInteractiveValues} 回填的 `inputForm.value`。
 *
 * 合并策略：
 * - `responseData`：仅对 `dataId === responseChatId` 的 AI 消息，把 current 中多出的节点响应追加进去（去重）；
 * - 交互值：优先按 `dataId` 匹配 current AI record；匹配不到时，从所有 current AI record 中
 *   按 {@link areSameInteractive} 身份规则寻找已提交交互并覆盖 completed 里的空值。
 *
 * 若 current 侧既无 replay `responseData` 也无交互态，直接返回 completed records，避免无意义遍历。
 */
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

/** 判断两个交互是否为同一轮工作流交互（比较最内层 interactive，而非 child 包装层）。 */
const areSameInteractive = (
  a: WorkflowInteractiveResponseType,
  b: WorkflowInteractiveResponseType
) => {
  const finalA = extractDeepestInteractive(a);
  const finalB = extractDeepestInteractive(b);

  return (
    finalA.type === finalB.type &&
    // 同一轮交互：usageId 相同，或 entryNodeIds 数组完全一致（dataId 变化时仍视为同一表单）
    (finalA.usageId === finalB.usageId || isSameArray(finalA.entryNodeIds, finalB.entryNodeIds))
  );
};

/**
 * 将 current 侧已提交的 `userInput` 交互写回 completed 侧同身份交互节点。
 * completed record 持久化后 `inputForm.value` 可能为空（尤其 fileSelect URL 数组），
 * 而恢复流 replay 期间已在 current record 中 hydrate 过，此处防止覆盖时丢失。
 */
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

/**
 * 恢复流 replay 交互节点时，判断是否应 append 到 AI record.value。
 *
 * 核心约束：若 existing 中已有同一身份且已 submitted 的 `userInput`，
 * 则跳过 incoming 的未提交副本，避免空表单覆盖已回填的文件/字段值。
 * 不同身份交互，或同身份但 existing 尚未 submitted（例如中间插入了确认文本），仍允许 append。
 */
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

/**
 * 恢复流收到 `flowNodeResponse` 且带 `formInputResult` 时，把节点结果写回已提交的表单交互节点。
 *
 * 匹配目标交互节点（二者满足其一即可）：
 * 1. `entryNodeIds` 包含 `nodeResponse.nodeId`；
 * 2. 全历史仅有一个 submitted 表单交互，且其字段 key 与 `formInputResult` 有交集（dataId 变化时的兜底）。
 *
 * `fileSelect` 字段会把 URL 字符串数组归一化为 `{ name, url }[]`（复用 `normalizeFormInputResultFile`）。
 * 无任何字段更新时返回原 `histories` 引用，避免触发多余渲染。
 */
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

      // 优先 nodeId 精确匹配；仅一个 submitted 表单时允许 key 交集兜底（覆盖 dataId 漂移）
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
