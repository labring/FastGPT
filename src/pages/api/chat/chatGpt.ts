// Next.js API route support: https://nextjs.org/docs/api-routes/introduction
import type { NextApiRequest, NextApiResponse } from 'next';
import { connectToDatabase, Chat, ChatWindow } from '@/service/mongo';
import type { ModelType } from '@/types/model';
import { getOpenAIApi, authChat } from '@/service/utils/chat';
import { openaiProxy } from '@/service/utils/tools';
import { ChatCompletionRequestMessage, ChatCompletionRequestMessageRoleEnum } from 'openai';
import { ChatItemType } from '@/types/chat';

/* 发送提示词 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.writeHead(200, {
    Connection: 'keep-alive',
    'Content-Encoding': 'none',
    'Cache-Control': 'no-cache',
    'Content-Type': 'text/event-stream'
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
      content:
        'If the content is code or code blocks, please label the code type as accurately as possible.'
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
    let AIResponse = '';
    if (match) {
      match.forEach((item: string, i: number) => {
        try {
          const json = JSON.parse(item);
          // 开头的换行忽略
          if (i === 0 && json.content?.startsWith('\n')) return;
          AIResponse += json.content;
          const content = json.content.replace(/\n/g, '<br/>'); // 无法直接传输\n
          content && res.write(`data: ${content}\n\n`);
        } catch (err) {
          err;
        }
      });
    }
    res.write(`data: [DONE]\n\n`);

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

    res.end();
  } catch (err: any) {
    console.log(err?.response?.data || err);
    // 删除最一条数据库记录, 也就是预发送的那一条
    await ChatWindow.findByIdAndUpdate(windowId, {
      $pop: { content: 1 },
      updateTime: Date.now()
    });

    res.end();
  }
}
