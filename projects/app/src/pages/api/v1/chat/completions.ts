import type { NextApiRequest, NextApiResponse } from 'next';
import { authApp } from '@fastgpt/service/support/permission/auth/app';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import { sseErrRes, jsonRes } from '@fastgpt/service/common/response';
import { addLog } from '@fastgpt/service/common/system/log';
import { withNextCors } from '@fastgpt/service/common/middle/cors';
import { ChatRoleEnum, ChatSourceEnum } from '@fastgpt/global/core/chat/constants';
import { SseResponseEventEnum } from '@fastgpt/global/core/module/runtime/constants';
import { dispatchWorkFlow } from '@fastgpt/service/core/workflow/dispatch';
import type { ChatCompletionCreateParams } from '@fastgpt/global/core/ai/type.d';
import type { ChatCompletionMessageParam } from '@fastgpt/global/core/ai/type.d';
import { textAdaptGptResponse } from '@fastgpt/global/core/module/runtime/utils';
import { GPTMessages2Chats, chatValue2RuntimePrompt } from '@fastgpt/global/core/chat/adapt';
import { getChatItems } from '@fastgpt/service/core/chat/controller';
import { saveChat } from '@/service/utils/chat/saveChat';
import { responseWrite } from '@fastgpt/service/common/response';
import { pushChatUsage } from '@/service/support/wallet/usage/push';
import { authOutLinkChatStart } from '@/service/support/permission/auth/outLink';
import { pushResult2Remote, addOutLinkUsage } from '@fastgpt/service/support/outLink/tools';
import requestIp from 'request-ip';
import { getUsageSourceByAuthType } from '@fastgpt/global/support/wallet/usage/tools';
import { authTeamSpaceToken } from '@/service/support/permission/auth/team';
import { filterPublicNodeResponseData } from '@fastgpt/global/core/chat/utils';
import { updateApiKeyUsage } from '@fastgpt/service/support/openapi/tools';
import { connectToDatabase } from '@/service/mongo';
import { getUserChatInfoAndAuthTeamPoints } from '@/service/support/permission/auth/team';
import { AuthUserTypeEnum } from '@fastgpt/global/support/permission/constant';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { UserModelSchema } from '@fastgpt/global/support/user/type';
import { AppSchema } from '@fastgpt/global/core/app/type';
import { AuthOutLinkChatProps } from '@fastgpt/global/support/outLink/api';
import { MongoChat } from '@fastgpt/service/core/chat/chatSchema';
import { ChatErrEnum } from '@fastgpt/global/common/error/code/chat';
import { OutLinkChatAuthProps } from '@fastgpt/global/support/permission/chat';
import { setEntryEntries } from '@fastgpt/service/core/workflow/dispatch/utils';
import { UserChatItemType } from '@fastgpt/global/core/chat/type';
import { DispatchNodeResponseKeyEnum } from '@fastgpt/global/core/module/runtime/constants';

type FastGptWebChatProps = {
  chatId?: string; // undefined: nonuse history, '': new chat, 'xxxxx': use history
  appId?: string;
};

export type Props = ChatCompletionCreateParams &
  FastGptWebChatProps &
  OutLinkChatAuthProps & {
    messages: ChatCompletionMessageParam[];
    stream?: boolean;
    detail?: boolean;
    variables: Record<string, any>;
  };
export type ChatResponseType = {
  newChatId: string;
  quoteLen?: number;
};

type AuthResponseType = {
  teamId: string;
  tmbId: string;
  user: UserModelSchema;
  app: AppSchema;
  responseDetail?: boolean;
  authType: `${AuthUserTypeEnum}`;
  apikey?: string;
  canWrite: boolean;
  outLinkUserId?: string;
};

