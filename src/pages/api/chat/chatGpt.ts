import type { NextApiRequest, NextApiResponse } from 'next';
import { createParser, ParsedEvent, ReconnectInterval } from 'eventsource-parser';
import { connectToDatabase, ChatWindow } from '@/service/mongo';
import type { ModelType } from '@/types/model';
import { getOpenAIApi, authChat } from '@/service/utils/chat';
import { httpsAgent } from '@/service/utils/tools';
import { ChatCompletionRequestMessage, ChatCompletionRequestMessageRoleEnum } from 'openai';
import { ChatItemType } from '@/types/chat';
import { openaiError } from '@/service/errorCode';

/* 发送提示词 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader('Content-Type', 'text/event-stream;charset-utf-8');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('X-Accel-Buffering', 'no');
  res.setHeader('Cache-Control', 'no-cache, no-transform');

  res.on('close', () => {
    res.end();
  });
  req.on('error', () => {
    res.end();
  });

  const { chatId, windowId } = req.query as { chatId: string; windowId: string };

  try {
    if (!windowId || !chatId) {
      throw new Error('缺少参数');
    }

    await connectToDatabase();

    const { chat, userApiKey } = await authChat(chatId);

    const model: ModelType = chat.modelId;

    const map = {
      Human: ChatCompletionRequestMessageRoleEnum.User,
      AI: ChatCompletionRequestMessageRoleEnum.Assistant,
      SYSTEM: ChatCompletionRequestMessageRoleEnum.System
    };
    // 读取对话内容
    const prompts: ChatItemType[] = (await ChatWindow.findById(windowId)).content;

    // 长度过滤
    const maxContext = model.security.contextMaxLen;
    const filterPrompts =
      prompts.length > maxContext + 2
        ? [prompts[0], ...prompts.slice(prompts.length - maxContext)]
        : prompts.slice(0, prompts.length);

    // 格式化文本内容
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

    const chatResponse = await chatAPI.createChatCompletion(
      {
        model: model.service.chatModel,
        temperature: 1,
        // max_tokens: model.security.contentMaxLen,
        messages: formatPrompts,
        stream: true
      },
      {
        timeout: 20000,
        responseType: 'stream',
        httpsAgent
      }
    );
    console.log(
      formatPrompts.reduce((sum, item) => sum + item.content.length, 0),
      'response success'
    );

    let AIResponse = '';

    // 解析数据
    const decoder = new TextDecoder();
    const onParse = async (event: ParsedEvent | ReconnectInterval) => {
      if (event.type === 'event') {
        const data = event.data;
        if (data === '[DONE]') {
          // 存入库
          await ChatWindow.findByIdAndUpdate(windowId, {
            $push: {
              content: {
                obj: 'AI',
                value: AIResponse
              }
            },
            updateTime: Date.now()
          });
          res.write('event: done\ndata: \n\n');
          return;
        }
        try {
          const json = JSON.parse(data);
          const content: string = json?.choices?.[0].delta.content || '\n';
          // console.log('content:', content)
          res.write(`event: responseData\ndata: ${content.replace(/\n/g, '<br/>')}\n\n`);
          AIResponse += content;
        } catch (error) {
          error;
        }
      }
    };

    for await (const chunk of chatResponse.data as any) {
      const parser = createParser(onParse);
      parser.feed(decoder.decode(chunk));
    }
  } catch (err: any) {
    console.log('error->', err?.response, '===');
    let errorText = 'OpenAI 服务器访问超时';
    if (err.code === 'ECONNRESET' || err?.response?.status === 502) {
      errorText = '服务器代理出错';
    } else if (err?.response?.statusText && openaiError[err.response.statusText]) {
      errorText = openaiError[err.response.statusText];
    }
    console.log('error->', errorText);
    res.write(`event: serviceError\ndata: ${errorText}\n\n`);
    // 删除最一条数据库记录, 也就是预发送的那一条
    await ChatWindow.findByIdAndUpdate(windowId, {
      $pop: { content: 1 },
      updateTime: Date.now()
    });
    res.end();
  }
}
