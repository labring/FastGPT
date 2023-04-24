import type { NextApiRequest, NextApiResponse } from 'next';
import { connectToDatabase } from '@/service/mongo';
import { getOpenAIApi, authChat } from '@/service/utils/auth';
import { httpsAgent, openaiChatFilter } from '@/service/utils/tools';
import { ChatItemType } from '@/types/chat';
import { jsonRes } from '@/service/response';
import { PassThrough } from 'stream';
import { modelList } from '@/constants/model';
import { pushChatBill } from '@/service/events/pushBill';
import { gpt35StreamResponse } from '@/service/utils/openai';

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
      prompt: ChatItemType;
      modelId: string;
      chatId: '' | string;
    };

    const { authorization } = req.headers;
    if (!modelId || !prompt) {
      throw new Error('缺少参数');
    }

    await connectToDatabase();
    let startTime = Date.now();

    const { model, content, userApiKey, systemKey, userId } = await authChat({
      modelId,
      chatId,
      authorization
    });

    const modelConstantsData = modelList.find((item) => item.model === model.service.modelName);
    if (!modelConstantsData) {
      throw new Error('模型加载异常');
    }

    // 读取对话内容
    const prompts = [...content, prompt];

    // 如果有系统提示词，自动插入
    if (model.systemPrompt) {
      prompts.unshift({
        obj: 'SYSTEM',
        value: model.systemPrompt
      });
    }

    // 控制在 tokens 数量，防止超出
    const filterPrompts = openaiChatFilter({
      model: model.service.chatModel,
      prompts,
      maxTokens: modelConstantsData.contextMaxToken - 500
    });

    // 计算温度
    const temperature = modelConstantsData.maxTemperature * (model.temperature / 10);
    // console.log(filterPrompts);
    // 获取 chatAPI
    const chatAPI = getOpenAIApi(userApiKey || systemKey);
    // 发出请求
    const chatResponse = await chatAPI.createChatCompletion(
      {
        model: model.service.chatModel,
        temperature,
        messages: filterPrompts,
        frequency_penalty: 0.5, // 越大，重复内容越少
        presence_penalty: -0.5, // 越大，越容易出现新内容
        stream: true,
        stop: ['.!?。']
      },
      {
        timeout: 40000,
        responseType: 'stream',
        httpsAgent: httpsAgent(!userApiKey)
      }
    );

    console.log('api response time:', `${(Date.now() - startTime) / 1000}s`);

    step = 1;

    const { responseContent } = await gpt35StreamResponse({
      res,
      stream,
      chatResponse
    });

    // 只有使用平台的 key 才计费
    pushChatBill({
      isPay: !userApiKey,
      modelName: model.service.modelName,
      userId,
      chatId,
      messages: filterPrompts.concat({ role: 'assistant', content: responseContent })
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
