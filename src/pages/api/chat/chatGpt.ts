import type { NextApiRequest, NextApiResponse } from 'next';
import { createParser, ParsedEvent, ReconnectInterval } from 'eventsource-parser';
import { connectToDatabase } from '@/service/mongo';
import { getOpenAIApi, authChat } from '@/service/utils/chat';
import { httpsAgent } from '@/service/utils/tools';
import { ChatCompletionRequestMessage, ChatCompletionRequestMessageRoleEnum } from 'openai';
import { ChatItemType } from '@/types/chat';
import { jsonRes } from '@/service/response';
import type { ModelSchema } from '@/types/mongoSchema';
import { PassThrough } from 'stream';
import { modelList } from '@/constants/model';
import { pushBill } from '@/service/events/pushChatBill';

/* 发送提示词 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  let step = 0; // step=1时，表示开始了流响应
  const stream = new PassThrough();
  stream.on('error', () => {
    console.log('error: ', 'stream error');
    stream.destroy();
  });
  res.on('close', () => {
    stream.destroy();
  });
  res.on('error', () => {
    console.log('error: ', 'request error');
    stream.destroy();
  });

  try {
    const { chatId, prompt } = req.body as {
      prompt: ChatItemType;
      chatId: string;
    };
    const { authorization } = req.headers;
    if (!chatId || !prompt) {
      throw new Error('缺少参数');
    }

    await connectToDatabase();

    const { chat, userApiKey, systemKey, userId } = await authChat(chatId, authorization);

    const model: ModelSchema = chat.modelId;

    // 读取对话内容
    const prompts = [...chat.content, prompt];

    // 上下文长度过滤
    const maxContext = model.security.contextMaxLen;
    const filterPrompts =
      prompts.length > maxContext ? prompts.slice(prompts.length - maxContext) : prompts;

    // 格式化文本内容
    const map = {
      Human: ChatCompletionRequestMessageRoleEnum.User,
      AI: ChatCompletionRequestMessageRoleEnum.Assistant,
      SYSTEM: ChatCompletionRequestMessageRoleEnum.System
    };
    const formatPrompts: ChatCompletionRequestMessage[] = filterPrompts.map(
      (item: ChatItemType) => ({
        role: map[item.obj],
        content: item.value
      })
    );

    // 如果有系统提示词，自动插入
    if (model.systemPrompt) {
      formatPrompts.unshift({
        role: 'system',
        content: model.systemPrompt
      });
    }

    // 计算温度
    const modelConstantsData = modelList.find((item) => item.model === model.service.modelName);
    if (!modelConstantsData) {
      throw new Error('模型异常');
    }
    const temperature = modelConstantsData.maxTemperature * (model.temperature / 10);

    // 获取 chatAPI
    const chatAPI = getOpenAIApi(userApiKey || systemKey);
    let startTime = Date.now();
    // 发出请求
    const chatResponse = await chatAPI.createChatCompletion(
      {
        model: model.service.chatModel,
        temperature: temperature,
        // max_tokens: modelConstantsData.maxToken,
        messages: formatPrompts,
        frequency_penalty: 0.5, // 越大，重复内容越少
        presence_penalty: -0.5, // 越大，越容易出现新内容
        stream: true
      },
      {
        timeout: 40000,
        responseType: 'stream',
        httpsAgent
      }
    );

    console.log('api response time:', `${(Date.now() - startTime) / 1000}s`);

    // 创建响应流
    res.setHeader('Content-Type', 'text/event-stream;charset-utf-8');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('X-Accel-Buffering', 'no');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    step = 1;

    let responseContent = '';
    stream.pipe(res);

    const onParse = async (event: ParsedEvent | ReconnectInterval) => {
      if (event.type !== 'event') return;
      const data = event.data;
      if (data === '[DONE]') return;
      try {
        const json = JSON.parse(data);
        const content: string = json?.choices?.[0].delta.content || '';
        if (!content || (responseContent === '' && content === '\n')) return;

        responseContent += content;
        // console.log('content:', content)
        !stream.destroyed && stream.push(content.replace(/\n/g, '<br/>'));
      } catch (error) {
        error;
      }
    };

    const decoder = new TextDecoder();
    try {
      for await (const chunk of chatResponse.data as any) {
        if (stream.destroyed) {
          // 流被中断了，直接忽略后面的内容
          break;
        }
        const parser = createParser(onParse);
        parser.feed(decoder.decode(chunk));
      }
    } catch (error) {
      console.log('pipe error', error);
    }
    // close stream
    !stream.destroyed && stream.push(null);
    stream.destroy();

    const promptsContent = formatPrompts.map((item) => item.content).join('');
    // 只有使用平台的 key 才计费
    !userApiKey &&
      pushBill({
        modelName: model.service.modelName,
        userId,
        chatId,
        text: promptsContent + responseContent
      });
  } catch (err: any) {
    if (step === 1) {
      // 直接结束流
      console.log('error，结束');
      stream.destroy();
    } else {
      res.status(500);
      jsonRes(res, {
        code: 500,
        error: err
      });
    }
  }
}
