import { sseResponseEventEnum, TaskResponseKeyEnum } from '@/constants/chat';
import { sseResponse } from '@/service/utils/tools';
import { textAdaptGptResponse } from '@/utils/adapt';
import type { ModuleDispatchProps } from '@/types/core/chat/type';
export type AnswerProps = ModuleDispatchProps<{
  text: string;
}>;
export type AnswerResponse = {
  [TaskResponseKeyEnum.answerText]: string;
  finish: boolean;
};

export const dispatchAnswer = (props: Record<string, any>): AnswerResponse => {
  const {
    res,
    detail,
    stream,
    inputs: { text = '' }
  } = props as AnswerProps;

  if (stream) {
    sseResponse({
      res,
      event: detail ? sseResponseEventEnum.answer : undefined,
      data: textAdaptGptResponse({
        text
      })
    });
  }

  return {
    [TaskResponseKeyEnum.answerText]: text,
    finish: true
  };
};
