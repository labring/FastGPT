import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@/service/response';
import { ChatItemType } from '@/types/chat';
import { connectToDatabase, ChatWindow } from '@/service/mongo';
import type { ModelType } from '@/types/model';
import { authChat } from '@/service/utils/chat';

/* 聊天预请求，存储聊天内容 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const { windowId, prompt, chatId } = req.body as {
      windowId: string;
      prompt: ChatItemType;
      chatId: string;
    };

    if (!windowId || !prompt || !chatId) {
      throw new Error('缺少参数');
    }

    await connectToDatabase();

    const { chat } = await authChat(chatId);

    // 长度校验
    const model: ModelType = chat.modelId;
    if (prompt.value.length > model.security.contentMaxLen) {
      throw new Error('输入内容超长');
    }

    await ChatWindow.findByIdAndUpdate(windowId, {
      $push: { content: prompt },
      updateTime: Date.now()
    });

    jsonRes(res);
  } catch (err) {
    jsonRes(res, {
      code: 500,
      error: err
    });
  }
}
