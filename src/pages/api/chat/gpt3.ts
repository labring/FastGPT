// Next.js API route support: https://nextjs.org/docs/api-routes/introduction
import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@/service/response';
import { connectToDatabase } from '@/service/mongo';
import { getOpenAIApi, authChat } from '@/service/utils/chat';
import { ChatItemType } from '@/types/chat';
import { httpsAgent } from '@/service/utils/tools';

/* 发送提示词 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const { prompt, chatId } = req.body as { prompt: ChatItemType[]; chatId: string };

    if (!prompt || !chatId) {
      throw new Error('缺少参数');
    }

    await connectToDatabase();

    const { chat, userApiKey } = await authChat(chatId);

    const model = chat.modelId;

    // 获取 chatAPI
    const chatAPI = getOpenAIApi(userApiKey);

    // prompt处理
    const formatPrompt = prompt.map((item) => `${item.value}\n\n###\n\n`).join('');

    // 发送请求
    const response = await chatAPI.createCompletion(
      {
        model: model.service.modelName,
        prompt: formatPrompt,
        temperature: 0.5,
        max_tokens: model.security.contentMaxLen,
        top_p: 1,
        frequency_penalty: 0,
        presence_penalty: 0.6,
        stop: ['###']
      },
      {
        httpsAgent
      }
    );

    const responseMessage = response.data.choices[0]?.text;

    jsonRes(res, {
      data: responseMessage
    });
  } catch (err: any) {
    jsonRes(res, {
      code: 500,
      error: err
    });
  }
}
