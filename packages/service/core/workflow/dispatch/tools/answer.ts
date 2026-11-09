import { DispatchNodeResponseKeyEnum } from '@fastgpt/global/core/workflow/runtime/constants';
import { workflowSseEvent } from '@fastgpt/global/core/workflow/runtime/sse';

import { NodeOutputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import type { DispatchNodeResultType, ModuleDispatchProps } from '../../types/runtime';
import { checkOutputTextModeration } from '../../../plugin/moderation/output';
import { getNodeErrResponse } from '../utils';
import { getDispatchModerationContext } from '../utils/runtime';
import { MODERATION_BLOCKED_ERROR_MESSAGE } from '@fastgpt/global/core/plugin/moderation/constants';
export type AnswerProps = ModuleDispatchProps<{
  text: string;
}>;
export type AnswerResponse = DispatchNodeResultType<{
  [NodeOutputKeyEnum.answerText]: string;
}>;

export const dispatchAnswer = async (props: Record<string, any>): Promise<AnswerResponse> => {
  const {
    workflowStreamResponse,
    runningUserInfo,
    runningAppInfo,
    chatId,
    responseChatItemId,
    node,
    params: { text = '' }
  } = props as AnswerProps;

  const formatText = typeof text === 'string' ? text : JSON.stringify(text, null, 2);
  const responseText = `\n${formatText}`;

  // 锚点 3：指定回复（answerNode）面向用户输出检查
  const check = await checkOutputTextModeration({
    text: formatText,
    targetField: 'answerNode',
    context: getDispatchModerationContext(props)
  });

  if (!check.isPass) {
    return getNodeErrResponse({
      error: check.blockErrorMessage || MODERATION_BLOCKED_ERROR_MESSAGE
    });
  }

  workflowStreamResponse?.(workflowSseEvent.fastAnswerDelta(responseText));

  return {
    data: {
      [NodeOutputKeyEnum.answerText]: responseText
    },
    [DispatchNodeResponseKeyEnum.answerText]: responseText,
    [DispatchNodeResponseKeyEnum.nodeResponse]: {
      textOutput: formatText
    },
    [DispatchNodeResponseKeyEnum.toolResponse]: responseText
  };
};
