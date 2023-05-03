import type { NextApiRequest, NextApiResponse } from 'next';
import { connectToDatabase } from '@/service/mongo';
import { authChat } from '@/service/utils/auth';
import { modelServiceToolMap } from '@/service/utils/chat';
import { ChatItemSimpleType } from '@/types/chat';
import { jsonRes } from '@/service/response';
import { PassThrough } from 'stream';
import { ChatModelMap, ModelVectorSearchModeMap } from '@/constants/model';
import { pushChatBill } from '@/service/events/pushBill';
import { resStreamResponse } from '@/service/utils/chat';
import { searchKb } from '@/service/plugins/searchKb';
import { ChatRoleEnum } from '@/constants/chat';

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
    const { chatId, prompt, modelId } = req.body as {
      prompt: ChatItemSimpleType;
      modelId: string;
      chatId: '' | string;
    };

    const { authorization } = req.headers;
    if (!modelId || !prompt) {
      throw new Error('缺少参数');
    }

    await connectToDatabase();
    let startTime = Date.now();

    const { model, showModelDetail, content, userApiKey, systemApiKey, userId } = await authChat({
      modelId,
      chatId,
      authorization
    });

    const modelConstantsData = ChatModelMap[model.chat.chatModel];

    // 读取对话内容
    const prompts = [...content, prompt];

    // 使用了知识库搜索
    if (model.chat.useKb) {
      const { code, searchPrompt } = await searchKb({
        userApiKey,
        systemApiKey,
        text: prompt.value,
        similarity: ModelVectorSearchModeMap[model.chat.searchMode]?.similarity,
        model,
        userId
      });

      // search result is empty
      if (code === 201) {
        return res.send(searchPrompt?.value);
      }

      searchPrompt && prompts.unshift(searchPrompt);
    } else {
      // 没有用知识库搜索，仅用系统提示词
      model.chat.systemPrompt &&
        prompts.unshift({
          obj: ChatRoleEnum.System,
          value: model.chat.systemPrompt
        });
    }

    // 计算温度
    const temperature = (modelConstantsData.maxTemperature * (model.chat.temperature / 10)).toFixed(
      2
    );
    // console.log(filterPrompts);

    // 发出请求
    const { streamResponse } = await modelServiceToolMap[model.chat.chatModel].chatCompletion({
      apiKey: userApiKey || systemApiKey,
      temperature: +temperature,
      messages: prompts,
      stream: true
    });

    console.log('api response time:', `${(Date.now() - startTime) / 1000}s`);

    step = 1;

    const { totalTokens, finishMessages } = await resStreamResponse({
      model: model.chat.chatModel,
      res,
      stream,
      chatResponse: streamResponse,
      prompts,
      systemPrompt:
        showModelDetail && prompts[0].obj === ChatRoleEnum.System ? prompts[0].value : ''
    });

    // 只有使用平台的 key 才计费
    pushChatBill({
      isPay: !userApiKey,
      chatModel: model.chat.chatModel,
      userId,
      chatId,
      textLen: finishMessages.map((item) => item.value).join('').length,
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
