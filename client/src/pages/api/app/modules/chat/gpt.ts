// Next.js API route support: https://nextjs.org/docs/api-routes/introduction
import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes, sseErrRes } from '@/service/response';
import { sseResponse } from '@/service/utils/tools';
import { OpenAiChatEnum } from '@/constants/model';
import { adaptChatItem_openAI, countOpenAIToken } from '@/utils/plugin/openai';
import { modelToolMap } from '@/utils/plugin';
import { ChatContextFilter } from '@/service/utils/chat/index';
import type { ChatItemType } from '@/types/chat';
import { ChatRoleEnum, sseResponseEventEnum } from '@/constants/chat';
import { parseStreamChunk, textAdaptGptResponse } from '@/utils/adapt';
import { getOpenAIApi, axiosConfig } from '@/service/ai/openai';
import { SpecificInputEnum } from '@/constants/app';
import { getChatModel } from '@/service/utils/data';
import { countModelPrice, pushTaskBillListItem } from '@/service/events/pushBill';
import { authUser } from '@/service/utils/auth';

export type Props = {
  model: `${OpenAiChatEnum}`;
  temperature?: number;
  maxToken?: number;
  history?: ChatItemType[];
  userChatInput: string;
  stream?: boolean;
  quotePrompt?: string;
  systemPrompt?: string;
  limitPrompt?: string;
  billId?: string;
};
export type Response = { [SpecificInputEnum.answerText]: string; totalTokens: number };

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  let { model, stream } = req.body as Props;
  try {
    await authUser({ req, authRoot: true });

    const response = await chatCompletion({
      ...req.body,
      res,
      model
    });

    if (stream) {
      sseResponse({
        res,
        event: sseResponseEventEnum.moduleFetchResponse,
        data: JSON.stringify(response)
      });
      res.end();
    } else {
      jsonRes(res, {
        data: response
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

/* request openai chat */
export async function chatCompletion({
  res,
  model,
  temperature = 0,
  maxToken = 4000,
  stream = false,
  history = [],
  quotePrompt = '',
  userChatInput,
  systemPrompt = '',
  limitPrompt = '',
  billId
}: Props & { res: NextApiResponse }): Promise<Response> {
  // temperature adapt
  const modelConstantsData = getChatModel(model);

  if (!modelConstantsData) {
    return Promise.reject('The chat model is undefined');
  }

  // FastGpt temperature range: 1~10
  temperature = +(modelConstantsData.maxTemperature * (temperature / 10)).toFixed(2);

  const limitText = (() => {
    if (limitPrompt) return limitPrompt;
    if (quotePrompt && !limitPrompt) {
      return '根据知识库内容回答问题，仅回复知识库提供的内容。';
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
  const modelTokenLimit = getChatModel(model)?.contextMaxToken || 4000;

  const filterMessages = ChatContextFilter({
    model,
    prompts: messages,
    maxTokens: Math.ceil(modelTokenLimit - 300) // filter token. not response maxToken
  });

  const adaptMessages = adaptChatItem_openAI({ messages: filterMessages, reserveId: false });
  const chatAPI = getOpenAIApi();

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

  const { answer, totalTokens } = await (async () => {
    if (stream) {
      // sse response
      const { answer } = await streamResponse({ res, response });
      // count tokens
      const finishMessages = filterMessages.concat({
        obj: ChatRoleEnum.AI,
        value: answer
      });

      const totalTokens = countOpenAIToken({
        messages: finishMessages,
        model: 'gpt-3.5-turbo-16k'
      });

      return {
        answer,
        totalTokens
      };
    } else {
      const answer = stream ? '' : response.data.choices?.[0].message?.content || '';
      const totalTokens = stream ? 0 : response.data.usage?.total_tokens || 0;

      return {
        answer,
        totalTokens
      };
    }
  })();

  await pushTaskBillListItem({
    billId,
    moduleName: 'AI Chat',
    amount: countModelPrice({ model, tokens: totalTokens }),
    model: modelConstantsData.name,
    tokenLen: totalTokens
  });

  return {
    answerText: answer,
    totalTokens
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
