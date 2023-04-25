import type { NextApiRequest, NextApiResponse } from 'next';
import { connectToDatabase } from '@/service/mongo';
import { authChat } from '@/service/utils/auth';
import { axiosConfig, systemPromptFilter, openaiChatFilter } from '@/service/utils/tools';
import { ChatItemType } from '@/types/chat';
import { jsonRes } from '@/service/response';
import { PassThrough } from 'stream';
import {
  modelList,
  ModelVectorSearchModeMap,
  ModelVectorSearchModeEnum,
  ModelDataStatusEnum
} from '@/constants/model';
import { pushChatBill } from '@/service/events/pushBill';
import { openaiCreateEmbedding, gpt35StreamResponse } from '@/service/utils/openai';
import dayjs from 'dayjs';
import { PgClient } from '@/service/pg';

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
    const { modelId, chatId, prompt } = req.body as {
      modelId: string;
      chatId: '' | string;
      prompt: ChatItemType;
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

    // 获取提示词的向量
    const { vector: promptVector, chatAPI } = await openaiCreateEmbedding({
      isPay: !userApiKey,
      apiKey: userApiKey || systemKey,
      userId,
      text: prompt.value
    });

    // 相似度搜素
    const similarity = ModelVectorSearchModeMap[model.search.mode]?.similarity || 0.22;
    const vectorSearch = await PgClient.select<{ id: string; q: string; a: string }>('modelData', {
      fields: ['id', 'q', 'a'],
      where: [
        ['status', ModelDataStatusEnum.ready],
        'AND',
        ['model_id', model._id],
        'AND',
        `vector <=> '[${promptVector}]' < ${similarity}`
      ],
      order: [{ field: 'vector', mode: `<=> '[${promptVector}]'` }],
      limit: 20
    });

    const formatRedisPrompt: string[] = vectorSearch.rows.map((item) => `${item.q}\n${item.a}`);

    /* 高相似度+退出，无法匹配时直接退出 */
    if (
      formatRedisPrompt.length === 0 &&
      model.search.mode === ModelVectorSearchModeEnum.hightSimilarity
    ) {
      return res.send('对不起，你的问题不在知识库中。');
    }
    /* 高相似度+无上下文，不添加额外知识 */
    if (
      formatRedisPrompt.length === 0 &&
      model.search.mode === ModelVectorSearchModeEnum.noContext
    ) {
      prompts.unshift({
        obj: 'SYSTEM',
        value: model.systemPrompt
      });
    } else {
      // 有匹配情况下，system 添加知识库内容。
      // 系统提示词过滤，最多 2500 tokens
      const systemPrompt = systemPromptFilter({
        model: model.service.chatModel,
        prompts: formatRedisPrompt,
        maxTokens: 2500
      });

      prompts.unshift({
        obj: 'SYSTEM',
        value: `
${model.systemPrompt}
${
  model.search.mode === ModelVectorSearchModeEnum.hightSimilarity
    ? `你只能从知识库选择内容回答.不在知识库内容拒绝回复`
    : ''
}
知识库内容为: 当前时间为${dayjs().format('YYYY/MM/DD HH:mm:ss')}\n${systemPrompt}'
`
      });
    }

    // 控制在 tokens 数量，防止超出
    const filterPrompts = openaiChatFilter({
      model: model.service.chatModel,
      prompts,
      maxTokens: modelConstantsData.contextMaxToken - 500
    });

    // console.log(filterPrompts);
    // 计算温度
    const temperature = modelConstantsData.maxTemperature * (model.temperature / 10);

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
        ...axiosConfig
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
