import type { NextApiRequest, NextApiResponse } from 'next';
import { authApp } from '@/service/support/permission/auth/app';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import { sseErrRes, jsonRes } from '@fastgpt/service/common/response';
import { addLog } from '@fastgpt/service/common/mongo/controller';
import { withNextCors } from '@fastgpt/service/common/middle/cors';
import { ChatRoleEnum, ChatSourceEnum } from '@fastgpt/global/core/chat/constants';
import { sseResponseEventEnum } from '@fastgpt/service/common/response/constant';
import { dispatchModules } from '@/service/moduleDispatch';
import type { CreateChatCompletionRequest } from '@fastgpt/global/core/ai/type.d';
import type { MessageItemType } from '@/types/core/chat/type';
import { gptMessage2ChatType, textAdaptGptResponse } from '@/utils/adapt';
import { getChatHistory } from './getHistory';
import { saveChat } from '@/service/utils/chat/saveChat';
import { responseWrite } from '@fastgpt/service/common/response';
import { pushChatBill } from '@/service/support/wallet/bill/push';
import { BillSourceEnum } from '@fastgpt/global/support/wallet/bill/constants';
import { authOutLinkChat } from '@fastgpt/service/support/outLink/auth';
import { pushResult2Remote, updateOutLinkUsage } from '@fastgpt/service/support/outLink/tools';
import requestIp from 'request-ip';

import { selectShareResponse } from '@/utils/service/core/chat';
import { updateApiKeyUsage } from '@fastgpt/service/support/openapi/tools';
import { connectToDatabase } from '@/service/mongo';
import { authBalance, authUser } from '@/service/support/permission/auth/user';

type FastGptWebChatProps = {
  chatId?: string; // undefined: nonuse history, '': new chat, 'xxxxx': use history
  appId?: string;
};
type FastGptShareChatProps = {
  shareId?: string;
  authToken?: string;
};
export type Props = CreateChatCompletionRequest &
  FastGptWebChatProps &
  FastGptShareChatProps & {
    messages: MessageItemType[];
    stream?: boolean;
    detail?: boolean;
    variables: Record<string, any>;
  };
export type ChatResponseType = {
  newChatId: string;
  quoteLen?: number;
};

export default withNextCors(async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.on('close', () => {
    res.end();
  });
  res.on('error', () => {
    console.log('error: ', 'request error');
    res.end();
  });

  let {
    chatId,
    appId,
    shareId,
    authToken,
    stream = false,
    detail = false,
    messages = [],
    variables = {}
  } = req.body as Props;

  try {
    await connectToDatabase();
    // body data check
    if (!messages) {
      throw new Error('Prams Error');
    }
    if (!Array.isArray(messages)) {
      throw new Error('messages is not array');
    }
    if (messages.length === 0) {
      throw new Error('messages is empty');
    }

    let startTime = Date.now();

    /*  parse user cert */
    let { responseDetail, user, authType, apikey } = await (async () => {
      if (shareId) {
        const { userId, tmbId, authType, responseDetail } = await authOutLinkChat({
          shareId,
          ip: requestIp.getClientIp(req),
          authToken,
          question:
            (messages[messages.length - 2]?.role === 'user'
              ? messages[messages.length - 2].content
              : messages[messages.length - 1]?.content) || ''
        });
        // auth balance
        const user = await authBalance({ userId, tmbId, minBalance: 0 });
        return {
          user,
          responseDetail,
          apikey: '',
          authType
        };
      }
      const [{ user }, { apikey, authType }] = await Promise.all([
        authUser({ req, authToken: true, authApiKey: true, minBalance: 0 }),
        authCert({
          req,
          authToken: true,
          authApiKey: true
        })
      ]);
      return {
        user,
        responseDetail: detail,
        apikey,
        authType
      };
    })();

    // auth app, get history
    const [{ app, canWrite }, { history }] = await Promise.all([
      authApp({
        req,
        authToken: true,
        authApiKey: true,
        appId: appId || '',
        per: 'r'
      }),
      getChatHistory({ chatId, tmbId: user.team.tmbId })
    ]);

    const isOwner = !shareId && String(user.team.tmbId) === String(app.tmbId);
    responseDetail = isOwner || responseDetail;

    /* format prompts */
    const prompts = history.concat(gptMessage2ChatType(messages));
    if (prompts[prompts.length - 1]?.obj === 'AI') {
      prompts.pop();
    }
    // user question
    const prompt = prompts.pop();
    if (!prompt) {
      throw new Error('Question is empty');
    }

    // set sse response headers
    if (stream) {
      res.setHeader('Content-Type', 'text/event-stream;charset=utf-8');
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('X-Accel-Buffering', 'no');
      res.setHeader('Cache-Control', 'no-cache, no-transform');
    }

    /* start flow controller */
    const { responseData, answerText } = await dispatchModules({
      res,
      modules: app.modules,
      user,
      teamId: user.team.teamId,
      tmbId: user.team.tmbId,
      variables,
      params: {
        history: prompts,
        userChatInput: prompt.value
      },
      stream,
      detail
    });

    // save chat
    if (chatId) {
      await saveChat({
        chatId,
        appId: app._id,
        teamId: user.team.teamId,
        tmbId: user.team.tmbId,
        variables,
        isOwner, // owner update use time
        shareId,
        source: (() => {
          if (shareId) {
            return ChatSourceEnum.share;
          }
          if (authType === 'apikey') {
            return ChatSourceEnum.api;
          }
          return ChatSourceEnum.online;
        })(),
        content: [
          prompt,
          {
            dataId: messages[messages.length - 1].dataId,
            obj: ChatRoleEnum.AI,
            value: answerText,
            responseData
          }
        ]
      });
    }

    addLog.info(`completions running time: ${(Date.now() - startTime) / 1000}s`);

    /* select fe response field */
    const feResponseData = canWrite ? responseData : selectShareResponse({ responseData });

    if (stream) {
      responseWrite({
        res,
        event: detail ? sseResponseEventEnum.answer : undefined,
        data: textAdaptGptResponse({
          text: null,
          finish_reason: 'stop'
        })
      });
      responseWrite({
        res,
        event: detail ? sseResponseEventEnum.answer : undefined,
        data: '[DONE]'
      });

      if (responseDetail && detail) {
        responseWrite({
          res,
          event: sseResponseEventEnum.appStreamResponse,
          data: JSON.stringify(feResponseData)
        });
      }

      res.end();
    } else {
      res.json({
        ...(detail ? { responseData: feResponseData } : {}),
        id: chatId || '',
        model: '',
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 1 },
        choices: [
          {
            message: { role: 'assistant', content: answerText },
            finish_reason: 'stop',
            index: 0
          }
        ]
      });
    }

    // add record
    const { total } = pushChatBill({
      appName: app.name,
      appId: app._id,
      teamId: user.team.teamId,
      tmbId: user.team.tmbId,
      source: (() => {
        if (authType === 'apikey') return BillSourceEnum.api;
        if (shareId) return BillSourceEnum.shareLink;
        return BillSourceEnum.fastgpt;
      })(),
      response: responseData
    });

    if (shareId) {
      pushResult2Remote({ authToken, shareId, responseData });
      updateOutLinkUsage({
        shareId,
        total
      });
    }
    !!apikey &&
      updateApiKeyUsage({
        apikey,
        usage: total
      });
  } catch (err: any) {
    if (stream) {
      sseErrRes(res, err);
      res.end();
    } else {
      jsonRes(res, {
        code: 500,
        error: err
      });
    }
  }
});

export const config = {
  api: {
    responseLimit: '20mb'
  }
};
