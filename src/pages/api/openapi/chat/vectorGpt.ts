import type { NextApiRequest, NextApiResponse } from 'next';
import { connectToDatabase, Model } from '@/service/mongo';
import { axiosConfig, systemPromptFilter, openaiChatFilter } from '@/service/utils/tools';
import { getOpenAIApi, authOpenApiKey } from '@/service/utils/auth';
import { ChatItemSimpleType } from '@/types/chat';
import { jsonRes } from '@/service/response';
import { PassThrough } from 'stream';
import { modelList, ModelVectorSearchModeMap, ModelVectorSearchModeEnum } from '@/constants/model';
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
    const {
      prompts,
      modelId,
      isStream = true
    } = req.body as {
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
      throw new Error('prompts length range 1-30');
    }

    await connectToDatabase();
    let startTime = Date.now();

    /* 凭证校验 */
    const { apiKey, userId } = await authOpenApiKey(req);

    const model = await Model.findOne({
      _id: modelId,
      userId
    });

    if (!model) {
      throw new Error('无权使用该模型');
    }

    const modelConstantsData = modelList.find((item) => item.chatModel === model.chat.chatModel);
    if (!modelConstantsData) {
      throw new Error('模型初始化异常');
    }

    // 获取向量匹配到的提示词
    const { code, searchPrompt } = await searchKb_openai({
      isPay: true,
      apiKey,
      similarity: ModelVectorSearchModeMap[model.chat.searchMode]?.similarity || 0.22,
      text: prompts[prompts.length - 1].value,
      model,
      userId
    });

    // search result is empty
    if (code === 201) {
      return res.send(searchPrompt?.value);
    }

    searchPrompt && prompts.unshift(searchPrompt);

    // 控制在 tokens 数量，防止超出
    const filterPrompts = openaiChatFilter({
      model: model.chat.chatModel,
      prompts,
      maxTokens: modelConstantsData.contextMaxToken - 300
    });

    // console.log(filterPrompts);
    // 计算温度
    const temperature = (modelConstantsData.maxTemperature * (model.chat.temperature / 10)).toFixed(
      2
    );
    const chatAPI = getOpenAIApi(apiKey);

    // 发出请求
    const chatResponse = await chatAPI.createChatCompletion(
      {
        model: model.chat.chatModel,
        temperature: Number(temperature) || 0,
        messages: filterPrompts,
        frequency_penalty: 0.5, // 越大，重复内容越少
        presence_penalty: -0.5, // 越大，越容易出现新内容
        stream: isStream,
        stop: ['.!?。']
      },
      {
        timeout: 180000,
        responseType: isStream ? 'stream' : 'json',
        ...axiosConfig()
      }
    );

    console.log('api response time:', `${(Date.now() - startTime) / 1000}s`);

    let responseContent = '';

    if (isStream) {
      step = 1;
      const streamResponse = await gpt35StreamResponse({
        res,
        stream,
        chatResponse
      });
      responseContent = streamResponse.responseContent;
    } else {
      responseContent = chatResponse.data.choices?.[0]?.message?.content || '';
      jsonRes(res, {
        data: responseContent
      });
    }

    pushChatBill({
      isPay: true,
      chatModel: model.chat.chatModel,
      userId,
      messages: filterPrompts.concat({ role: 'assistant', content: responseContent })
    });
    // jsonRes(res);
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
