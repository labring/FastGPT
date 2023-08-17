import { sseResponseEventEnum, TaskResponseKeyEnum } from '@/constants/chat';
import { sseResponse } from '@/service/utils/tools';
import { textAdaptGptResponse } from '@/utils/adapt';
import type { NextApiResponse } from 'next';

export type AnswerProps = {
  res: NextApiResponse;
  detail?: boolean;
  text: string;
  stream: boolean;
};
export type AnswerResponse = {
  [TaskResponseKeyEnum.answerText]: string;
  finish: boolean;
};

export const dispatchAnswer = (props: Record<string, any>): AnswerResponse => {
  const { res, detail, text = '', stream } = props as AnswerProps;

  if (stream) {
    sseResponse({
      res,
      event: detail ? sseResponseEventEnum.answer : undefined,
      data: textAdaptGptResponse({
        text: text.replace(/\\n/g, '\n')
      })
    });
  }

  return {
    [TaskResponseKeyEnum.answerText]: text,
    finish: true
  };
};
