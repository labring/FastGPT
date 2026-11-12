import { DispatchNodeResponseKeyEnum } from '@fastgpt/global/core/workflow/runtime/constants';
import { workflowSseEvent } from '@fastgpt/global/core/workflow/runtime/sse';
import { getWorkflowContext } from '../context';

import { NodeOutputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import type { DispatchNodeResultType, ModuleDispatchProps } from '../../types/runtime';
export type AnswerProps = ModuleDispatchProps<{
  text: string;
}>;
export type AnswerResponse = DispatchNodeResultType<{
  [NodeOutputKeyEnum.answerText]: string;
}>;

export const dispatchAnswer = (props: Record<string, any>): AnswerResponse => {
  const {
    params: { text = '' }
  } = props as AnswerProps;
  const { workflowStreamResponse } = getWorkflowContext();

  const formatText = typeof text === 'string' ? text : JSON.stringify(text, null, 2);
  const responseText = `\n${formatText}`;

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