export default withNextCors(async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.on('close', () => {
    res.end();
  });
  res.on('error', () => {
    console.log('error: ', 'request error');
    res.end();
  });

  const {
    chatId,
    appId,
    // share chat
    shareId,
    outLinkUid,
    // team chat
    teamId: spaceTeamId,
    teamToken,
    stream = false,
    detail = false,
    messages = [],
    variables = {}
  } = req.body as Props;
  try {
    const originIp = requestIp.getClientIp(req);

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

    const chatMessages = GPTMessages2Chats(messages);
    if (chatMessages[chatMessages.length - 1].obj !== ChatRoleEnum.Human) {
      chatMessages.pop();
    }

    // user question
    const question = chatMessages.pop() as UserChatItemType;
    if (!question) {
      throw new Error('Question is empty');
    }

    const { text, files } = chatValue2RuntimePrompt(question.value);

    /* 
      1. auth app permission
      2. auth balance
      3. get app
      4. parse outLink token
    */
    const { teamId, tmbId, user, app, responseDetail, authType, apikey, canWrite, outLinkUserId } =
      await (async () => {
        // share chat
        if (shareId && outLinkUid) {
          return authShareChat({
            shareId,
            outLinkUid,
            chatId,
            ip: originIp,
            question: text
          });
        }
        // team space chat
        if (spaceTeamId && appId && teamToken) {
          return authTeamSpaceChat({
            teamId: spaceTeamId,
            teamToken,
            appId,
            chatId
          });
        }

        /* parse req: api or token */
        return authHeaderRequest({
          req,
          appId,
          chatId,
          detail
        });
      })();

    // get and concat history
    const { history } = await getChatItems({
      appId: app._id,
      chatId,
      limit: 30,
      field: `dataId obj value`
    });
    const concatHistories = history.concat(chatMessages);
    const responseChatItemId: string | undefined = messages[messages.length - 1].dataId;

    /* start flow controller */
    const { flowResponses, flowUsages, assistantResponses } = await dispatchWorkFlow({
      res,
      mode: 'chat',
      user,
      teamId: String(teamId),
      tmbId: String(tmbId),
      appId: String(app._id),
      chatId,
      responseChatItemId,
      modules: setEntryEntries(app.modules),
      variables,
      inputFiles: files,
      histories: concatHistories,
      startParams: {
        userChatInput: text
      },
      stream,
      detail,
      maxRunTimes: 200
    });

    // save chat
    if (chatId) {
      const isOwnerUse = !shareId && !spaceTeamId && String(tmbId) === String(app.tmbId);
      await saveChat({
        chatId,
        appId: app._id,
        teamId,
        tmbId: tmbId,
        variables,
        updateUseTime: isOwnerUse, // owner update use time
        shareId,
        outLinkUid: outLinkUserId,
        source: (() => {
          if (shareId) {
            return ChatSourceEnum.share;
          }
          if (authType === 'apikey') {
            return ChatSourceEnum.api;
          }
          if (spaceTeamId) {
            return ChatSourceEnum.team;
          }
          return ChatSourceEnum.online;
        })(),
        content: [
          question,
          {
            dataId: responseChatItemId,
            obj: ChatRoleEnum.AI,
            value: assistantResponses,
            [DispatchNodeResponseKeyEnum.nodeResponse]: flowResponses
          }
        ],
        metadata: {
          originIp
        }
      });
    }

    addLog.info(`completions running time: ${(Date.now() - startTime) / 1000}s`);

    /* select fe response field */
    const feResponseData = canWrite
      ? flowResponses
      : filterPublicNodeResponseData({ flowResponses });

    if (stream) {
      responseWrite({
        res,
        event: detail ? SseResponseEventEnum.answer : undefined,
        data: textAdaptGptResponse({
          text: null,
          finish_reason: 'stop'
        })
      });
      responseWrite({
        res,
        event: detail ? SseResponseEventEnum.answer : undefined,
        data: '[DONE]'
      });

      if (responseDetail && detail) {
        responseWrite({
          res,
          event: SseResponseEventEnum.flowResponses,
          data: JSON.stringify(feResponseData)
        });
      }

      res.end();
    } else {
      const responseContent = (() => {
        if (assistantResponses.length === 0) return '';
        if (assistantResponses.length === 1 && assistantResponses[0].text?.content)
          return assistantResponses[0].text?.content;
        return assistantResponses;
      })();
      res.json({
        ...(detail ? { responseData: feResponseData } : {}),
        id: chatId || '',
        model: '',
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 1 },
        choices: [
          {
            message: { role: 'assistant', content: responseContent },
            finish_reason: 'stop',
            index: 0
          }
        ]
      });
    }

    // add record
    const { totalPoints } = pushChatUsage({
      appName: app.name,
      appId: app._id,
      teamId,
      tmbId: tmbId,
      source: getUsageSourceByAuthType({ shareId, authType }),
      flowUsages
    });

    if (shareId) {
      pushResult2Remote({ outLinkUid, shareId, appName: app.name, flowResponses });
      addOutLinkUsage({
        shareId,
        totalPoints
      });
    }
    if (apikey) {
      updateApiKeyUsage({
        apikey,
        totalPoints
      });
    }
  } catch (err) {
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

const authShareChat = async ({
  chatId,
  ...data
}: AuthOutLinkChatProps & {
  shareId: string;
  chatId?: string;
}): Promise<AuthResponseType> => {
  const { teamId, tmbId, user, appId, authType, responseDetail, uid } =
    await authOutLinkChatStart(data);
  const app = await MongoApp.findById(appId).lean();

  if (!app) {
    return Promise.reject('app is empty');
  }

  // get chat
  const chat = await MongoChat.findOne({ appId, chatId }).lean();
  if (chat && (chat.shareId !== data.shareId || chat.outLinkUid !== uid)) {
    return Promise.reject(ChatErrEnum.unAuthChat);
  }

  return {
    teamId,
    tmbId,
    user,
    app,
    responseDetail,
    apikey: '',
    authType,
    canWrite: false,
    outLinkUserId: uid
  };
};
const authTeamSpaceChat = async ({
  appId,
  teamId,
  teamToken,
  chatId
}: {
  appId: string;
  teamId: string;
  teamToken: string;
  chatId?: string;
}): Promise<AuthResponseType> => {
  const { uid } = await authTeamSpaceToken({
    teamId,
    teamToken
  });

  const app = await MongoApp.findById(appId).lean();
  if (!app) {
    return Promise.reject('app is empty');
  }

  const [chat, { user }] = await Promise.all([
    MongoChat.findOne({ appId, chatId }).lean(),
    getUserChatInfoAndAuthTeamPoints(app.tmbId)
  ]);

  if (chat && (String(chat.teamId) !== teamId || chat.outLinkUid !== uid)) {
    return Promise.reject(ChatErrEnum.unAuthChat);
  }

  return {
    teamId,
    tmbId: app.tmbId,
    user,
    app,
    responseDetail: true,
    authType: AuthUserTypeEnum.outLink,
    apikey: '',
    canWrite: false,
    outLinkUserId: uid
  };
};
const authHeaderRequest = async ({
  req,
  appId,
  chatId,
  detail
}: {
  req: NextApiRequest;
  appId?: string;
  chatId?: string;
  detail?: boolean;
}): Promise<AuthResponseType> => {
  const {
    appId: apiKeyAppId,
    teamId,
    tmbId,
    authType,
    apikey,
    canWrite: apiKeyCanWrite
  } = await authCert({
    req,
    authToken: true,
    authApiKey: true
  });

  const { app, canWrite } = await (async () => {
    if (authType === AuthUserTypeEnum.apikey) {
      if (!apiKeyAppId) {
        return Promise.reject(
          'Key is error. You need to use the app key rather than the account key.'
        );
      }
      const app = await MongoApp.findById(apiKeyAppId);

      if (!app) {
        return Promise.reject('app is empty');
      }

      appId = String(app._id);

      return {
        app,
        canWrite: apiKeyCanWrite
      };
    } else {
      // token auth
      if (!appId) {
        return Promise.reject('appId is empty');
      }
      const { app, canWrite } = await authApp({
        req,
        authToken: true,
        appId,
        per: 'r'
      });

      return {
        app,

        canWrite: canWrite
      };
    }
  })();

  const [{ user }, chat] = await Promise.all([
    getUserChatInfoAndAuthTeamPoints(tmbId),
    MongoChat.findOne({ appId, chatId }).lean()
  ]);

  if (chat && (String(chat.teamId) !== teamId || String(chat.tmbId) !== tmbId)) {
    return Promise.reject(ChatErrEnum.unAuthChat);
  }

  return {
    teamId,
    tmbId,
    user,
    app,
    responseDetail: detail,
    apikey,
    authType,
    canWrite
  };
};
