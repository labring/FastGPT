import type { ChatHistoryItemResType } from '@fastgpt/global/core/chat/type';
import { ChatRoleEnum, ChatStatusEnum } from '@fastgpt/global/core/chat/constants';
import {
  extractDeepestInteractive,
  getLastInteractiveValue
} from '@fastgpt/global/core/workflow/runtime/utils';
import type { WorkflowInteractiveResponseType } from '@fastgpt/global/core/workflow/template/system/interactive/type';
import { checkInteractiveResponseStatus } from '@fastgpt/global/core/chat/utils';
import { FlowNodeInputTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { normalizeFormInputResultFile } from '../../../components/FormInputResult';
import type { ChatSiteItemType } from '../type';

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

      // 优先 nodeId 精确匹配；仅一个 submitted 表单时允许 key 交集兜底（覆盖 dataId 漂移）。
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

// 用于判断当前对话框状态。如果是 child interactive，需要递归找到最深层交互。
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

  // 如果用户已经完成选择，则不认为是交互模式，允许发起新一轮对话。
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
          } catch {
            return {};
          }
        })();

        // 更新 inputForm 中的 value。
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
