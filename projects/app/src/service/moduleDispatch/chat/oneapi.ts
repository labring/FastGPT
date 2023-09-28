import type { NextApiResponse } from 'next';
import { ChatContextFilter } from '@/service/common/tiktoken';
import type { ChatItemType, QuoteItemType } from '@/types/chat';
import type { ChatHistoryItemResType } from '@/types/chat';
import { ChatRoleEnum, sseResponseEventEnum } from '@/constants/chat';
import { SSEParseData, parseStreamChunk } from '@/utils/sse';
import { textAdaptGptResponse } from '@/utils/adapt';
import { getAIChatApi, axiosConfig } from '@fastgpt/core/aiApi/config';
import { TaskResponseKeyEnum } from '@/constants/chat';
import { getChatModel } from '@/service/utils/data';
import { countModelPrice } from '@/service/common/bill/push';
import { ChatModelItemType } from '@/types/model';
import { textCensor } from '@/api/service/plugins';
import { ChatCompletionRequestMessageRoleEnum } from '@fastgpt/core/aiApi/constant';
import { AppModuleItemType } from '@/types/app';
import { countMessagesTokens, sliceMessagesTB } from '@/utils/common/tiktoken';
import { adaptChat2GptMessages } from '@/utils/common/adapt/message';
import { defaultQuotePrompt, defaultQuoteTemplate } from '@/prompts/core/AIChat';
import type { AIChatProps } from '@/types/core/aiChat';
import { replaceVariable } from '@/utils/common/tools/text';
import { FlowModuleTypeEnum } from '@/constants/flow';
import type { ModuleDispatchProps } from '@/types/core/chat/type';
import { Readable } from 'stream';
import { responseWrite, responseWriteController } from '@/service/common/stream';
import { addLog } from '@/service/utils/tools';

export type ChatProps = ModuleDispatchProps<
  AIChatProps & {
    userChatInput: string;
    history?: ChatItemType[];
    quoteQA?: QuoteItemType[];
    limitPrompt?: string;
  }
>;
export type ChatResponse = {
  [TaskResponseKeyEnum.answerText]: string;
  [TaskResponseKeyEnum.responseData]: ChatHistoryItemResType;
  finish: boolean;
};

