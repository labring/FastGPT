import type { NextApiRequest, NextApiResponse } from 'next';
import { connectToDatabase } from '@/service/mongo';
import { authUser, authModel, getApiKey, authShareChat } from '@/service/utils/auth';
import { sseErrRes, jsonRes } from '@/service/response';
import { ChatRoleEnum, sseResponseEventEnum } from '@/constants/chat';
import { withNextCors } from '@/service/utils/tools';
import type { CreateChatCompletionRequest } from 'openai';
import { gptMessage2ChatType, textAdaptGptResponse } from '@/utils/adapt';
import { getChatHistory } from './getHistory';
import { saveChat } from '@/pages/api/chat/saveChat';
import { sseResponse } from '@/service/utils/tools';
import { type ChatCompletionRequestMessage } from 'openai';
import {
  kbChatAppDemo,
  chatAppDemo,
  lafClassifyQuestionDemo,
  classifyQuestionDemo,
  SpecificInputEnum,
  AppModuleItemTypeEnum
} from '@/constants/app';
import { Types } from 'mongoose';
import { moduleFetch } from '@/service/api/request';
import { AppModuleItemType } from '@/types/app';

export type MessageItemType = ChatCompletionRequestMessage & { _id?: string };
type FastGptWebChatProps = {
  chatId?: string; // undefined: nonuse history, '': new chat, 'xxxxx': use history
  appId?: string;
};
type FastGptShareChatProps = {
  password?: string;
  shareId?: string;
};
export type Props = CreateChatCompletionRequest &
  FastGptWebChatProps &
  FastGptShareChatProps & {
    messages: MessageItemType[];
    stream?: boolean;
  };
export type ChatResponseType = {
  newChatId: string;
  quoteLen?: number;
};

/* 发送提示词 */
export default withNextCors(async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.on('close', () => {
    res.end();
  });
  res.on('error', () => {
    console.log('error: ', 'request error');
    res.end();
  });

  let { chatId, appId, shareId, password = '', stream = false, messages = [] } = req.body as Props;

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
          shareId,
          password
        })
      : authUser({ req }));

    appId = appId ? appId : authAppid;
    if (!appId) {
      throw new Error('appId is empty');
    }

    // get history
    const { history } = await getChatHistory({ chatId, userId });
    const prompts = history.concat(gptMessage2ChatType(messages));
    if (prompts[prompts.length - 1].obj === 'AI') {
      prompts.pop();
    }
    // user question
    const prompt = prompts.pop();

    if (!prompt) {
      throw new Error('Question is empty');
    }

    /* start process */
    const modules = JSON.parse(JSON.stringify(classifyQuestionDemo.modules));

    const { responseData, answerText } = await dispatchModules({
      res,
      modules,
      params: {
        history: prompts,
        userChatInput: prompt.value
      },
      stream
    });

    // save chat
    if (typeof chatId === 'string') {
      const { newChatId } = await saveChat({
        chatId,
        modelId: appId,
        prompts: [
          prompt,
          {
            _id: messages[messages.length - 1]._id,
            obj: ChatRoleEnum.AI,
            value: answerText,
            responseData
          }
        ],
        userId
      });

      if (newChatId) {
        sseResponse({
          res,
          event: sseResponseEventEnum.chatResponse,
          data: JSON.stringify({
            newChatId
          })
        });
      }
    }

    if (stream) {
      sseResponse({
        res,
        event: sseResponseEventEnum.appStreamResponse,
        data: JSON.stringify(responseData)
      });
      res.end();
    } else {
      res.json({
        data: responseData,
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
  } catch (err: any) {
    if (stream) {
      res.status(500);
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

async function dispatchModules({
  res,
  modules,
  params = {},
  stream = false
}: {
  res: NextApiResponse;
  modules: AppModuleItemType[];
  params?: Record<string, any>;
  stream?: boolean;
}) {
  let storeData: Record<string, any> = {};
  let responseData: Record<string, any> = {};
  let answerText = '';

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
  function moduleInput(module: AppModuleItemType, data: Record<string, any> = {}): Promise<any> {
    const checkInputFinish = () => {
      return !module.inputs.find((item: any) => item.value === undefined);
    };
    const updateInputValue = (key: string, value: any) => {
      const index = module.inputs.findIndex((item: any) => item.key === key);
      if (index === -1) return;
      module.inputs[index].value = value;
    };

    return Promise.all(
      Object.entries(data).map(([key, val]: any) => {
        updateInputValue(key, val);
        if (checkInputFinish()) {
          return moduleRun(module);
        }
      })
    );
  }
  function moduleOutput(module: AppModuleItemType, result: Record<string, any> = {}): Promise<any> {
    return Promise.all(
      module.outputs.map((item) => {
        if (result[item.key] === undefined) return;
        /* update output value */
        item.value = result[item.key];

        pushStore({
          isResponse: item.response,
          answer: item.answer ? item.value : '',
          data: {
            [item.key]: item.value
          }
        });

        /* update target */
        return Promise.all(
          item.targets.map((target: any) => {
            // find module
            const targetModule = modules.find((item) => item.moduleId === target.moduleId);
            if (!targetModule) return;
            return moduleInput(targetModule, { [target.key]: item.value });
          })
        );
      })
    );
  }
  async function moduleRun(module: AppModuleItemType): Promise<any> {
    console.log('run=========', module.type, module.url);

    if (module.type === AppModuleItemTypeEnum.answer) {
      pushStore({
        answer: module.inputs[0].value
      });
      return AnswerResponse({
        res,
        stream,
        text: module.inputs.find((item) => item.key === SpecificInputEnum.answerText)?.value
      });
    }

    if (module.type === AppModuleItemTypeEnum.switch) {
      return moduleOutput(module, switchResponse(module));
    }

    if (module.type === AppModuleItemTypeEnum.http && module.url) {
      // get fetch params
      const inputParams: Record<string, any> = {};
      module.inputs.forEach((item: any) => {
        inputParams[item.key] = item.value;
      });
      const data = {
        stream,
        ...module.body,
        ...inputParams
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

  // 从填充 params 开始进入递归
  await Promise.all(modules.map((module) => moduleInput(module, params)));

  return {
    responseData,
    answerText
  };
}

function AnswerResponse({
  res,
  stream = false,
  text = ''
}: {
  res: NextApiResponse;
  stream?: boolean;
  text?: '';
}) {
  if (stream) {
    return sseResponse({
      res,
      event: sseResponseEventEnum.answer,
      data: textAdaptGptResponse({
        text
      })
    });
  }
  return text;
}
function switchResponse(module: any) {
  const val = module?.inputs?.[0]?.value;

  if (val) {
    return { true: 1 };
  }
  return { false: 1 };
}
