import type { NextApiResponse } from 'next';
import { sseResponse } from '@/service/utils/tools';
import { OpenAiChatEnum } from '@/constants/model';
import { adaptChatItem_openAI, countOpenAIToken } from '@/utils/plugin/openai';
import { modelToolMap } from '@/utils/plugin';
import { ChatContextFilter } from '@/service/utils/chat/index';
import type { ChatItemType, QuoteItemType } from '@/types/chat';
import type { ChatHistoryItemResType } from '@/types/chat';
import { ChatModuleEnum, ChatRoleEnum, sseResponseEventEnum } from '@/constants/chat';
import { parseStreamChunk, textAdaptGptResponse } from '@/utils/adapt';
import { getOpenAIApi, axiosConfig } from '@/service/ai/openai';
import { TaskResponseKeyEnum } from '@/constants/chat';
import { getChatModel } from '@/service/utils/data';
import { countModelPrice } from '@/service/events/pushBill';
import { ChatModelItemType } from '@/types/model';

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

  const { filterQuoteQA, quotePrompt } = filterQuote({
    quoteQA,
    model: modelConstantsData
  });

  const { messages, filterMessages } = getChatMessages({
    model: modelConstantsData,
    history,
    quotePrompt,
    userChatInput,
    systemPrompt,
    limitPrompt
  });
  const { max_tokens } = getMaxTokens({
    model: modelConstantsData,
    maxToken,
    filterMessages
  });
  // console.log(messages);

  // FastGpt temperature range: 1~10
  temperature = +(modelConstantsData.maxTemperature * (temperature / 10)).toFixed(2);
  const chatAPI = getOpenAIApi();

  const response = await chatAPI.createChatCompletion(
    {
      model,
      temperature: Number(temperature || 0),
      max_tokens,
      messages,
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

  const { answerText, totalTokens, completeMessages } = await (async () => {
    if (stream) {
      // sse response
      const { answer } = await streamResponse({ res, response });
      // count tokens
      const completeMessages = filterMessages.concat({
        obj: ChatRoleEnum.AI,
        value: answer
      });

      const totalTokens = countOpenAIToken({
        messages: completeMessages
      });

      return {
        answerText: answer,
        totalTokens,
        completeMessages
      };
    } else {
      const answer = stream ? '' : response.data.choices?.[0].message?.content || '';
      const totalTokens = stream ? 0 : response.data.usage?.total_tokens || 0;

      const completeMessages = filterMessages.concat({
        obj: ChatRoleEnum.AI,
        value: answer
      });

      return {
        answerText: answer,
        totalTokens,
        completeMessages
      };
    }
  })();

  return {
    [TaskResponseKeyEnum.answerText]: answerText,
    [TaskResponseKeyEnum.responseData]: {
      moduleName: ChatModuleEnum.AIChat,
      price: countModelPrice({ model, tokens: totalTokens }),
      model: modelConstantsData.name,
      tokens: totalTokens,
      question: userChatInput,
      answer: answerText,
      maxToken,
      quoteList: filterQuoteQA,
      completeMessages
    }
  };
};

function filterQuote({
  quoteQA = [],
  model
}: {
  quoteQA: ChatProps['quoteQA'];
  model: ChatModelItemType;
}) {
  const sliceResult = modelToolMap.tokenSlice({
    model: model.model,
    maxToken: model.quoteMaxToken,
    messages: quoteQA.map((item, i) => ({
      obj: ChatRoleEnum.System,
      value: `${i + 1}. [${item.q}\n${item.a}]`
    }))
  });

  // slice filterSearch
  const filterQuoteQA = quoteQA.slice(0, sliceResult.length);

  const quotePrompt =
    filterQuoteQA.length > 0
      ? `下面是知识库内容:
${filterQuoteQA.map((item, i) => `${i + 1}. [${item.q}\n${item.a}]`).join('\n')}
`
      : '';

  return {
    filterQuoteQA,
    quotePrompt
  };
}
function getChatMessages({
  quotePrompt,
  history = [],
  systemPrompt,
  limitPrompt,
  userChatInput,
  model
}: {
  quotePrompt: string;
  history: ChatProps['history'];
  systemPrompt: string;
  limitPrompt: string;
  userChatInput: string;
  model: ChatModelItemType;
}) {
  const limitText = (() => {
    if (limitPrompt) return limitPrompt;
    if (quotePrompt && !limitPrompt) {
      return '根据知识库内容回答问题，仅回复知识库提供的内容，不要对知识库内容做补充说明。';
    }
    return '';
  })();

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

  const filterMessages = ChatContextFilter({
    model: model.model,
    prompts: messages,
    maxTokens: Math.ceil(model.contextMaxToken - 300) // filter token. not response maxToken
  });

  const adaptMessages = adaptChatItem_openAI({ messages: filterMessages, reserveId: false });

  return {
    messages: adaptMessages,
    filterMessages
  };
}
function getMaxTokens({
  maxToken,
  model,
  filterMessages = []
}: {
  maxToken: number;
  model: ChatModelItemType;
  filterMessages: ChatProps['history'];
}) {
  const tokensLimit = model.contextMaxToken;
  /* count response max token */
  const promptsToken = modelToolMap.countTokens({
    model: model.model,
    messages: filterMessages
  });
  maxToken = maxToken + promptsToken > tokensLimit ? tokensLimit - promptsToken : maxToken;

  return {
    max_tokens: maxToken
  };
}

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

    if (data !== '[DONE]') {
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
