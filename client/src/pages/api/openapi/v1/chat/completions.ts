import type { NextApiRequest, NextApiResponse } from 'next';
import { connectToDatabase } from '@/service/mongo';
import { authUser, authApp, authShareChat } from '@/service/utils/auth';
import { sseErrRes, jsonRes } from '@/service/response';
import { ChatRoleEnum, sseResponseEventEnum } from '@/constants/chat';
import { withNextCors } from '@/service/utils/tools';
import type { CreateChatCompletionRequest } from 'openai';
import { gptMessage2ChatType, textAdaptGptResponse } from '@/utils/adapt';
import { getChatHistory } from './getHistory';
import { saveChat } from '@/pages/api/chat/saveChat';
import { sseResponse } from '@/service/utils/tools';
import { type ChatCompletionRequestMessage } from 'openai';
import { SpecificInputEnum, AppModuleItemTypeEnum } from '@/constants/app';
import { Types } from 'mongoose';
import { moduleFetch } from '@/service/api/request';
import { AppModuleItemType, RunningModuleItemType } from '@/types/app';
import { FlowInputItemTypeEnum } from '@/constants/flow';
import { finishTaskBill, createTaskBill, delTaskBill } from '@/service/events/pushBill';
import { BillSourceEnum } from '@/constants/user';

