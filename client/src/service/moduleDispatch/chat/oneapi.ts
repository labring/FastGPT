import type { NextApiResponse } from 'next';
import { sseResponse } from '@/service/utils/tools';
import { OpenAiChatEnum } from '@/constants/model';
import { adaptChatItem_openAI, countOpenAIToken } from '@/utils/plugin/openai';
import { modelToolMap } from '@/utils/plugin';
import { ChatContextFilter } from '@/service/utils/chat/index';
import type { ChatItemType, QuoteItemType } from '@/types/chat';
import type { ChatHistoryItemResType } from '@/types/chat';
import { ChatRoleEnum, sseResponseEventEnum } from '@/constants/chat';
import { parseStreamChunk, textAdaptGptResponse } from '@/utils/adapt';
import { getOpenAIApi, axiosConfig } from '@/service/ai/openai';
import { TaskResponseKeyEnum } from '@/constants/chat';
import { getChatModel } from '@/service/utils/data';
import { countModelPrice } from '@/service/events/pushBill';

export type ChatProps = {
  res: NextApiResponse;
  model: `${OpenAiChatEnum}`;
  temperature?: number;
  maxToken?: number;
  history?: ChatItemType[];
  userChatInput: string;
  stream?: boolean;
  quoteQA?: QuoteItemType[];
  systemPrompt?: string;
  limitPrompt?: string;
};
export type ChatResponse = {
  [TaskResponseKeyEnum.answerText]: string;
  [TaskResponseKeyEnum.responseData]: ChatHistoryItemResType;
};

const moduleName = 'AI Chat';

/* request openai chat */
export const dispatchChatCompletion = async (props: Record<string, any>): Promise<ChatResponse> => {
  let {
    res,
    model,
    temperature = 0,
    maxToken = 4000,
    stream = false,
    history = [],
    quoteQA = [],
    userChatInput,
    systemPrompt = '',
    limitPrompt = ''
  } = props as ChatProps;

  // temperature adapt
  const modelConstantsData = getChatModel(model);

  if (!modelConstantsData) {
    return Promise.reject('The chat model is undefined, you need to select a chat model.');
  }

  // FastGpt temperature range: 1~10
  temperature = +(modelConstantsData.maxTemperature * (temperature / 10)).toFixed(2);

  const limitText = (() => {
    if (limitPrompt) return limitPrompt;
    if (quoteQA.length > 0 && !limitPrompt) {
      return '根据知识库内容回答问题，仅回复知识库提供的内容，不要对知识库内容做补充说明。';
    }
    return '';
  })();

  const quotePrompt =
    quoteQA.length > 0
      ? `下面是知识库内容:
${quoteQA.map((item, i) => `${i + 1}. [${item.q}\n${item.a}]`).join('\n')}
`
      : '';

  const messages: ChatItemType[] = [
    ...(quotePrompt
      ? [
          {
            obj: ChatRoleEnum.System,
            value: quotePrompt
          }
        ]
      : []),
    ...(systemPrompt
      ? [
          {
            obj: ChatRoleEnum.System,
            value: systemPrompt
          }
        ]
      : []),
    ...history,
    ...(limitText
      ? [
          {
            obj: ChatRoleEnum.System,
            value: limitText
          }
        ]
      : []),
    {
      obj: ChatRoleEnum.Human,
      value: userChatInput
    }
  ];
  const modelTokenLimit = getChatModel(model)?.contextMaxToken || 4000;

  const filterMessages = ChatContextFilter({
    model,
    prompts: messages,
    maxTokens: Math.ceil(modelTokenLimit - 300) // filter token. not response maxToken
  });

  const adaptMessages = adaptChatItem_openAI({ messages: filterMessages, reserveId: false });
  const chatAPI = getOpenAIApi();
  console.log(adaptMessages);

  /* count response max token */
  const promptsToken = modelToolMap.countTokens({
    model,
    messages: filterMessages
  });
  maxToken = maxToken + promptsToken > modelTokenLimit ? modelTokenLimit - promptsToken : maxToken;

  const response = await chatAPI.createChatCompletion(
    {
      model,
      temperature: Number(temperature || 0),
      max_tokens: maxToken,
      messages: adaptMessages,
      // frequency_penalty: 0.5, // 越大，重复内容越少
      // presence_penalty: -0.5, // 越大，越容易出现新内容
      stream
    },
    {
      timeout: stream ? 60000 : 480000,
      responseType: stream ? 'stream' : 'json',
      ...axiosConfig()
    }
  );

  const { answerText, totalTokens, finishMessages } = await (async () => {
    if (stream) {
      // sse response
      const { answer } = await streamResponse({ res, response });
      // count tokens
      const finishMessages = filterMessages.concat({
        obj: ChatRoleEnum.AI,
        value: answer
      });

      const totalTokens = countOpenAIToken({
        messages: finishMessages
      });

      return {
        answerText: answer,
        totalTokens,
        finishMessages
      };
    } else {
      const answer = stream ? '' : response.data.choices?.[0].message?.content || '';
      const totalTokens = stream ? 0 : response.data.usage?.total_tokens || 0;

      const finishMessages = filterMessages.concat({
        obj: ChatRoleEnum.AI,
        value: answer
      });

      return {
        answerText: answer,
        totalTokens,
        finishMessages
      };
    }
  })();

  return {
    [TaskResponseKeyEnum.answerText]: answerText,
    [TaskResponseKeyEnum.responseData]: {
      moduleName,
      price: countModelPrice({ model, tokens: totalTokens }),
      model: modelConstantsData.name,
      tokens: totalTokens,
      question: userChatInput,
      answer: answerText,
      maxToken,
      finishMessages
    }
  };
};

async function streamResponse({ res, response }: { res: NextApiResponse; response: any }) {
  let answer = '';
  let error: any = null;

  const clientRes = async (data: string) => {
    const { content = '' } = (() => {
      try {
        const json = JSON.parse(data);
        const content: string = json?.choices?.[0].delta.content || '';
        error = json.error;
        answer += content;
        return { content };
      } catch (error) {
        return {};
      }
    })();

    if (res.closed || error) return;

    if (data === '[DONE]') {
      sseResponse({
        res,
        event: sseResponseEventEnum.answer,
        data: textAdaptGptResponse({
          text: null,
          finish_reason: 'stop'
        })
      });
      sseResponse({
        res,
        event: sseResponseEventEnum.answer,
        data: '[DONE]'
      });
    } else {
      sseResponse({
        res,
        event: sseResponseEventEnum.answer,
        data: textAdaptGptResponse({
          text: content
        })
      });
    }
  };

  try {
    for await (const chunk of response.data as any) {
      if (res.closed) break;
      const parse = parseStreamChunk(chunk);
      parse.forEach((item) => clientRes(item.data));
    }
  } catch (error) {
    console.log('pipe error', error);
  }

  if (error) {
    console.log(error);
    return Promise.reject(error);
  }

  return {
    answer
  };
}
