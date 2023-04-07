import type { NextApiRequest, NextApiResponse } from 'next';
import { connectToDatabase } from '@/service/mongo';
import { authChat } from '@/service/utils/chat';
import { httpsAgent, openaiChatFilter, systemPromptFilter } from '@/service/utils/tools';
import { ChatCompletionRequestMessage, ChatCompletionRequestMessageRoleEnum } from 'openai';
import { ChatItemType } from '@/types/chat';
import { jsonRes } from '@/service/response';
import type { ModelSchema } from '@/types/mongoSchema';
import { PassThrough } from 'stream';
import { modelList } from '@/constants/model';
import { pushChatBill } from '@/service/events/pushBill';
import { connectRedis } from '@/service/redis';
import { VecModelDataPrefix } from '@/constants/redis';
import { vectorToBuffer } from '@/utils/tools';
import { openaiCreateEmbedding, gpt35StreamResponse } from '@/service/utils/openai';

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
    const { chatId, prompt } = req.body as {
      prompt: ChatItemType;
      chatId: string;
    };

    const { authorization } = req.headers;
    if (!chatId || !prompt) {
      throw new Error('缺少参数');
    }

    await connectToDatabase();
    const redis = await connectRedis();
    let startTime = Date.now();

    const { chat, userApiKey, systemKey, userId } = await authChat(chatId, authorization);

    const model: ModelSchema = chat.modelId;
    const modelConstantsData = modelList.find((item) => item.model === model.service.modelName);
    if (!modelConstantsData) {
      throw new Error('模型加载异常');
    }

    // 读取对话内容
    const prompts = [...chat.content, prompt];

    // 获取提示词的向量
    const { vector: promptVector, chatAPI } = await openaiCreateEmbedding({
      isPay: !userApiKey,
      apiKey: userApiKey || systemKey,
      userId,
      text: prompt.value
    });

    // 搜索系统提示词, 按相似度从 redis 中搜出相关的 q 和 text
    const redisData: any[] = await redis.sendCommand([
      'FT.SEARCH',
      `idx:${VecModelDataPrefix}:hash`,
      `@modelId:{${String(
        chat.modelId._id
      )}} @vector:[VECTOR_RANGE 0.24 $blob]=>{$YIELD_DISTANCE_AS: score}`,
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
      '20',
      'DIALECT',
      '2'
    ]);

    const formatRedisPrompt: string[] = [];
    // 格式化响应值，获取 qa
    for (let i = 2; i < 42; i += 2) {
      const text = redisData[i]?.[1];
      if (text) {
        formatRedisPrompt.push(text);
      }
    }

    if (formatRedisPrompt.length === 0) {
      throw new Error('对不起，我没有找到你的问题');
    }

    // textArr 筛选，最多 2800 tokens
    const systemPrompt = systemPromptFilter(formatRedisPrompt, 2800);

    prompts.unshift({
      obj: 'SYSTEM',
      value: `${model.systemPrompt} 知识库内容是最新的,知识库内容为: "${systemPrompt}"`
    });

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
        // max_tokens: modelConstantsData.maxToken,
        messages: formatPrompts,
        frequency_penalty: 0.5, // 越大，重复内容越少
        presence_penalty: -0.5, // 越大，越容易出现新内容
        stream: true
      },
      {
        timeout: 40000,
        responseType: 'stream',
        httpsAgent
      }
    );

    console.log('api response time:', `${(Date.now() - startTime) / 1000}s`);

    step = 1;

    const { responseContent } = await gpt35StreamResponse({
      res,
      stream,
      chatResponse
    });

    const promptsContent = formatPrompts.map((item) => item.content).join('');
    // 只有使用平台的 key 才计费
    pushChatBill({
      isPay: !userApiKey,
      modelName: model.service.modelName,
      userId,
      chatId,
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
