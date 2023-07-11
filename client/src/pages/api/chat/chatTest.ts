import type { NextApiRequest, NextApiResponse } from 'next';
import { connectToDatabase } from '@/service/mongo';
import { authUser } from '@/service/utils/auth';
import { sseErrRes } from '@/service/response';
import { sseResponseEventEnum } from '@/constants/chat';
import { sseResponse } from '@/service/utils/tools';
import { type ChatCompletionRequestMessage } from 'openai';
import { AppModuleItemType } from '@/types/app';
import { dispatchModules } from '../openapi/v1/chat/completions2';

export type MessageItemType = ChatCompletionRequestMessage & { _id?: string };
export type Props = {
  history: MessageItemType[];
  prompt: string;
  modules: AppModuleItemType[];
  variable: Record<string, any>;
};
export type ChatResponseType = {
  newChatId: string;
  quoteLen?: number;
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.on('close', () => {
    res.end();
  });
  res.on('error', () => {
    console.log('error: ', 'request error');
    res.end();
  });

  let { modules = [], history = [], prompt, variable = {} } = req.body as Props;

  try {
    if (!history || !modules || !prompt) {
      throw new Error('Prams Error');
    }
    if (!Array.isArray(modules)) {
      throw new Error('history is not array');
    }

    await connectToDatabase();

    /* user auth */
    const { userId } = await authUser({ req });

    /* start process */
    const { responseData } = await dispatchModules({
      res,
      modules: modules,
      variable,
      params: {
        history,
        userChatInput: prompt
      },
      stream: true
    });

    sseResponse({
      res,
      event: sseResponseEventEnum.answer,
      data: '[DONE]'
    });
    sseResponse({
      res,
      event: sseResponseEventEnum.appStreamResponse,
      data: JSON.stringify(responseData)
    });
    res.end();

    // bill
  } catch (err: any) {
    res.status(500);
    sseErrRes(res, err);
    res.end();
  }
}
