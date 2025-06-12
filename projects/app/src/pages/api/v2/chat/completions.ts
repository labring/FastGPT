import type { NextApiRequest, NextApiResponse } from 'next';
import { authApp } from '@fastgpt/service/support/permission/app/auth';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import { sseErrRes, jsonRes } from '@fastgpt/service/common/response';
import { addLog } from '@fastgpt/service/common/system/log';
import { ChatRoleEnum, ChatSourceEnum } from '@fastgpt/global/core/chat/constants';
import { SseResponseEventEnum } from '@fastgpt/global/core/workflow/runtime/constants';
import { dispatchWorkFlow } from '@fastgpt/service/core/workflow/dispatch';
import type { ChatCompletionCreateParams } from '@fastgpt/global/core/ai/type.d';
import type { ChatCompletionMessageParam } from '@fastgpt/global/core/ai/type.d';
import {
  getWorkflowEntryNodeIds,
  getMaxHistoryLimitFromNodes,
  storeEdges2RuntimeEdges,
  storeNodes2RuntimeNodes,
  textAdaptGptResponse,
  getLastInteractiveValue
} from '@fastgpt/global/core/workflow/runtime/utils';
import { GPTMessages2Chats, chatValue2RuntimePrompt } from '@fastgpt/global/core/chat/adapt';
import { getChatItems } from '@fastgpt/service/core/chat/controller';
import { saveChat, updateInteractiveChat } from '@fastgpt/service/core/chat/saveChat';
import { responseWrite } from '@fastgpt/service/common/response';
import { createChatUsage } from '@fastgpt/service/support/wallet/usage/controller';
import { authOutLinkChatStart } from '@/service/support/permission/auth/outLink';
import { pushResult2Remote, addOutLinkUsage } from '@fastgpt/service/support/outLink/tools';
import requestIp from 'request-ip';
import { getUsageSourceByAuthType } from '@fastgpt/global/support/wallet/usage/tools';
import { authTeamSpaceToken } from '@/service/support/permission/auth/team';
import {
  concatHistories,
  filterPublicNodeResponseData,
  getChatTitleFromChatMessage,
  removeAIResponseCite,
  removeEmptyUserInput
} from '@fastgpt/global/core/chat/utils';
import { updateApiKeyUsage } from '@fastgpt/service/support/openapi/tools';
import { getUserChatInfoAndAuthTeamPoints } from '@fastgpt/service/support/permission/auth/team';
import { AuthUserTypeEnum } from '@fastgpt/global/support/permission/constant';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { type AppSchema } from '@fastgpt/global/core/app/type';
import { type AuthOutLinkChatProps } from '@fastgpt/global/support/outLink/api';
import { MongoChat } from '@fastgpt/service/core/chat/chatSchema';
import { ChatErrEnum } from '@fastgpt/global/common/error/code/chat';
import { type OutLinkChatAuthProps } from '@fastgpt/global/support/permission/chat';
import { type AIChatItemType, type UserChatItemType } from '@fastgpt/global/core/chat/type';
import { DispatchNodeResponseKeyEnum } from '@fastgpt/global/core/workflow/runtime/constants';

import { NextAPI } from '@/service/middleware/entry';
import { getAppLatestVersion } from '@fastgpt/service/core/app/version/controller';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import {
  getPluginRunUserQuery,
  updatePluginInputByVariables
} from '@fastgpt/global/core/workflow/utils';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import { getSystemTime } from '@fastgpt/global/common/time/timezone';
import { rewriteNodeOutputByHistories } from '@fastgpt/global/core/workflow/runtime/utils';
import { getWorkflowResponseWrite } from '@fastgpt/service/core/workflow/dispatch/utils';
import { WORKFLOW_MAX_RUN_TIMES } from '@fastgpt/service/core/workflow/constants';
import { getPluginInputsFromStoreNodes } from '@fastgpt/global/core/app/plugin/utils';
import { type ExternalProviderType } from '@fastgpt/global/core/workflow/runtime/type';

