import type { NextApiRequest, NextApiResponse } from 'next';
import { createParser, ParsedEvent, ReconnectInterval } from 'eventsource-parser';
import { connectToDatabase, Chat } from '@/service/mongo';
import { getOpenAIApi, authChat } from '@/service/utils/chat';
import { httpsAgent } from '@/service/utils/tools';
import { ChatCompletionRequestMessage, ChatCompletionRequestMessageRoleEnum } from 'openai';
import { ChatItemType } from '@/types/chat';
import { jsonRes } from '@/service/response';
import type { ModelSchema } from '@/types/mongoSchema';
import { PassThrough } from 'stream';
import { ModelList } from '@/constants/model';

/* 发送提示词 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { chatId, prompt } = req.body as {
    prompt: ChatItemType;
    chatId: string;
  };

  try {
    if (!chatId || !prompt) {
      throw new Error('缺少参数');
    }

    await connectToDatabase();

    const { chat, userApiKey } = await authChat(chatId);

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
    const modelConstantsData = ModelList['openai'].find(
      (item) => item.model === model.service.modelName
    );
    if (!modelConstantsData) {
      throw new Error('模型异常');
    }
    const temperature = modelConstantsData.maxTemperature * (model.temperature / 10);

    // 获取 chatAPI
    const chatAPI = getOpenAIApi(userApiKey);
    let startTime = Date.now();
    // 发出请求
    const chatResponse = await chatAPI.createChatCompletion(
      {
        model: model.service.chatModel,
        temperature: temperature,
        max_tokens: modelConstantsData.maxToken,
        messages: formatPrompts,
        stream: true
      },
      {
        timeout: 40000,
        responseType: 'stream',
        httpsAgent
      }
    );
    console.log(
      'response success',
      `time: ${(Date.now() - startTime) / 1000}s`,
      `promptLen: ${formatPrompts.length}`,
      `contentLen: ${formatPrompts.reduce((sum, item) => sum + item.content.length, 0)}`
    );

    // 创建响应流
    res.setHeader('Content-Type', 'text/event-stream;charset-utf-8');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('X-Accel-Buffering', 'no');
    res.setHeader('Cache-Control', 'no-cache, no-transform');

    const pass = new PassThrough();
    pass.pipe(res);

    const onParse = async (event: ParsedEvent | ReconnectInterval) => {
      if (event.type !== 'event') return;
      const data = event.data;
      if (data === '[DONE]') return;
      try {
        const json = JSON.parse(data);
        const content: string = json?.choices?.[0].delta.content || '';
        if (!content) return;
        // console.log('content:', content)
        pass.push(content.replace(/\n/g, '<br/>'));
      } catch (error) {
        error;
      }
    };

    const decoder = new TextDecoder();
    try {
      for await (const chunk of chatResponse.data as any) {
        const parser = createParser(onParse);
        parser.feed(decoder.decode(chunk));
      }
    } catch (error) {
      console.log('pipe error', error);
    }
    pass.push(null);
  } catch (err: any) {
    res.status(500);
    jsonRes(res, {
      code: 500,
      error: err
    });
  }
}
