import {
  DispatchNodeResponseKeyEnum,
  SseResponseEventEnum
} from '@fastgpt/global/core/workflow/runtime/constants';
import { textAdaptGptResponse } from '@fastgpt/global/core/workflow/runtime/utils';
import type { ModuleDispatchProps } from '@fastgpt/global/core/workflow/runtime/type';
import { NodeOutputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { type DispatchNodeResultType } from '@fastgpt/global/core/workflow/runtime/type';
export type AnswerProps = ModuleDispatchProps<{
  text: string;
}>;
export type AnswerResponse = DispatchNodeResultType<{
  [NodeOutputKeyEnum.answerText]: string;
}>;

export const dispatchAnswer = (props: Record<string, any>): AnswerResponse => {
  const {
    workflowStreamResponse,
    params: { text = '' }
  } = props as AnswerProps;

  const formatText = typeof text === 'string' ? text : JSON.stringify(text, null, 2);
  const responseText = `\n${formatText}`;

  workflowStreamResponse?.({
    event: SseResponseEventEnum.fastAnswer,
    data: textAdaptGptResponse({
      text: responseText
    })
  });

  return {
    data: {
      [NodeOutputKeyEnum.answerText]: responseText
    },
    [DispatchNodeResponseKeyEnum.answerText]: responseText,
    [DispatchNodeResponseKeyEnum.nodeResponse]: {
      textOutput: formatText
    },
    [DispatchNodeResponseKeyEnum.toolResponses]: responseText
  };
};