type FastGptWebChatProps = {
  chatId?: string; // undefined: get histories from messages, '': new chat, 'xxxxx': get histories from db
  appId?: string;
  customUid?: string; // non-undefined: will be the priority provider for the logger.
  metadata?: Record<string, any>;
};

export type Props = ChatCompletionCreateParams &
  FastGptWebChatProps &
  OutLinkChatAuthProps & {
    messages: ChatCompletionMessageParam[];
    responseChatItemId?: string;
    stream?: boolean;
    detail?: boolean;
    retainDatasetCite?: boolean;
    variables: Record<string, any>; // Global variables or plugin inputs
  };

type AuthResponseType = {
  teamId: string;
  tmbId: string;
  timezone: string;
  externalProvider: ExternalProviderType;
  app: AppSchema;
  responseDetail?: boolean;
  showNodeStatus?: boolean;
  authType: `${AuthUserTypeEnum}`;
  apikey?: string;
  responseAllData: boolean;
  outLinkUserId?: string;
  sourceName?: string;
};

async function handler(req: NextApiRequest, res: NextApiResponse) {
  let {
    chatId,
    appId,
    customUid,
    // share chat
    shareId,
    outLinkUid,
    // team chat
    teamId: spaceTeamId,
    teamToken,

    stream = false,
    detail = false,
    retainDatasetCite = false,
    messages = [],
    variables = {},
    responseChatItemId = getNanoid(),
    metadata
  } = req.body as Props;

  const originIp = requestIp.getClientIp(req);

  const startTime = Date.now();

  try {
    if (!Array.isArray(messages)) {
      throw new Error('messages is not array');
    }

    /*
      Web params: chatId + [Human]
      API params: chatId + [Human]
      API params: [histories, Human]
    */
    const chatMessages = GPTMessages2Chats(messages);

    // Computed start hook params
    const startHookText = (() => {
      // Chat
      const userQuestion = chatMessages[chatMessages.length - 1] as UserChatItemType;
      if (userQuestion) return chatValue2RuntimePrompt(userQuestion.value).text;

      // plugin
      return JSON.stringify(variables);
    })();

    /*
      1. auth app permission
      2. auth balance
      3. get app
      4. parse outLink token
    */
    const {
      teamId,
      tmbId,
      timezone,
      externalProvider,
      app,
      responseDetail,
      authType,
      sourceName,
      apikey,
      responseAllData,
      outLinkUserId = customUid,
      showNodeStatus
    } = await (async () => {
      // share chat
      if (shareId && outLinkUid) {
        return authShareChat({
          shareId,
          outLinkUid,
          chatId,
          ip: originIp,
          question: startHookText
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
        chatId
      });
    })();
    retainDatasetCite = retainDatasetCite && !!responseDetail;
    const isPlugin = app.type === AppTypeEnum.plugin;

    // Check message type
    if (isPlugin) {
      detail = true;
    } else {
      if (messages.length === 0) {
        throw new Error('messages is empty');
      }
    }

    // Get obj=Human history
    const userQuestion: UserChatItemType = (() => {
      if (isPlugin) {
        return getPluginRunUserQuery({
          pluginInputs: getPluginInputsFromStoreNodes(app.modules),
          variables,
          files: variables.files
        });
      }

      const latestHumanChat = chatMessages.pop() as UserChatItemType | undefined;
      if (!latestHumanChat) {
        throw new Error('User question is empty');
      }
      return latestHumanChat;
    })();

    // Get and concat history;
    const limit = getMaxHistoryLimitFromNodes(app.modules);
    const [{ histories }, { nodes, edges, chatConfig }, chatDetail] = await Promise.all([
      getChatItems({
        appId: app._id,
        chatId,
        offset: 0,
        limit,
        field: `dataId obj value nodeOutputs`
      }),
      getAppLatestVersion(app._id, app),
      MongoChat.findOne({ appId: app._id, chatId }, 'source variableList variables')
    ]);

    // Get store variables(Api variable precedence)
    if (chatDetail?.variables) {
      variables = {
        ...chatDetail.variables,
        ...variables
      };
    }

    // Get chat histories
    const newHistories = concatHistories(histories, chatMessages);
    const interactive = getLastInteractiveValue(newHistories) || undefined;
    // Get runtimeNodes
    let runtimeNodes = storeNodes2RuntimeNodes(nodes, getWorkflowEntryNodeIds(nodes, interactive));
    if (isPlugin) {
      // Assign values to runtimeNodes using variables
      runtimeNodes = updatePluginInputByVariables(runtimeNodes, variables);
      // Plugin runtime does not need global variables(It has been injected into the pluginInputNode)
      variables = {};
    }
    runtimeNodes = rewriteNodeOutputByHistories(runtimeNodes, interactive);

    const workflowResponseWrite = getWorkflowResponseWrite({
      res,
      detail,
      streamResponse: stream,
      id: chatId,
      showNodeStatus
    });

    /* start flow controller */
    const {
      flowResponses,
      flowUsages,
      assistantResponses,
      newVariables,
      durationSeconds,
      system_memories
    } = await (async () => {
      if (app.version === 'v2') {
        return dispatchWorkFlow({
          res,
          requestOrigin: req.headers.origin,
          mode: 'chat',
          timezone,
          externalProvider,

          runningAppInfo: {
            id: String(app._id),
            teamId: String(app.teamId),
            tmbId: String(app.tmbId)
          },
          runningUserInfo: {
            teamId,
            tmbId
          },
          uid: String(outLinkUserId || tmbId),

          chatId,
          responseChatItemId,
          runtimeNodes,
          runtimeEdges: storeEdges2RuntimeEdges(edges, interactive),
          variables,
          query: removeEmptyUserInput(userQuestion.value),
          lastInteractive: interactive,
          chatConfig,
          histories: newHistories,
          stream,
          retainDatasetCite,
          maxRunTimes: WORKFLOW_MAX_RUN_TIMES,
          workflowStreamResponse: workflowResponseWrite,
          version: 'v2',
          responseAllData,
          responseDetail
        });
      }
      return Promise.reject('您的工作流版本过低，请重新发布一次');
    })();

    // save chat
    const isOwnerUse = !shareId && !spaceTeamId && String(tmbId) === String(app.tmbId);
    const source = (() => {
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
    })();

    const isInteractiveRequest = !!getLastInteractiveValue(histories);
    const { text: userInteractiveVal } = chatValue2RuntimePrompt(userQuestion.value);

    const newTitle = isPlugin
      ? variables.cTime ?? getSystemTime(timezone)
      : getChatTitleFromChatMessage(userQuestion);

    const aiResponse: AIChatItemType & { dataId?: string } = {
      dataId: responseChatItemId,
      obj: ChatRoleEnum.AI,
      value: assistantResponses,
      [DispatchNodeResponseKeyEnum.nodeResponse]: flowResponses,
      memories: system_memories
    };

    const saveChatId = chatId || getNanoid(24);
    if (isInteractiveRequest) {
      await updateInteractiveChat({
        chatId: saveChatId,
        appId: app._id,
        userInteractiveVal,
        aiResponse,
        newVariables,
        durationSeconds
      });
    } else {
      await saveChat({
        chatId: saveChatId,
        appId: app._id,
        teamId,
        tmbId: tmbId,
        nodes,
        appChatConfig: chatConfig,
        variables: newVariables,
        isUpdateUseTime: isOwnerUse && source === ChatSourceEnum.online, // owner update use time
        newTitle,
        shareId,
        outLinkUid: outLinkUserId,
        source,
        sourceName: sourceName || '',
        content: [userQuestion, aiResponse],
        metadata: {
          originIp,
          ...metadata
        },
        durationSeconds
      });
    }

    addLog.info(`completions running time: ${(Date.now() - startTime) / 1000}s`);

    /* select fe response field */
    const feResponseData = responseAllData
      ? flowResponses
      : filterPublicNodeResponseData({ flowResponses, responseDetail });

    if (stream) {
      workflowResponseWrite({
        event: SseResponseEventEnum.answer,
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

      res.end();
    } else {
      const responseContent = (() => {
        if (assistantResponses.length === 0) return '';
        if (assistantResponses.length === 1 && assistantResponses[0].text?.content)
          return assistantResponses[0].text?.content;

        if (!detail) {
          return assistantResponses
            .map((item) => item?.text?.content)
            .filter(Boolean)
            .join('\n');
        }

        return assistantResponses;
      })();
      const formatResponseContent = removeAIResponseCite(responseContent, retainDatasetCite);
      const error = flowResponses[flowResponses.length - 1]?.error;

      res.json({
        ...(detail ? { responseData: feResponseData, newVariables } : {}),
        error,
        id: chatId || '',
        model: '',
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 1 },
        choices: [
          {
            message: { role: 'assistant', content: formatResponseContent },
            finish_reason: 'stop',
            index: 0
          }
        ]
      });
    }

    // add record
    const { totalPoints } = createChatUsage({
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
}
export default NextAPI(handler);

const authShareChat = async ({
  chatId,
  ...data
}: AuthOutLinkChatProps & {
  shareId: string;
  chatId?: string;
}): Promise<AuthResponseType> => {
  const {
    teamId,
    tmbId,
    timezone,
    externalProvider,
    appId,
    authType,
    responseDetail,
    showNodeStatus,
    uid,
    sourceName
  } = await authOutLinkChatStart(data);
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
    sourceName,
    teamId,
    tmbId,
    app,
    timezone,
    externalProvider,
    apikey: '',
    authType,
    responseAllData: false,
    responseDetail,
    outLinkUserId: uid,
    showNodeStatus
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

  const [chat, { timezone, externalProvider }] = await Promise.all([
    MongoChat.findOne({ appId, chatId }).lean(),
    getUserChatInfoAndAuthTeamPoints(app.tmbId)
  ]);

  if (chat && (String(chat.teamId) !== teamId || chat.outLinkUid !== uid)) {
    return Promise.reject(ChatErrEnum.unAuthChat);
  }

  return {
    teamId,
    tmbId: app.tmbId,
    app,
    timezone,
    externalProvider,
    authType: AuthUserTypeEnum.outLink,
    apikey: '',
    responseAllData: false,
    responseDetail: true,
    outLinkUserId: uid
  };
};
const authHeaderRequest = async ({
  req,
  appId,
  chatId
}: {
  req: NextApiRequest;
  appId?: string;
  chatId?: string;
}): Promise<AuthResponseType> => {
  const {
    appId: apiKeyAppId,
    teamId,
    tmbId,
    authType,
    sourceName,
    apikey
  } = await authCert({
    req,
    authToken: true,
    authApiKey: true
  });

  const { app } = await (async () => {
    if (authType === AuthUserTypeEnum.apikey) {
      const currentAppId = apiKeyAppId || appId;
      if (!currentAppId) {
        return Promise.reject(
          'Key is error. You need to use the app key rather than the account key.'
        );
      }
      const app = await MongoApp.findById(currentAppId);

      if (!app) {
        return Promise.reject('app is empty');
      }

      appId = String(app._id);

      return {
        app
      };
    } else {
      // token_auth
      if (!appId) {
        return Promise.reject('appId is empty');
      }
      const { app } = await authApp({
        req,
        authToken: true,
        appId,
        per: ReadPermissionVal
      });

      return {
        app
      };
    }
  })();

  const [{ timezone, externalProvider }, chat] = await Promise.all([
    getUserChatInfoAndAuthTeamPoints(tmbId),
    MongoChat.findOne({ appId, chatId }).lean()
  ]);

  if (
    chat &&
    (String(chat.teamId) !== teamId ||
      // There's no need to distinguish who created it if it's apiKey auth
      (authType === AuthUserTypeEnum.token && String(chat.tmbId) !== tmbId))
  ) {
    return Promise.reject(ChatErrEnum.unAuthChat);
  }

  return {
    teamId,
    tmbId,
    timezone,
    externalProvider,
    app,
    apikey,
    authType,
    sourceName,
    responseAllData: true,
    responseDetail: true
  };
};

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '20mb'
    },
    responseLimit: '20mb'
  }
};
