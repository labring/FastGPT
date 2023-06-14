import { Configuration, OpenAIApi } from 'openai';
import { createParser, ParsedEvent, ReconnectInterval } from 'eventsource-parser';
import { axiosConfig } from '../tools';
import { ChatModelMap, OpenAiChatEnum } from '@/constants/model';
import { adaptChatItem_openAI } from '@/utils/plugin/openai';
import { modelToolMap } from '@/utils/plugin';
import { ChatCompletionType, ChatContextFilter, StreamResponseType } from './index';
import { ChatRoleEnum } from '@/constants/chat';

export const getOpenAIApi = () =>
  new OpenAIApi(
    new Configuration({
      basePath: process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1'
    })
  );

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
  const chatAPI = getOpenAIApi();

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
      timeout: stream ? 60000 : 480000,
      responseType: stream ? 'stream' : 'json',
      ...axiosConfig(apiKey)
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
  res,
  model,
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

        !res.closed && content && res.write(content);
      } catch (error) {
        error;
      }
    };

    try {
      const decoder = new TextDecoder();
      const parser = createParser(onParse);
      for await (const chunk of chatResponse.data as any) {
        if (res.closed) {
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
