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
  initWorkflowEdgeStatus,
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
  removeEmptyUserInput
} from '@fastgpt/global/core/chat/utils';
import { updateApiKeyUsage } from '@fastgpt/service/support/openapi/tools';
import { getUserChatInfoAndAuthTeamPoints } from '@fastgpt/service/support/permission/auth/team';
import { AuthUserTypeEnum } from '@fastgpt/global/support/permission/constant';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { AppSchema } from '@fastgpt/global/core/app/type';
import { AuthOutLinkChatProps } from '@fastgpt/global/support/outLink/api';
import { MongoChat } from '@fastgpt/service/core/chat/chatSchema';
import { ChatErrEnum } from '@fastgpt/global/common/error/code/chat';
import { OutLinkChatAuthProps } from '@fastgpt/global/support/permission/chat';
import { AIChatItemType, UserChatItemType } from '@fastgpt/global/core/chat/type';
import { DispatchNodeResponseKeyEnum } from '@fastgpt/global/core/workflow/runtime/constants';
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
import { WORKFLOW_MAX_RUN_TIMES } from '@fastgpt/service/core/workflow/constants';
import { getPluginInputsFromStoreNodes } from '@fastgpt/global/core/app/plugin/utils';
import { ExternalProviderType } from '@fastgpt/global/core/workflow/runtime/type';
import { getWorkflowResponseWrite } from '@fastgpt/service/core/workflow/dispatch/utils';

type FastGptWebChatProps = {
  chatId?: string;
  appId?: string;
  customUid?: string;
  metadata?: Record<string, any>;
};

export type Props = ChatCompletionCreateParams &
  FastGptWebChatProps &
  OutLinkChatAuthProps & {
    messages: ChatCompletionMessageParam[];
    responseChatItemId?: string;
    stream?: boolean;
    detail?: boolean;
    variables: Record<string, any>;
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

type CompletionsConfig = {
  isV2: boolean;
};

export const createCompletionsHandler = (config: CompletionsConfig) => {
  return async function handler(req: NextApiRequest, res: NextApiResponse) {
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
      customUid,
      shareId,
      outLinkUid,
      teamId: spaceTeamId,
      teamToken,
      stream = false,
      detail = false,
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

      const chatMessages = GPTMessages2Chats(messages);

      const startHookText = (() => {
        const userQuestion = chatMessages[chatMessages.length - 1] as UserChatItemType | undefined;
        if (userQuestion) return chatValue2RuntimePrompt(userQuestion.value).text;
        return JSON.stringify(variables);
      })();

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
        if (shareId && outLinkUid) {
          return authShareChat({
            shareId,
            outLinkUid,
            chatId,
            ip: originIp,
            question: startHookText
          });
        }
        if (spaceTeamId && appId && teamToken) {
          return authTeamSpaceChat({
            teamId: spaceTeamId,
            teamToken,
            appId,
            chatId
          });
        }
        return authHeaderRequest({
          req,
          appId,
          chatId
        });
      })();

      const isPlugin = app.type === AppTypeEnum.plugin;

      if (isPlugin) {
        detail = true;
      } else {
        if (messages.length === 0) {
          throw new Error('messages is empty');
        }
      }

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

      if (chatDetail?.variables) {
        variables = {
          ...chatDetail.variables,
          ...variables
        };
      }

      const newHistories = concatHistories(histories, chatMessages);

      let runtimeNodes = storeNodes2RuntimeNodes(
        nodes,
        getWorkflowEntryNodeIds(nodes, newHistories)
      );
      if (isPlugin) {
        runtimeNodes = updatePluginInputByVariables(runtimeNodes, variables);
        variables = {};
      }
      runtimeNodes = rewriteNodeOutputByHistories(newHistories, runtimeNodes);

      const workflowResponseWrite = getWorkflowResponseWrite({
        res,
        detail,
        streamResponse: stream,
        showNodeStatus,
        isV2: config.isV2
      });

      const { flowResponses, flowUsages, assistantResponses, newVariables } = await (async () => {
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
            runtimeEdges: initWorkflowEdgeStatus(edges, newHistories),
            variables,
            query: removeEmptyUserInput(userQuestion.value),
            chatConfig,
            histories: newHistories,
            stream,
            maxRunTimes: WORKFLOW_MAX_RUN_TIMES,
            workflowStreamResponse: workflowResponseWrite,
            isV2: config.isV2
          });
        }
        return Promise.reject('您的工作流版本过低，请重新发布一次');
      })();

      const isOwnerUse = !shareId && !spaceTeamId && String(tmbId) === String(app.tmbId);
      const source = (() => {
        if (shareId) return ChatSourceEnum.share;
        if (authType === 'apikey') return ChatSourceEnum.api;
        if (spaceTeamId) return ChatSourceEnum.team;
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
        [DispatchNodeResponseKeyEnum.nodeResponse]: flowResponses
      };

      const saveChatId = chatId || getNanoid(24);
      if (isInteractiveRequest) {
        await updateInteractiveChat({
          chatId: saveChatId,
          appId: app._id,
          userInteractiveVal,
          aiResponse,
          newVariables
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
          isUpdateUseTime: isOwnerUse && source === ChatSourceEnum.online,
          newTitle,
          shareId,
          outLinkUid: outLinkUserId,
          source,
          sourceName: sourceName || '',
          content: [userQuestion, aiResponse],
          metadata: {
            originIp,
            ...metadata
          }
        });
      }

      addLog.info(`completions running time: ${(Date.now() - startTime) / 1000}s`);

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
          data: '[DONE]',
          isV2: config.isV2
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
        const error = flowResponses[flowResponses.length - 1]?.error;

        res.json({
          ...(detail ? { responseData: feResponseData, newVariables } : {}),
          error,
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
  };
};

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
