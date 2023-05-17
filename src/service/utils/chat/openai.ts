import { Configuration, OpenAIApi } from 'openai';
import { createParser, ParsedEvent, ReconnectInterval } from 'eventsource-parser';
import { axiosConfig } from '../tools';
import { ChatModelMap, embeddingModel, OpenAiChatEnum } from '@/constants/model';
import { pushGenerateVectorBill } from '../../events/pushBill';
import { adaptChatItem_openAI } from '@/utils/chat/openai';
import { modelToolMap } from '@/utils/chat';
import { ChatCompletionType, ChatContextFilter, StreamResponseType } from './index';
import { ChatRoleEnum } from '@/constants/chat';
import { getOpenAiKey } from '../auth';

export const getOpenAIApi = (apiKey: string) => {
  const configuration = new Configuration({
    apiKey,
    basePath: process.env.OPENAI_BASE_URL
  });

  return new OpenAIApi(configuration);
};

/* 获取向量 */
export const openaiCreateEmbedding = async ({
  userOpenAiKey,
  userId,
  textArr
}: {
  userOpenAiKey?: string;
  userId: string;
  textArr: string[];
}) => {
  const systemAuthKey = getOpenAiKey();

  // 获取 chatAPI
  const chatAPI = getOpenAIApi(userOpenAiKey || systemAuthKey);

  // 把输入的内容转成向量
  const res = await chatAPI
    .createEmbedding(
      {
        model: embeddingModel,
        input: textArr
      },
      {
        timeout: 60000,
        ...axiosConfig()
      }
    )
    .then((res) => ({
      tokenLen: res.data.usage.total_tokens || 0,
      vectors: res.data.data.map((item) => item.embedding)
    }));

  pushGenerateVectorBill({
    isPay: !userOpenAiKey,
    userId,
    text: textArr.join(''),
    tokenLen: res.tokenLen
  });

  return {
    vectors: res.vectors,
    chatAPI
  };
};

/* 模型对话 */
export const chatResponse = async ({
  model,
  apiKey,
  temperature,
  messages,
  stream
}: ChatCompletionType & { model: `${OpenAiChatEnum}` }) => {
  const filterMessages = ChatContextFilter({
    model,
    prompts: messages,
    maxTokens: Math.ceil(ChatModelMap[model].contextMaxToken * 0.85)
  });

  const adaptMessages = adaptChatItem_openAI({ messages: filterMessages });
  const chatAPI = getOpenAIApi(apiKey);

  const response = await chatAPI.createChatCompletion(
    {
      model,
      temperature: Number(temperature) || 0,
      messages: adaptMessages,
      frequency_penalty: 0.5, // 越大，重复内容越少
      presence_penalty: -0.5, // 越大，越容易出现新内容
      stream,
      stop: ['.!?。']
    },
    {
      timeout: stream ? 60000 : 240000,
      responseType: stream ? 'stream' : 'json',
      ...axiosConfig()
    }
  );

  const responseText = stream ? '' : response.data.choices[0].message?.content || '';
  const totalTokens = stream ? 0 : response.data.usage?.total_tokens || 0;

  return {
    streamResponse: response,
    responseMessages: filterMessages.concat({ obj: 'AI', value: responseText }),
    responseText,
    totalTokens
  };
};

/* openai stream response */
export const openAiStreamResponse = async ({
  model,
  stream,
  chatResponse,
  prompts
}: StreamResponseType & {
  model: `${OpenAiChatEnum}`;
}) => {
  try {
    let responseContent = '';

    const onParse = async (event: ParsedEvent | ReconnectInterval) => {
      if (event.type !== 'event') return;
      const data = event.data;
      if (data === '[DONE]') return;
      try {
        const json = JSON.parse(data);
        const content: string = json?.choices?.[0].delta.content || '';
        responseContent += content;

        !stream.destroyed && content && stream.push(content.replace(/\n/g, '<br/>'));
      } catch (error) {
        error;
      }
    };

    try {
      const decoder = new TextDecoder();
      const parser = createParser(onParse);
      for await (const chunk of chatResponse.data as any) {
        if (stream.destroyed) {
          // 流被中断了，直接忽略后面的内容
          break;
        }
        parser.feed(decoder.decode(chunk, { stream: true }));
      }
    } catch (error) {
      console.log('pipe error', error);
    }

    // count tokens
    const finishMessages = prompts.concat({
      obj: ChatRoleEnum.AI,
      value: responseContent
    });
    const totalTokens = modelToolMap[model].countTokens({
      messages: finishMessages
    });

    return {
      responseContent,
      totalTokens,
      finishMessages
    };
  } catch (error) {
    return Promise.reject(error);
  }
};
