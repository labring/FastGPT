import type { NextApiRequest, NextApiResponse } from 'next';
import { connectToDatabase } from '@/service/mongo';
import { authOpenApiKey, authModel, getApiKey } from '@/service/utils/auth';
import { modelServiceToolMap, resStreamResponse } from '@/service/utils/chat';
import { ChatItemSimpleType } from '@/types/chat';
import { jsonRes } from '@/service/response';
import { PassThrough } from 'stream';
import { ChatModelMap, ModelVectorSearchModeMap } from '@/constants/model';
import { pushChatBill } from '@/service/events/pushBill';
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
    const {
      chatId,
      prompts,
      modelId,
      isStream = true
    } = req.body as {
      chatId?: string;
      prompts: ChatItemSimpleType[];
      modelId: string;
      isStream: boolean;
    };

    if (!prompts || !modelId) {
      throw new Error('缺少参数');
    }
    if (!Array.isArray(prompts)) {
      throw new Error('prompts is not array');
    }
    if (prompts.length > 30 || prompts.length === 0) {
      throw new Error('Prompts arr length range 1-30');
    }

    await connectToDatabase();
    let startTime = Date.now();

    /* 凭证校验 */
    const { userId } = await authOpenApiKey(req);

    const { model } = await authModel({
      userId,
      modelId
    });

    /* get api key */
    const { systemAuthKey: apiKey } = await getApiKey({
      model: model.chat.chatModel,
      userId,
      mustPay: true
    });

    const modelConstantsData = ChatModelMap[model.chat.chatModel];

    // 使用了知识库搜索
    if (model.chat.relatedKbs.length > 0) {
      const similarity = ModelVectorSearchModeMap[model.chat.searchMode]?.similarity || 0.22;

      const { code, searchPrompts } = await searchKb({
        prompts,
        similarity,
        model,
        userId
      });

      // search result is empty
      if (code === 201) {
        return res.send(searchPrompts[0]?.value);
      }
      prompts.splice(prompts.length - 1, 0, ...searchPrompts);
    } else {
      // 没有用知识库搜索，仅用系统提示词
      model.chat.systemPrompt &&
        prompts.splice(prompts.length - 1, 0, {
          obj: ChatRoleEnum.System,
          value: model.chat.systemPrompt
        });
    }

    // 计算温度
    const temperature = (modelConstantsData.maxTemperature * (model.chat.temperature / 10)).toFixed(
      2
    );

    // 发出请求
    const { streamResponse, responseMessages, responseText, totalTokens } =
      await modelServiceToolMap[model.chat.chatModel].chatCompletion({
        apiKey,
        temperature: +temperature,
        messages: prompts,
        stream: isStream,
        res,
        chatId
      });

    console.log('api response time:', `${(Date.now() - startTime) / 1000}s`);

    let textLen = 0;
    let tokens = totalTokens;

    if (isStream) {
      step = 1;
      const { finishMessages, totalTokens } = await resStreamResponse({
        model: model.chat.chatModel,
        res,
        stream,
        chatResponse: streamResponse,
        prompts
      });
      textLen = finishMessages.map((item) => item.value).join('').length;
      tokens = totalTokens;
    } else {
      textLen = responseMessages.map((item) => item.value).join('').length;
      jsonRes(res, {
        data: responseText
      });
    }

    pushChatBill({
      isPay: true,
      chatModel: model.chat.chatModel,
      userId,
      textLen,
      tokens
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