export type MessageItemType = ChatCompletionRequestMessage & { _id?: string };
type FastGptWebChatProps = {
  chatId?: string; // undefined: nonuse history, '': new chat, 'xxxxx': use history
  appId?: string;
};
type FastGptShareChatProps = {
  shareId?: string;
};
export type Props = CreateChatCompletionRequest &
  FastGptWebChatProps &
  FastGptShareChatProps & {
    messages: MessageItemType[];
    stream?: boolean;
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

  let { chatId, appId, shareId, stream = false, messages = [], variables = {} } = req.body as Props;

  let billId = '';

  try {
    if (!messages) {
      throw new Error('Prams Error');
    }
    if (!Array.isArray(messages)) {
      throw new Error('messages is not array');
    }

    await connectToDatabase();
    let startTime = Date.now();

    /* user auth */
    const {
      userId,
      appId: authAppid,
      authType
    } = await (shareId
      ? authShareChat({
          shareId
        })
      : authUser({ req }));

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
      getChatHistory({ chatId, userId })
    ]);

    const isOwner = !shareId && userId === String(app.userId);

    const prompts = history.concat(gptMessage2ChatType(messages));
    if (prompts[prompts.length - 1].obj === 'AI') {
      prompts.pop();
    }
    // user question
    const prompt = prompts.pop();

    if (!prompt) {
      throw new Error('Question is empty');
    }

    const newChatId = chatId === '' ? new Types.ObjectId() : undefined;
    if (stream && newChatId) {
      res.setHeader('newChatId', String(newChatId));
    }

    billId = await createTaskBill({
      userId,
      appName: app.name,
      appId,
      source: authType === 'apikey' ? BillSourceEnum.api : BillSourceEnum.fastgpt
    });

    /* start process */
    const { responseData, answerText } = await dispatchModules({
      res,
      modules: app.modules,
      variables,
      params: {
        history: prompts,
        userChatInput: prompt.value
      },
      stream,
      billId
    });

    // save chat
    if (typeof chatId === 'string') {
      await saveChat({
        chatId,
        newChatId,
        appId,
        variables,
        prompts: [
          prompt,
          {
            _id: messages[messages.length - 1]._id,
            obj: ChatRoleEnum.AI,
            value: answerText,
            ...responseData
          }
        ],
        userId
      });
    }

    console.log(`finish time: ${(Date.now() - startTime) / 1000}s`);

    if (stream) {
      sseResponse({
        res,
        event: sseResponseEventEnum.answer,
        data: '[DONE]'
      });

      if (isOwner) {
        sseResponse({
          res,
          event: sseResponseEventEnum.appStreamResponse,
          data: JSON.stringify(responseData)
        });
      }

      res.end();
    } else {
      res.json({
        data: {
          newChatId,
          ...responseData
        },
        id: chatId || '',
        model: '',
        usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
        choices: [
          {
            message: [{ role: 'assistant', content: answerText }],
            finish_reason: 'stop',
            index: 0
          }
        ]
      });
    }

    // bill
    finishTaskBill({
      billId
    });
  } catch (err: any) {
    delTaskBill(billId);

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

export async function dispatchModules({
  res,
  modules,
  params = {},
  variables = {},
  stream = false,
  billId
}: {
  res: NextApiResponse;
  modules: AppModuleItemType[];
  params?: Record<string, any>;
  variables?: Record<string, any>;
  billId: string;
  stream?: boolean;
}) {
  const runningModules = loadModules(modules, variables);

  let storeData: Record<string, any> = {}; // after module used
  let responseData: Record<string, any> = {}; // response request and save to database
  let answerText = ''; // AI answer

  function pushStore({
    isResponse = false,
    answer,
    data = {}
  }: {
    isResponse?: boolean;
    answer?: string;
    data?: Record<string, any>;
  }) {
    if (isResponse) {
      responseData = {
        ...responseData,
        ...data
      };
    }

    if (answer) {
      answerText += answer;
    }

    storeData = {
      ...storeData,
      ...data
    };
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
          return moduleRun(module);
        }
      })
    );
  }
  function moduleOutput(
    module: RunningModuleItemType,
    result: Record<string, any> = {}
  ): Promise<any> {
    return Promise.all(
      module.outputs.map((outputItem) => {
        if (result[outputItem.key] === undefined) return;
        /* update output value */
        outputItem.value = result[outputItem.key];

        pushStore({
          isResponse: outputItem.response,
          answer: outputItem.answer ? outputItem.value : '',
          data: {
            [outputItem.key]: outputItem.value
          }
        });

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
    console.log('run=========', module.type, module.url);

    // direct answer
    if (module.type === AppModuleItemTypeEnum.answer) {
      const text =
        module.inputs.find((item) => item.key === SpecificInputEnum.answerText)?.value || '';
      pushStore({
        answer: text
      });
      return StreamAnswer({
        res,
        stream,
        text: text
      });
    }

    if (module.type === AppModuleItemTypeEnum.switch) {
      return moduleOutput(module, switchResponse(module));
    }

    if (
      (module.type === AppModuleItemTypeEnum.http ||
        module.type === AppModuleItemTypeEnum.initInput) &&
      module.url
    ) {
      // get fetch params
      const params: Record<string, any> = {};
      module.inputs.forEach((item: any) => {
        params[item.key] = item.value;
      });
      const data = {
        stream,
        billId,
        ...params
      };

      // response data
      const fetchRes = await moduleFetch({
        res,
        url: module.url,
        data
      });

      return moduleOutput(module, fetchRes);
    }
  }

  // start process width initInput
  const initModules = runningModules.filter(
    (item) => item.type === AppModuleItemTypeEnum.initInput
  );

  await Promise.all(initModules.map((module) => moduleInput(module, params)));

  return {
    responseData,
    answerText
  };
}

function loadModules(
  modules: AppModuleItemType[],
  variables: Record<string, any>
): RunningModuleItemType[] {
  return modules.map((module) => {
    return {
      moduleId: module.moduleId,
      type: module.type,
      url: module.url,
      inputs: module.inputs
        .filter((item) => item.type !== FlowInputItemTypeEnum.target || item.connected) // filter unconnected target input
        .map((item) => {
          if (typeof item.value !== 'string') {
            return {
              key: item.key,
              value: item.value
            };
          }

          // variables replace
          const replacedVal = item.value.replace(
            /{{(.*?)}}/g,
            (match, key) => variables[key.trim()] || match
          );

          return {
            key: item.key,
            value: replacedVal
          };
        }),
      outputs: module.outputs.map((item) => ({
        key: item.key,
        answer: item.key === SpecificInputEnum.answerText,
        response: item.response,
        value: undefined,
        targets: item.targets
      }))
    };
  });
}
function StreamAnswer({
  res,
  stream = false,
  text = ''
}: {
  res: NextApiResponse;
  stream?: boolean;
  text?: string;
}) {
  if (stream && text) {
    return sseResponse({
      res,
      event: sseResponseEventEnum.answer,
      data: textAdaptGptResponse({
        text: text.replace(/\\n/g, '\n')
      })
    });
  }
  return text;
}
function switchResponse(module: RunningModuleItemType) {
  const val = module?.inputs?.[0]?.value;

  if (val) {
    return { true: 1 };
  }
  return { false: 1 };
}
