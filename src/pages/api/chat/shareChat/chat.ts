import type { NextApiRequest, NextApiResponse } from 'next';
import { connectToDatabase } from '@/service/mongo';
import { authShareChat } from '@/service/utils/auth';
import { modelServiceToolMap } from '@/service/utils/chat';
import { ChatItemSimpleType } from '@/types/chat';
import { jsonRes } from '@/service/response';
import { PassThrough } from 'stream';
import { ChatModelMap, ModelVectorSearchModeMap } from '@/constants/model';
import { pushChatBill, updateShareChatBill } from '@/service/events/pushBill';
import { resStreamResponse } from '@/service/utils/chat';
import { searchKb } from '@/service/plugins/searchKb';
import { ChatRoleEnum } from '@/constants/chat';

/* 发送提示词 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  let step = 0; // step=1 时，表示开始了流响应
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
    const { shareId, password, historyId, prompts } = req.body as {
      prompts: ChatItemSimpleType[];
      password: string;
      shareId: string;
      historyId: string;
    };

    if (!historyId || !prompts) {
      throw new Error('分享链接无效');
    }

    await connectToDatabase();
    let startTime = Date.now();

    const { model, showModelDetail, userOpenAiKey, systemAuthKey, userId } = await authShareChat({
      shareId,
      password
    });

    const modelConstantsData = ChatModelMap[model.chat.chatModel];

    // 使用了知识库搜索
    if (model.chat.relatedKbs.length > 0) {
      const { code, searchPrompts } = await searchKb({
        userOpenAiKey,
        prompts,
        similarity: ModelVectorSearchModeMap[model.chat.searchMode]?.similarity,
        model,
        userId
      });

      // search result is empty
      if (code === 201) {
        return res.send(searchPrompts[0]?.value);
      }

      prompts.splice(prompts.length - 3, 0, ...searchPrompts);
    } else {
      // 没有用知识库搜索，仅用系统提示词
      model.chat.systemPrompt &&
        prompts.splice(prompts.length - 3, 0, {
          obj: ChatRoleEnum.System,
          value: model.chat.systemPrompt
        });
    }

    // 计算温度
    const temperature = (modelConstantsData.maxTemperature * (model.chat.temperature / 10)).toFixed(
      2
    );

    // 发出请求
    const { streamResponse } = await modelServiceToolMap[model.chat.chatModel].chatCompletion({
      apiKey: userOpenAiKey || systemAuthKey,
      temperature: +temperature,
      messages: prompts,
      stream: true,
      res,
      chatId: historyId
    });

    console.log('api response time:', `${(Date.now() - startTime) / 1000}s`);

    step = 1;

    const { totalTokens, finishMessages } = await resStreamResponse({
      model: model.chat.chatModel,
      res,
      stream,
      chatResponse: streamResponse,
      prompts,
      systemPrompt: ''
    });

    /* bill */
    pushChatBill({
      isPay: !userOpenAiKey,
      chatModel: model.chat.chatModel,
      userId,
      textLen: finishMessages.map((item) => item.value).join('').length,
      tokens: totalTokens
    });
    updateShareChatBill({
      shareId,
      tokens: totalTokens
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
