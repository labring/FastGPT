import type { NextApiRequest, NextApiResponse } from 'next';
import { connectToDatabase } from '@/service/mongo';
import { authUser } from '@/service/utils/auth';
import { sseErrRes } from '@/service/response';
import { sseResponseEventEnum } from '@/constants/chat';
import { sseResponse } from '@/service/utils/tools';
import { AppModuleItemType } from '@/types/app';
import { dispatchModules } from '@/pages/api/v1/chat/completions';
import { pushChatBill } from '@/service/common/bill/push';
import { BillSourceEnum } from '@/constants/user';
import { ChatItemType } from '@/types/chat';

export type Props = {
  history: ChatItemType[];
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
    const { userId, user } = await authUser({ req, authToken: true, authBalance: true });

    if (!user) {
      throw new Error('user not found');
    }

    /* start process */
    const { responseData } = await dispatchModules({
      res,
      modules: modules,
      variables,
      user,
      params: {
        history,
        userChatInput: prompt
      },
      stream: true,
      detail: true
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

    pushChatBill({
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

export const config = {
  api: {
    responseLimit: '20mb'
  }
};
