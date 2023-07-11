// Next.js API route support: https://nextjs.org/docs/api-routes/introduction
import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@/service/response';
import { sseResponse } from '@/service/utils/tools';
import { ChatModelMap, OpenAiChatEnum } from '@/constants/model';
import { adaptChatItem_openAI } from '@/utils/plugin/openai';
import { modelToolMap } from '@/utils/plugin';
import { ChatContextFilter } from '@/service/utils/chat/index';
import type { ChatItemType } from '@/types/chat';
import { ChatRoleEnum, sseResponseEventEnum } from '@/constants/chat';
import { parseStreamChunk, textAdaptGptResponse } from '@/utils/adapt';
import { getOpenAIApi, axiosConfig } from '@/service/ai/openai';
import { SpecificInputEnum } from '@/constants/app';

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
};
export type Response = { [SpecificInputEnum.answerText]: string };

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    let {
      model,
      stream = false,
      temperature = 0,
      maxToken = 4000,
      history = [],
      quotePrompt,
      userChatInput,
      systemPrompt,
      limitPrompt
    } = req.body as Props;

    // temperature adapt
    const modelConstantsData = ChatModelMap[model];
    // FastGpt temperature range: 1~10
    temperature = +(modelConstantsData.maxTemperature * (temperature / 10)).toFixed(2);

    const response = await chatCompletion({
      res,
      model,
      temperature,
      maxToken,
      stream,
      history,
      userChatInput,
      systemPrompt,
      limitPrompt,
      quotePrompt
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
    jsonRes(res, {
      code: 500,
      error: err
    });
  }
}

/* request openai chat */
export async function chatCompletion({
  res,
  model = OpenAiChatEnum.GPT35,
  temperature,
  maxToken = 4000,
  stream,
  history = [],
  quotePrompt,
  userChatInput,
  systemPrompt,
  limitPrompt
}: Props & { res: NextApiResponse }): Promise<Response> {
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
    ...(limitPrompt
      ? [
          {
            obj: ChatRoleEnum.Human,
            value: limitPrompt
          }
        ]
      : []),
    {
      obj: ChatRoleEnum.Human,
      value: userChatInput
    }
  ];
  const modelTokenLimit = ChatModelMap[model]?.contextMaxToken || 4000;

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

  const { answer } = await (async () => {
    if (stream) {
      // sse response
      const { answer } = await streamResponse({ res, response });
      // count tokens
      // const finishMessages = filterMessages.concat({
      //   obj: ChatRoleEnum.AI,
      //   value: answer
      // });

      // const totalTokens = modelToolMap[model].countTokens({
      //   messages: finishMessages
      // });

      return {
        answer
        // totalTokens
      };
    } else {
      const answer = stream ? '' : response.data.choices?.[0].message?.content || '';
      // const totalTokens = stream ? 0 : response.data.usage?.total_tokens || 0;

      return {
        answer
        // totalTokens
      };
    }
  })();

  return {
    answerText: answer
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
