import type { NextApiRequest, NextApiResponse } from 'next';
import { connectToDatabase } from '@/service/mongo';
import { getOpenAIApi, authChat } from '@/service/utils/auth';
import { axiosConfig, openaiChatFilter } from '@/service/utils/tools';
import { ChatItemSimpleType } from '@/types/chat';
import { jsonRes } from '@/service/response';
import { PassThrough } from 'stream';
import { ChatModelMap, ModelVectorSearchModeMap } from '@/constants/model';
import { pushChatBill } from '@/service/events/pushBill';
import { gpt35StreamResponse } from '@/service/utils/openai';
import { searchKb_openai } from '@/service/tools/searchKb';

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

    const { model, showModelDetail, content, userApiKey, systemKey, userId } = await authChat({
      modelId,
      chatId,
      authorization
    });

    const modelConstantsData = ChatModelMap[model.chat.chatModel];

    // 读取对话内容
    const prompts = [...content, prompt];

    // 使用了知识库搜索
    if (model.chat.useKb) {
      const { code, searchPrompt } = await searchKb_openai({
        apiKey: userApiKey || systemKey,
        isPay: !userApiKey,
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
          obj: 'SYSTEM',
          value: model.chat.systemPrompt
        });
    }

    // 控制总 tokens 数量，防止超出
    const filterPrompts = openaiChatFilter({
      model: model.chat.chatModel,
      prompts,
      maxTokens: modelConstantsData.contextMaxToken - 300
    });

    // 计算温度
    const temperature = (modelConstantsData.maxTemperature * (model.chat.temperature / 10)).toFixed(
      2
    );
    // console.log(filterPrompts);
    // 获取 chatAPI
    const chatAPI = getOpenAIApi(userApiKey || systemKey);
    // 发出请求
    const chatResponse = await chatAPI.createChatCompletion(
      {
        model: model.chat.chatModel,
        temperature: Number(temperature) || 0,
        messages: filterPrompts,
        frequency_penalty: 0.5, // 越大，重复内容越少
        presence_penalty: -0.5, // 越大，越容易出现新内容
        stream: true,
        stop: ['.!?。']
      },
      {
        timeout: 40000,
        responseType: 'stream',
        ...axiosConfig()
      }
    );

    console.log('api response time:', `${(Date.now() - startTime) / 1000}s`);

    step = 1;

    const { responseContent } = await gpt35StreamResponse({
      res,
      stream,
      chatResponse,
      systemPrompt:
        showModelDetail && filterPrompts[0].role === 'system' ? filterPrompts[0].content : ''
    });

    // 只有使用平台的 key 才计费
    pushChatBill({
      isPay: !userApiKey,
      chatModel: model.chat.chatModel,
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
