import type { NextApiRequest, NextApiResponse } from 'next';
import { createParser, ParsedEvent, ReconnectInterval } from 'eventsource-parser';
import { connectToDatabase, ChatWindow } from '@/service/mongo';
import type { ModelType } from '@/types/model';
import { getOpenAIApi, authChat } from '@/service/utils/chat';
import { httpsAgent } from '@/service/utils/tools';
import { ChatCompletionRequestMessage, ChatCompletionRequestMessageRoleEnum } from 'openai';
import { ChatItemType } from '@/types/chat';
import { jsonRes } from '@/service/response';
import { PassThrough } from 'stream';

/* 发送提示词 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { chatId, windowId, prompt } = req.body as {
    prompt: ChatItemType;
    windowId: string;
    chatId: string;
  };

  try {
    if (!windowId || !chatId || !prompt) {
      throw new Error('缺少参数');
    }

    await connectToDatabase();

    const { chat, userApiKey } = await authChat(chatId);

    const model: ModelType = chat.modelId;

    // 读取对话内容
    const prompts: ChatItemType[] = (await ChatWindow.findById(windowId)).content;
    prompts.push(prompt);

    // 上下文长度过滤
    const maxContext = model.security.contextMaxLen;
    const filterPrompts =
      prompts.length > maxContext + 2
        ? [prompts[0], ...prompts.slice(prompts.length - maxContext)]
        : prompts.slice(0, prompts.length);

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
    // 第一句话，强调代码类型
    formatPrompts.unshift({
      role: ChatCompletionRequestMessageRoleEnum.System,
      content: '如果你想返回代码，请务必声明代码的类型！并且在代码块前加一个换行符。'
    });

    // 获取 chatAPI
    const chatAPI = getOpenAIApi(userApiKey);
    let startTime = Date.now();
    // 发出请求
    const chatResponse = await chatAPI.createChatCompletion(
      {
        model: model.service.chatModel,
        temperature: 1,
        // max_tokens: model.security.contentMaxLen,
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
      `${(Date.now() - startTime) / 1000}s`,
      formatPrompts.reduce((sum, item) => sum + item.content.length, 0)
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
