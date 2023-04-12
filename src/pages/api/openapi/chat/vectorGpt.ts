import type { NextApiRequest, NextApiResponse } from 'next';
import { connectToDatabase, Model } from '@/service/mongo';
import {
  httpsAgent,
  openaiChatFilter,
  systemPromptFilter,
  authOpenApiKey
} from '@/service/utils/tools';
import { ChatCompletionRequestMessage, ChatCompletionRequestMessageRoleEnum } from 'openai';
import { ChatItemType } from '@/types/chat';
import { jsonRes } from '@/service/response';
import { PassThrough } from 'stream';
import { modelList, ModelVectorSearchModeMap, ModelVectorSearchModeEnum } from '@/constants/model';
import { pushChatBill } from '@/service/events/pushBill';
import { connectRedis } from '@/service/redis';
import { VecModelDataPrefix } from '@/constants/redis';
import { vectorToBuffer } from '@/utils/tools';
import { openaiCreateEmbedding, gpt35StreamResponse } from '@/service/utils/openai';
import dayjs from 'dayjs';

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
    const redis = await connectRedis();
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

    const modelConstantsData = modelList.find((item) => item.model === model?.service?.modelName);
    if (!modelConstantsData) {
      throw new Error('模型初始化异常');
    }

    // 获取提示词的向量
    const { vector: promptVector, chatAPI } = await openaiCreateEmbedding({
      isPay: true,
      apiKey,
      userId,
      text: prompts[prompts.length - 1].value // 取最后一个
    });

    // 搜索系统提示词, 按相似度从 redis 中搜出相关的 q 和 text
    const similarity = ModelVectorSearchModeMap[model.search.mode]?.similarity || 0.22;
    // 搜索系统提示词, 按相似度从 redis 中搜出相关的 q 和 text
    const redisData: any[] = await redis.sendCommand([
      'FT.SEARCH',
      `idx:${VecModelDataPrefix}:hash`,
      `@modelId:{${modelId}} @vector:[VECTOR_RANGE ${similarity} $blob]=>{$YIELD_DISTANCE_AS: score}`,
      'RETURN',
      '1',
      'text',
      'SORTBY',
      'score',
      'PARAMS',
      '2',
      'blob',
      vectorToBuffer(promptVector),
      'LIMIT',
      '0',
      '30',
      'DIALECT',
      '2'
    ]);

    const formatRedisPrompt: string[] = [];

    // 格式化响应值，获取 qa
    for (let i = 2; i < 61; i += 2) {
      const text = redisData[i]?.[1];
      if (text) {
        formatRedisPrompt.push(text);
      }
    }

    // system 合并
    if (prompts[0].obj === 'SYSTEM') {
      formatRedisPrompt.unshift(prompts.shift()?.value || '');
    }

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
      // 有匹配或者低匹配度模式情况下，添加知识库内容。
      // 系统提示词过滤，最多 2800 tokens
      const systemPrompt = systemPromptFilter(formatRedisPrompt, 2800);

      prompts.unshift({
        obj: 'SYSTEM',
        value: `${model.systemPrompt} 用知识库内容回答，知识库内容为: "当前时间:${dayjs().format(
          'YYYY/MM/DD HH:mm:ss'
        )} ${systemPrompt}"`
      });
    }

    // 控制在 tokens 数量，防止超出
    const filterPrompts = openaiChatFilter(prompts, modelConstantsData.contextMaxToken);

    // 格式化文本内容成 chatgpt 格式
    const map = {
      Human: ChatCompletionRequestMessageRoleEnum.User,
      AI: ChatCompletionRequestMessageRoleEnum.Assistant,
      SYSTEM: ChatCompletionRequestMessageRoleEnum.System
    };
    const formatPrompts: ChatCompletionRequestMessage[] = filterPrompts.map(
      (item: ChatItemType) => ({
        role: map[item.obj],
        content: item.value
      })
    );
    // console.log(formatPrompts);
    // 计算温度
    const temperature = modelConstantsData.maxTemperature * (model.temperature / 10);

    // 发出请求
    const chatResponse = await chatAPI.createChatCompletion(
      {
        model: model.service.chatModel,
        temperature: temperature,
        messages: formatPrompts,
        frequency_penalty: 0.5, // 越大，重复内容越少
        presence_penalty: -0.5, // 越大，越容易出现新内容
        stream: isStream
      },
      {
        timeout: 120000,
        responseType: isStream ? 'stream' : 'json',
        httpsAgent: httpsAgent(true)
      }
    );

    console.log('api response time:', `${(Date.now() - startTime) / 1000}s`);

    step = 1;
    let responseContent = '';

    if (isStream) {
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

    const promptsContent = formatPrompts.map((item) => item.content).join('');
    pushChatBill({
      isPay: true,
      modelName: model.service.modelName,
      userId,
      text: promptsContent + responseContent
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
