import type { NextApiRequest, NextApiResponse } from 'next';
import { connectToDatabase } from '@/service/mongo';
import { sseErrRes } from '@fastgpt/service/common/response';
import { sseResponseEventEnum } from '@fastgpt/service/common/response/constant';
import { responseWrite } from '@fastgpt/service/common/response';
import type { ModuleItemType } from '@fastgpt/global/core/module/type.d';
import { pushChatUsage } from '@/service/support/wallet/usage/push';
import { UsageSourceEnum } from '@fastgpt/global/support/wallet/usage/constants';
import type { ChatItemType } from '@fastgpt/global/core/chat/type';
import { authApp } from '@fastgpt/service/support/permission/auth/app';
import { dispatchModules } from '@/service/moduleDispatch';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import { getUserChatInfoAndAuthTeamPoints } from '@/service/support/permission/auth/team';

export type Props = {
  history: ChatItemType[];
  prompt: string;
  modules: ModuleItemType[];
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
    await connectToDatabase();
    if (!history || !modules || !prompt) {
      throw new Error('Prams Error');
    }
    if (!Array.isArray(modules)) {
      throw new Error('history is not array');
    }

    /* user auth */
    const [_, { teamId, tmbId }] = await Promise.all([
      authApp({ req, authToken: true, appId, per: 'r' }),
      authCert({
        req,
        authToken: true
      })
    ]);

    // auth balance
    const { user } = await getUserChatInfoAndAuthTeamPoints(tmbId);

    /* start process */
    const { responseData, moduleDispatchBills } = await dispatchModules({
      res,
      mode: 'test',
      teamId,
      tmbId,
      user,
      appId,
      modules,
      variables,
      histories: history,
      startParams: {
        userChatInput: prompt
      },
      stream: true,
      detail: true
    });

    responseWrite({
      res,
      event: sseResponseEventEnum.answer,
      data: '[DONE]'
    });
    responseWrite({
      res,
      event: sseResponseEventEnum.appStreamResponse,
      data: JSON.stringify(responseData)
    });
    res.end();

    pushChatUsage({
      appName,
      appId,
      teamId,
      tmbId,
      source: UsageSourceEnum.fastgpt,
      moduleDispatchBills
    });
  } catch (err: any) {
    res.status(500);
    sseErrRes(res, err);
    res.end();
  }
}

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '10mb'
    },
    responseLimit: '20mb'
  }
};