/* request openai chat */
export const dispatchChatCompletion = async (props: ChatProps): Promise<ChatResponse> => {
  let {
    res,
    moduleName,
    stream = false,
    detail = false,
    userOpenaiAccount,
    outputs,
    inputs: {
      model = global.chatModels[0]?.model,
      temperature = 0,
      maxToken = 4000,
      history = [],
      quoteQA = [],
      userChatInput,
      systemPrompt = '',
      limitPrompt,
      quoteTemplate,
      quotePrompt
    }
  } = props;
  if (!userChatInput) {
    return Promise.reject('Question is empty');
  }

  // temperature adapt
  const modelConstantsData = getChatModel(model);

  if (!modelConstantsData) {
    return Promise.reject('The chat model is undefined, you need to select a chat model.');
  }

  const { filterQuoteQA, quoteText } = filterQuote({
    quoteQA,
    model: modelConstantsData,
    quoteTemplate
  });

  if (modelConstantsData.censor) {
    await textCensor({
      text: `${systemPrompt}
      ${quoteText}
      ${userChatInput}
      `
    });
  }

  const { messages, filterMessages } = getChatMessages({
    model: modelConstantsData,
    history,
    quoteText,
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

  // FastGPT temperature range: 1~10
  temperature = +(modelConstantsData.maxTemperature * (temperature / 10)).toFixed(2);
  temperature = Math.max(temperature, 0.01);
  const chatAPI = getAIChatApi(userOpenaiAccount);

  const response = await chatAPI.createChatCompletion(
    {
      model,
      temperature,
      max_tokens,
      messages: [
        ...(modelConstantsData.defaultSystem
          ? [
              {
                role: ChatCompletionRequestMessageRoleEnum.System,
                content: modelConstantsData.defaultSystem
              }
            ]
          : []),
        ...messages
      ],
      stream
    },
    {
      timeout: 480000,
      responseType: stream ? 'stream' : 'json',
      ...axiosConfig(userOpenaiAccount)
    }
  );

  const { answerText, totalTokens, completeMessages } = await (async () => {
    if (stream) {
      // sse response
      const { answer } = await streamResponse({
        res,
        detail,
        response
      });
      // count tokens
      const completeMessages = filterMessages.concat({
        obj: ChatRoleEnum.AI,
        value: answer
      });

      const totalTokens = countMessagesTokens({
        messages: completeMessages
      });

      targetResponse({ res, detail, outputs });

      return {
        answerText: answer,
        totalTokens,
        completeMessages
      };
    } else {
      const answer = response.data.choices?.[0].message?.content || '';
      const totalTokens = response.data.usage?.total_tokens || 0;

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
      moduleType: FlowModuleTypeEnum.chatNode,
      moduleName,
      price: userOpenaiAccount?.key ? 0 : countModelPrice({ model, tokens: totalTokens }),
      model: modelConstantsData.name,
      tokens: totalTokens,
      question: userChatInput,
      maxToken: max_tokens,
      quoteList: filterQuoteQA,
      historyPreview: getHistoryPreview(completeMessages)
    },
    finish: true
  };
};

function filterQuote({
  quoteQA = [],
  model,
  quoteTemplate
}: {
  quoteQA: ChatProps['inputs']['quoteQA'];
  model: ChatModelItemType;
  quoteTemplate?: string;
}) {
  const sliceResult = sliceMessagesTB({
    maxTokens: model.quoteMaxToken,
    messages: quoteQA.map((item, index) => ({
      obj: ChatRoleEnum.System,
      value: replaceVariable(quoteTemplate || defaultQuoteTemplate, {
        ...item,
        index: `${index + 1}`
      })
    }))
  });

  // slice filterSearch
  const filterQuoteQA = quoteQA.slice(0, sliceResult.length);

  const quoteText =
    filterQuoteQA.length > 0
      ? `${filterQuoteQA
          .map((item, index) =>
            replaceVariable(quoteTemplate || defaultQuoteTemplate, {
              ...item,
              index: `${index + 1}`
            })
          )
          .join('\n')}`
      : '';

  return {
    filterQuoteQA,
    quoteText
  };
}
function getChatMessages({
  quotePrompt,
  quoteText,
  history = [],
  systemPrompt,
  limitPrompt,
  userChatInput,
  model
}: {
  quotePrompt?: string;
  quoteText: string;
  history: ChatProps['inputs']['history'];
  systemPrompt: string;
  limitPrompt?: string;
  userChatInput: string;
  model: ChatModelItemType;
}) {
  const question = quoteText
    ? replaceVariable(quotePrompt || defaultQuotePrompt, {
        quote: quoteText,
        question: userChatInput
      })
    : userChatInput;

  const messages: ChatItemType[] = [
    ...(systemPrompt
      ? [
          {
            obj: ChatRoleEnum.System,
            value: systemPrompt
          }
        ]
      : []),
    ...history,
    ...(limitPrompt
      ? [
          {
            obj: ChatRoleEnum.System,
            value: limitPrompt
          }
        ]
      : []),
    {
      obj: ChatRoleEnum.Human,
      value: question
    }
  ];

  const filterMessages = ChatContextFilter({
    messages,
    maxTokens: Math.ceil(model.contextMaxToken - 300) // filter token. not response maxToken
  });

  const adaptMessages = adaptChat2GptMessages({ messages: filterMessages, reserveId: false });

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
  filterMessages: ChatProps['inputs']['history'];
}) {
  const tokensLimit = model.contextMaxToken;
  /* count response max token */

  const promptsToken = countMessagesTokens({
    messages: filterMessages
  });
  maxToken = maxToken + promptsToken > tokensLimit ? tokensLimit - promptsToken : maxToken;

  return {
    max_tokens: maxToken
  };
}

function targetResponse({
  res,
  outputs,
  detail
}: {
  res: NextApiResponse;
  outputs: AppModuleItemType['outputs'];
  detail: boolean;
}) {
  const targets =
    outputs.find((output) => output.key === TaskResponseKeyEnum.answerText)?.targets || [];

  if (targets.length === 0) return;
  responseWrite({
    res,
    event: detail ? sseResponseEventEnum.answer : undefined,
    data: textAdaptGptResponse({
      text: '\n'
    })
  });
}

async function streamResponse({
  res,
  detail,
  response
}: {
  res: NextApiResponse;
  detail: boolean;
  response: any;
}) {
  return new Promise<{ answer: string }>((resolve, reject) => {
    const stream = response.data as Readable;
    let answer = '';
    const parseData = new SSEParseData();

    const write = responseWriteController({
      res,
      readStream: stream
    });

    stream.on('data', (data) => {
      if (res.closed) {
        stream.destroy();
        return resolve({ answer });
      }

      const parse = parseStreamChunk(data);
      parse.forEach((item) => {
        const { data } = parseData.parse(item);
        if (!data || data === '[DONE]') return;

        const content: string = data?.choices?.[0]?.delta?.content || '';
        if (data.error) {
          addLog.error(`SSE response`, data.error);
        } else {
          answer += content;

          responseWrite({
            write,
            event: detail ? sseResponseEventEnum.answer : undefined,
            data: textAdaptGptResponse({
              text: content
            })
          });
        }
      });
    });
    stream.on('end', () => {
      resolve({ answer });
    });
    stream.on('close', () => {
      resolve({ answer });
    });
    stream.on('error', (err) => {
      reject(err);
    });
  });
}

function getHistoryPreview(completeMessages: ChatItemType[]) {
  return completeMessages.map((item, i) => {
    if (item.obj === ChatRoleEnum.System) return item;
    if (i >= completeMessages.length - 2) return item;
    return {
      ...item,
      value: item.value.length > 15 ? `${item.value.slice(0, 15)}...` : item.value
    };
  });
}
