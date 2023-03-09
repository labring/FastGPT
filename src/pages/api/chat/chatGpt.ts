import type { NextApiRequest, NextApiResponse } from 'next';
import { createParser, ParsedEvent, ReconnectInterval } from 'eventsource-parser';
import { connectToDatabase, ChatWindow } from '@/service/mongo';
import type { ModelType } from '@/types/model';
import { getOpenAIApi, authChat } from '@/service/utils/chat';
import { openaiProxy } from '@/service/utils/tools';
import { ChatCompletionRequestMessage, ChatCompletionRequestMessageRoleEnum } from 'openai';
import { ChatItemType } from '@/types/chat';

/* 发送提示词 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader('Content-Type', 'text/event-stream;charset-utf-8');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('X-Accel-Buffering', 'no');
  res.setHeader('Cache-Control', 'no-cache, no-transform');

  res.on('close', () => {
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
        content: item.value.replace(/\n/g, ' ')
      })
    );
    // 第一句话，强调代码类型
    formatPrompts.unshift({
      role: ChatCompletionRequestMessageRoleEnum.System,
      content: '如果你想返回代码，请务必声明代码的类型！'
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
        responseType: 'stream',
        httpsAgent: openaiProxy?.httpsAgent
      }
    );

    let AIResponse = '';

    // 解析数据
    const decoder = new TextDecoder();
    new ReadableStream({
      async start(controller) {
        // callback
        async function onParse(event: ParsedEvent | ReconnectInterval) {
          if (event.type === 'event') {
            const data = event.data;
            if (data === '[DONE]') {
              controller.close();
              res.write('event: done\ndata: \n\n');
              res.end();
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
              return;
            }
            try {
              const json = JSON.parse(data);
              const content: string = json.choices[0].delta.content || '';
              res.write(`event: responseData\ndata: ${content.replace(/\n/g, '<br/>')}\n\n`);
              AIResponse += content;
            } catch (e) {
              // maybe parse error
              controller.error(e);
              res.end();
            }
          }
        }

        const parser = createParser(onParse);
        for await (const chunk of chatResponse.data as any) {
          parser.feed(decoder.decode(chunk));
        }
      }
    });
  } catch (err: any) {
    let errorText = err;
    if (err.code === 'ECONNRESET') {
      errorText = '服务器代理出错';
    } else {
      switch (err?.response?.data?.error?.code) {
        case 'invalid_api_key':
          errorText = 'API-KEY不合法';
          break;
        case 'context_length_exceeded':
          errorText = '内容超长了，请重置对话';
          break;
        case 'rate_limit_reached':
          errorText = '同时访问用户过多，请稍后再试';
          break;
        case null:
          errorText = 'OpenAI 服务器访问超时';
          break;
        default:
          errorText = '服务器异常';
      }
    }
    console.error(errorText);
    res.write(`event: serviceError\ndata: ${errorText}\n\n`);
    res.end();
    // 删除最一条数据库记录, 也就是预发送的那一条
    await ChatWindow.findByIdAndUpdate(windowId, {
      $pop: { content: 1 },
      updateTime: Date.now()
    });
  }
}
