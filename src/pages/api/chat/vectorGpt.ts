import type { NextApiRequest, NextApiResponse } from 'next';
import { createParser, ParsedEvent, ReconnectInterval } from 'eventsource-parser';
import { connectToDatabase, ModelData } from '@/service/mongo';
import { getOpenAIApi, authChat } from '@/service/utils/chat';
import { httpsAgent, openaiChatFilter, systemPromptFilter } from '@/service/utils/tools';
import { ChatCompletionRequestMessage, ChatCompletionRequestMessageRoleEnum } from 'openai';
import { ChatItemType } from '@/types/chat';
import { jsonRes } from '@/service/response';
import type { ModelSchema } from '@/types/mongoSchema';
import { PassThrough } from 'stream';
import { modelList } from '@/constants/model';
import { pushChatBill } from '@/service/events/pushBill';
import { connectRedis } from '@/service/redis';
import { VecModelDataIndex } from '@/constants/redis';
import { vectorToBuffer } from '@/utils/tools';

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

    // 获取 chatAPI
    const chatAPI = getOpenAIApi(userApiKey || systemKey);

    // 把输入的内容转成向量
    const promptVector = await chatAPI
      .createEmbedding(
        {
          model: 'text-embedding-ada-002',
          input: prompt.value
        },
        {
          timeout: 120000,
          httpsAgent
        }
      )
      .then((res) => res?.data?.data?.[0]?.embedding || []);

    // 搜索系统提示词, 按相似度从 redis 中搜出前3条不同 dataId 的数据
    const redisData: any[] = await redis.sendCommand([
      'FT.SEARCH',
      `idx:${VecModelDataIndex}:hash`,
      `@modelId:{${String(
        chat.modelId._id
      )}} @vector:[VECTOR_RANGE 0.15 $blob]=>{$YIELD_DISTANCE_AS: score}`,
      // `@modelId:{${String(chat.modelId._id)}}=>[KNN 10 @vector $blob AS score]`,
      'RETURN',
      '1',
      'dataId',
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

    // 格式化响应值，获取去重后的id
    let formatIds = [2, 4, 6, 8, 10, 12, 14, 16, 18, 20]
      .map((i) => {
        if (!redisData[i] || !redisData[i][1]) return '';
        return redisData[i][1];
      })
      .filter((item) => item);
    formatIds = Array.from(new Set(formatIds));

    if (formatIds.length === 0) {
      throw new Error('对不起，我没有找到你的问题');
    }

    // 从 mongo 中取出原文作为提示词
    const textArr = (
      await Promise.all(
        [2, 4, 6, 8, 10, 12, 14, 16, 18, 20].map((i) => {
          if (!redisData[i] || !redisData[i][1]) return '';
          return ModelData.findById(redisData[i][1])
            .select('text q')
            .then((res) => {
              if (!res) return '';
              // const questions = res.q.map((item) => item.text).join(' ');
              const answer = res.text;
              return `${answer}`;
            });
        })
      )
    ).filter((item) => item);

    // textArr 筛选，最多 3000 tokens
    const systemPrompt = systemPromptFilter(textArr, 3400);

    prompts.unshift({
      obj: 'SYSTEM',
      value: `${model.systemPrompt}。 我的知识库: "${systemPrompt}"`
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

    // 创建响应流
    res.setHeader('Content-Type', 'text/event-stream;charset-utf-8');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('X-Accel-Buffering', 'no');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    step = 1;

    let responseContent = '';
    stream.pipe(res);

    const onParse = async (event: ParsedEvent | ReconnectInterval) => {
      if (event.type !== 'event') return;
      const data = event.data;
      if (data === '[DONE]') return;
      try {
        const json = JSON.parse(data);
        const content: string = json?.choices?.[0].delta.content || '';
        if (!content || (responseContent === '' && content === '\n')) return;

        responseContent += content;
        // console.log('content:', content)
        !stream.destroyed && stream.push(content.replace(/\n/g, '<br/>'));
      } catch (error) {
        error;
      }
    };

    const decoder = new TextDecoder();
    try {
      for await (const chunk of chatResponse.data as any) {
        if (stream.destroyed) {
          // 流被中断了，直接忽略后面的内容
          break;
        }
        const parser = createParser(onParse);
        parser.feed(decoder.decode(chunk));
      }
    } catch (error) {
      console.log('pipe error', error);
    }
    // close stream
    !stream.destroyed && stream.push(null);
    stream.destroy();

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
