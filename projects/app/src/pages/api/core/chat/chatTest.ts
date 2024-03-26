import type { NextApiRequest, NextApiResponse } from 'next';
import { connectToDatabase } from '@/service/mongo';
import { sseErrRes } from '@fastgpt/service/common/response';
import { SseResponseEventEnum } from '@fastgpt/global/core/module/runtime/constants';
import { responseWrite } from '@fastgpt/service/common/response';
import type { ModuleItemType } from '@fastgpt/global/core/module/type.d';
import { pushChatUsage } from '@/service/support/wallet/usage/push';
import { UsageSourceEnum } from '@fastgpt/global/support/wallet/usage/constants';
import type { ChatItemType, ChatItemValueItemType } from '@fastgpt/global/core/chat/type';
import { authApp } from '@fastgpt/service/support/permission/auth/app';
import { dispatchWorkFlow } from '@fastgpt/service/core/workflow/dispatch';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import { getUserChatInfoAndAuthTeamPoints } from '@/service/support/permission/auth/team';
import { setEntryEntries } from '@fastgpt/service/core/workflow/dispatch/utils';
import { chatValue2RuntimePrompt } from '@fastgpt/global/core/chat/adapt';

export type Props = {
  history: ChatItemType[];
  prompt: ChatItemValueItemType[];
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
    if (!history || !modules || !prompt || prompt.length === 0) {
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

    const { text, files } = chatValue2RuntimePrompt(prompt);

    /* start process */
    const { flowResponses, flowUsages } = await dispatchWorkFlow({
      res,
      mode: 'test',
      teamId,
      tmbId,
      user,
      appId,
      modules: setEntryEntries(modules),
      variables,
      inputFiles: files,
      histories: history,
      startParams: {
        userChatInput: text
      },
      stream: true,
      detail: true,
      maxRunTimes: 200
    });

    responseWrite({
      res,
      event: SseResponseEventEnum.answer,
      data: '[DONE]'
    });
    responseWrite({
      res,
      event: SseResponseEventEnum.flowResponses,
      data: JSON.stringify(flowResponses)
    });
    res.end();

    pushChatUsage({
      appName,
      appId,
      teamId,
      tmbId,
      source: UsageSourceEnum.fastgpt,
      flowUsages
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
