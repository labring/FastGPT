import type { NextApiRequest, NextApiResponse } from 'next';
import { Readable } from 'stream';
import { connectToDatabase, ChatWindow } from '@/service/mongo';
import type { ModelType } from '@/types/model';
import { getOpenAIApi, authChat } from '@/service/utils/chat';
import { openaiProxy } from '@/service/utils/tools';
import { ChatCompletionRequestMessage, ChatCompletionRequestMessageRoleEnum } from 'openai';
import { ChatItemType } from '@/types/chat';

/* 发送提示词 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Content-Type', 'text/event-stream');

  const responseData: string[] = [];
  const stream = new Readable({
    read(size) {
      const data = responseData.shift() || null;
      this.push(data);
    }
  });

  res.on('close', () => {
    res.end();
    stream.destroy();
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
        content: item.value.replace(/(\n| )/g, '')
      })
    );
    // 第一句话，强调代码类型
    formatPrompts.unshift({
      role: ChatCompletionRequestMessageRoleEnum.System,
      content:
        'If the content is code or code blocks, please mark the code type as accurately as possible!'
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
      openaiProxy
    );

    // 截取字符串内容
    const reg = /{"content"(.*)"}/g;
    // @ts-ignore
    const match = chatResponse.data.match(reg);
    if (!match) return;

    let AIResponse = '';

    // 循环给 stream push 内容
    match.forEach((item: string, i: number) => {
      try {
        const json = JSON.parse(item);
        // 开头的换行忽略
        if (i === 0 && json.content?.startsWith('\n')) return;
        AIResponse += json.content;
        const content = json.content.replace(/\n/g, '<br/>'); // 无法直接传输\n
        if (content) {
          responseData.push(`event: responseData\ndata: ${content}\n\n`);
          // res.write(`event: responseData\n`)
          // res.write(`data: ${content}\n\n`)
        }
      } catch (err) {
        err;
      }
    });

    responseData.push(`event: done\ndata: \n\n`);
    // 存入库
    (async () => {
      await ChatWindow.findByIdAndUpdate(windowId, {
        $push: {
          content: {
            obj: 'AI',
            value: AIResponse
          }
        },
        updateTime: Date.now()
      });
    })();
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
    responseData.push(`event: serviceError\ndata: ${errorText}\n\n`);

    // 删除最一条数据库记录, 也就是预发送的那一条
    (async () => {
      await ChatWindow.findByIdAndUpdate(windowId, {
        $pop: { content: 1 },
        updateTime: Date.now()
      });
    })();
  }

  // 开启 stream 传输
  stream.pipe(res);
}
