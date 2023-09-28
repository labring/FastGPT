import type { NextApiRequest, NextApiResponse } from 'next';
import { connectToDatabase } from '@/service/mongo';
import { authUser, authApp, AuthUserTypeEnum } from '@/service/utils/auth';
import { sseErrRes, jsonRes } from '@/service/response';
import { addLog, withNextCors } from '@/service/utils/tools';
import { ChatRoleEnum, ChatSourceEnum, sseResponseEventEnum } from '@/constants/chat';
import {
  dispatchHistory,
  dispatchChatInput,
  dispatchChatCompletion,
  dispatchKBSearch,
  dispatchAnswer,
  dispatchClassifyQuestion,
  dispatchContentExtract,
  dispatchHttpRequest
} from '@/service/moduleDispatch';
import type { CreateChatCompletionRequest } from '@fastgpt/core/aiApi/type';
import type { MessageItemType } from '@/types/core/chat/type';
import { gptMessage2ChatType, textAdaptGptResponse } from '@/utils/adapt';
import { getChatHistory } from './getHistory';
import { saveChat } from '@/service/utils/chat/saveChat';
import { sseResponse } from '@/service/utils/tools';
import { TaskResponseKeyEnum } from '@/constants/chat';
import { FlowModuleTypeEnum, initModuleType } from '@/constants/flow';
import { AppModuleItemType, RunningModuleItemType } from '@/types/app';
import { pushChatBill } from '@/service/common/bill/push';
import { BillSourceEnum } from '@/constants/user';
import { ChatHistoryItemResType } from '@/types/chat';
import { UserModelSchema } from '@/types/mongoSchema';
import { SystemInputEnum } from '@/constants/app';
import { getSystemTime } from '@/utils/user';
import { authOutLinkChat } from '@/service/support/outLink/auth';
import requestIp from 'request-ip';
import { replaceVariable } from '@/utils/common/tools/text';
import type { ModuleDispatchProps } from '@/types/core/chat/type';
import { selectShareResponse } from '@/utils/service/core/chat';
import { pushResult2Remote, updateOutLinkUsage } from '@/service/support/outLink';
import { updateApiKeyUsage } from '@/service/support/openapi';

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

    await connectToDatabase();
    let startTime = Date.now();

    /* user auth */
    const {
      responseDetail: shareResponseDetail,
      user,
      userId,
      appId: authAppid,
      authType,
      apikey
    } = await (async (): Promise<{
      user?: UserModelSchema;
      responseDetail?: boolean;
      userId: string;
      appId: string;
      authType: `${AuthUserTypeEnum}`;
      apikey?: string;
    }> => {
      if (shareId) {
        return authOutLinkChat({
          shareId,
          ip: requestIp.getClientIp(req),
          authToken,
          question:
            (messages[messages.length - 2]?.role === 'user'
              ? messages[messages.length - 2].content
              : messages[messages.length - 1]?.content) || ''
        });
      }
      return authUser({ req, authToken: true, authApiKey: true, authBalance: true });
    })();

    if (!user) {
      throw new Error('Account is error');
    }

    // must have a app
    appId = appId ? appId : authAppid;
    if (!appId) {
      throw new Error('appId is empty');
    }

    // auth app, get history
    const [{ app }, { history }] = await Promise.all([
      authApp({
        appId,
        userId
      }),
      getChatHistory({ chatId, appId, userId })
    ]);

    const isOwner = !shareId && userId === String(app.userId);
    const responseDetail = isOwner || shareResponseDetail;

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
        appId,
        userId,
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
    const feResponseData = isOwner ? responseData : selectShareResponse({ responseData });

    if (stream) {
      sseResponse({
        res,
        event: detail ? sseResponseEventEnum.answer : undefined,
        data: textAdaptGptResponse({
          text: null,
          finish_reason: 'stop'
        })
      });
      sseResponse({
        res,
        event: detail ? sseResponseEventEnum.answer : undefined,
        data: '[DONE]'
      });

      if (responseDetail && detail) {
        sseResponse({
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
      appId,
      userId,
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

/* running */
export async function dispatchModules({
  res,
  modules,
  user,
  params = {},
  variables = {},
  stream = false,
  detail = false
}: {
  res: NextApiResponse;
  modules: AppModuleItemType[];
  user: UserModelSchema;
  params?: Record<string, any>;
  variables?: Record<string, any>;
  stream?: boolean;
  detail?: boolean;
}) {
  variables = {
    ...getSystemVariable({ timezone: user.timezone }),
    ...variables
  };
  const runningModules = loadModules(modules, variables);

  // let storeData: Record<string, any> = {}; // after module used
  let chatResponse: ChatHistoryItemResType[] = []; // response request and save to database
  let chatAnswerText = ''; // AI answer
  let runningTime = Date.now();

  function pushStore({
    answerText = '',
    responseData
  }: {
    answerText?: string;
    responseData?: ChatHistoryItemResType;
  }) {
    const time = Date.now();
    responseData &&
      chatResponse.push({
        ...responseData,
        runningTime: +((time - runningTime) / 1000).toFixed(2)
      });
    runningTime = time;
    chatAnswerText += answerText;
  }
  function moduleInput(
    module: RunningModuleItemType,
    data: Record<string, any> = {}
  ): Promise<any> {
    const checkInputFinish = () => {
      return !module.inputs.find((item: any) => item.value === undefined);
    };
    const updateInputValue = (key: string, value: any) => {
      const index = module.inputs.findIndex((item: any) => item.key === key);
      if (index === -1) return;
      module.inputs[index].value = value;
    };

    const set = new Set();

    return Promise.all(
      Object.entries(data).map(([key, val]: any) => {
        updateInputValue(key, val);

        if (!set.has(module.moduleId) && checkInputFinish()) {
          set.add(module.moduleId);
          // remove switch
          updateInputValue(SystemInputEnum.switch, undefined);
          return moduleRun(module);
        }
      })
    );
  }
  function moduleOutput(
    module: RunningModuleItemType,
    result: Record<string, any> = {}
  ): Promise<any> {
    pushStore(result);
    return Promise.all(
      module.outputs.map((outputItem) => {
        if (result[outputItem.key] === undefined) return;
        /* update output value */
        outputItem.value = result[outputItem.key];

        /* update target */
        return Promise.all(
          outputItem.targets.map((target: any) => {
            // find module
            const targetModule = runningModules.find((item) => item.moduleId === target.moduleId);
            if (!targetModule) return;

            return moduleInput(targetModule, { [target.key]: outputItem.value });
          })
        );
      })
    );
  }
  async function moduleRun(module: RunningModuleItemType): Promise<any> {
    if (res.closed) return Promise.resolve();

    if (stream && detail && module.showStatus) {
      responseStatus({
        res,
        name: module.name,
        status: 'running'
      });
    }

    // get fetch params
    const params: Record<string, any> = {};
    module.inputs.forEach((item: any) => {
      params[item.key] = item.value;
    });
    const props: ModuleDispatchProps<Record<string, any>> = {
      res,
      stream,
      detail,
      variables,
      moduleName: module.name,
      outputs: module.outputs,
      userOpenaiAccount: user?.openaiAccount,
      inputs: params
    };

    const dispatchRes = await (async () => {
      const callbackMap: Record<string, Function> = {
        [FlowModuleTypeEnum.historyNode]: dispatchHistory,
        [FlowModuleTypeEnum.questionInput]: dispatchChatInput,
        [FlowModuleTypeEnum.answerNode]: dispatchAnswer,
        [FlowModuleTypeEnum.chatNode]: dispatchChatCompletion,
        [FlowModuleTypeEnum.kbSearchNode]: dispatchKBSearch,
        [FlowModuleTypeEnum.classifyQuestion]: dispatchClassifyQuestion,
        [FlowModuleTypeEnum.contentExtract]: dispatchContentExtract,
        [FlowModuleTypeEnum.httpRequest]: dispatchHttpRequest
      };
      if (callbackMap[module.flowType]) {
        return callbackMap[module.flowType](props);
      }
      return {};
    })();

    return moduleOutput(module, dispatchRes);
  }

  // start process width initInput
  const initModules = runningModules.filter((item) => initModuleType[item.flowType]);

  await Promise.all(initModules.map((module) => moduleInput(module, params)));

  return {
    [TaskResponseKeyEnum.answerText]: chatAnswerText,
    [TaskResponseKeyEnum.responseData]: chatResponse
  };
}

/* init store modules to running modules */
function loadModules(
  modules: AppModuleItemType[],
  variables: Record<string, any>
): RunningModuleItemType[] {
  return modules.map((module) => {
    return {
      moduleId: module.moduleId,
      name: module.name,
      flowType: module.flowType,
      showStatus: module.showStatus,
      inputs: module.inputs
        .filter((item) => item.connected) // filter unconnected target input
        .map((item) => {
          if (typeof item.value !== 'string') {
            return {
              key: item.key,
              value: item.value
            };
          }

          // variables replace
          const replacedVal = replaceVariable(item.value, variables);

          return {
            key: item.key,
            value: replacedVal
          };
        }),
      outputs: module.outputs.map((item) => ({
        key: item.key,
        answer: item.key === TaskResponseKeyEnum.answerText,
        value: undefined,
        targets: item.targets
      }))
    };
  });
}

/* sse response modules staus */
export function responseStatus({
  res,
  status,
  name
}: {
  res: NextApiResponse;
  status?: 'running' | 'finish';
  name?: string;
}) {
  if (!name) return;
  sseResponse({
    res,
    event: sseResponseEventEnum.moduleStatus,
    data: JSON.stringify({
      status: 'running',
      name
    })
  });
}

/* get system variable */
export function getSystemVariable({ timezone }: { timezone: string }) {
  return {
    cTime: getSystemTime(timezone)
  };
}

export const config = {
  api: {
    responseLimit: '20mb'
  }
};
