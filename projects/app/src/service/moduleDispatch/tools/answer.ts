import { SseResponseEventEnum } from '@fastgpt/global/core/module/runtime/constants';
import { responseWrite } from '@fastgpt/service/common/response';
import { textAdaptGptResponse } from '@fastgpt/global/core/module/runtime/utils';
import type { ModuleDispatchProps } from '@fastgpt/global/core/module/type.d';
import { ModuleOutputKeyEnum } from '@fastgpt/global/core/module/constants';
export type AnswerProps = ModuleDispatchProps<{
  text: string;
}>;
export type AnswerResponse = {
  [ModuleOutputKeyEnum.answerText]: string;
};

export const dispatchAnswer = (props: Record<string, any>): AnswerResponse => {
  const {
    res,
    detail,
    stream,
    params: { text = '' }
  } = props as AnswerProps;

  const formatText = typeof text === 'string' ? text : JSON.stringify(text, null, 2);

  if (stream) {
    responseWrite({
      res,
      event: detail ? SseResponseEventEnum.fastAnswer : undefined,
      data: textAdaptGptResponse({
        text: `\n${formatText}`
      })
    });
  }

  return {
    [ModuleOutputKeyEnum.answerText]: formatText
  };
};
