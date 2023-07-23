import { sseResponseEventEnum, TaskResponseKeyEnum } from '@/constants/chat';
import { sseResponse } from '@/service/utils/tools';
import { textAdaptGptResponse } from '@/utils/adapt';
import type { NextApiResponse } from 'next';

export type AnswerProps = {
  res: NextApiResponse;
  text: string;
  stream: boolean;
};
export type AnswerResponse = {
  [TaskResponseKeyEnum.answerText]: string;
};

export const dispatchAnswer = (props: Record<string, any>): AnswerResponse => {
  const { res, text = '', stream } = props as AnswerProps;

  if (stream) {
    sseResponse({
      res,
      event: sseResponseEventEnum.answer,
      data: textAdaptGptResponse({
        text: text.replace(/\\n/g, '\n')
      })
    });
  }

  return {
    [TaskResponseKeyEnum.answerText]: text
  };
};
