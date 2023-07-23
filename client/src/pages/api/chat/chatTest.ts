import type { NextApiRequest, NextApiResponse } from 'next';
import { connectToDatabase } from '@/service/mongo';
import { authUser } from '@/service/utils/auth';
import { sseErrRes } from '@/service/response';
import { sseResponseEventEnum } from '@/constants/chat';
import { sseResponse } from '@/service/utils/tools';
import { type ChatCompletionRequestMessage } from 'openai';
import { AppModuleItemType } from '@/types/app';
import { dispatchModules } from '../openapi/v1/chat/completions';
import { gptMessage2ChatType } from '@/utils/adapt';
import { pushTaskBill } from '@/service/events/pushBill';
import { BillSourceEnum } from '@/constants/user';

export type MessageItemType = ChatCompletionRequestMessage & { _id?: string };
export type Props = {
  history: MessageItemType[];
  prompt: string;
  modules: AppModuleItemType[];
  variables: Record<string, any>;
  appId: string;
  appName: string;
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.on('close', () => {
    res.end();
  });
  res.on('error', () => {
    console.log('error: ', 'request error');
    res.end();
  });

  let { modules = [], history = [], prompt, variables = {}, appName, appId } = req.body as Props;
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
      variables,
      params: {
        history: gptMessage2ChatType(history),
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

    pushTaskBill({
      appName,
      appId,
      userId,
      source: BillSourceEnum.fastgpt,
      response: responseData
    });
  } catch (err: any) {
    res.status(500);
    sseErrRes(res, err);
    res.end();
  }
}
