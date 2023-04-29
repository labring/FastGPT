import type { NextApiRequest, NextApiResponse } from 'next';
import { connectToDatabase } from '@/service/mongo';
import { getOpenAIApi, authOpenApiKey, authModel } from '@/service/utils/auth';
import { axiosConfig, openaiChatFilter, systemPromptFilter } from '@/service/utils/tools';
import { ChatItemType } from '@/types/chat';
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
      prompts: ChatItemType[];
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

    const { model } = await authModel({
      userId,
      modelId
    });

    const modelConstantsData = modelList.find((item) => item.chatModel === model.chat.chatModel);
    if (!modelConstantsData) {
      throw new Error('模型加载异常');
    }

    // 使用了知识库搜索
    if (model.chat.useKb) {
      const similarity = ModelVectorSearchModeMap[model.chat.searchMode]?.similarity || 0.22;

      const { systemPrompts } = await searchKb_openai({
        apiKey,
        isPay: true,
        text: prompts[prompts.length - 1].value,
        similarity,
        modelId,
        userId
      });

      // filter system prompt
      if (
        systemPrompts.length === 0 &&
        model.chat.searchMode === ModelVectorSearchModeEnum.hightSimilarity
      ) {
        return jsonRes(res, {
          code: 500,
          message: '对不起，你的问题不在知识库中。',
          data: '对不起，你的问题不在知识库中。'
        });
      }
      /* 高相似度+无上下文，不添加额外知识,仅用系统提示词 */
      if (
        systemPrompts.length === 0 &&
        model.chat.searchMode === ModelVectorSearchModeEnum.noContext
      ) {
        prompts.unshift({
          obj: 'SYSTEM',
          value: model.chat.systemPrompt
        });
      } else {
        // 有匹配情况下，system 添加知识库内容。
        // 系统提示词过滤，最多 2500 tokens
        const filterSystemPrompt = systemPromptFilter({
          model: model.chat.chatModel,
          prompts: systemPrompts,
          maxTokens: 2500
        });

        prompts.unshift({
          obj: 'SYSTEM',
          value: `
  ${model.chat.systemPrompt}
  ${
    model.chat.searchMode === ModelVectorSearchModeEnum.hightSimilarity
      ? `不回答知识库外的内容.`
      : ''
  }
  知识库内容为: ${filterSystemPrompt}'
  `
        });
      }
    } else {
      // 没有用知识库搜索，仅用系统提示词
      if (model.chat.systemPrompt) {
        prompts.unshift({
          obj: 'SYSTEM',
          value: model.chat.systemPrompt
        });
      }
    }

    // 控制总 tokens 数量，防止超出
    const filterPrompts = openaiChatFilter({
      model: model.chat.chatModel,
      prompts,
      maxTokens: modelConstantsData.contextMaxToken - 500
    });

    // 计算温度
    const temperature = (modelConstantsData.maxTemperature * (model.chat.temperature / 10)).toFixed(
      2
    );
    // console.log(filterPrompts);
    // 获取 chatAPI
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

    // 只有使用平台的 key 才计费
    pushChatBill({
      isPay: true,
      chatModel: model.chat.chatModel,
      userId,
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
