import type { NextApiResponse } from 'next';
import type { PassThrough } from 'stream';
import { createParser, ParsedEvent, ReconnectInterval } from 'eventsource-parser';
import { getOpenAIApi } from '@/service/utils/auth';
import { axiosConfig } from './tools';
import { User } from '../models/user';
import { formatPrice } from '@/utils/user';
import { embeddingModel } from '@/constants/model';
import { pushGenerateVectorBill } from '../events/pushBill';

/* 获取用户 api 的 openai 信息 */
export const getUserApiOpenai = async (userId: string) => {
  const user = await User.findById(userId);

  const userApiKey = user?.openaiKey;

  if (!userApiKey) {
    return Promise.reject('缺少ApiKey, 无法请求');
  }

  return {
    user,
    openai: getOpenAIApi(userApiKey),
    apiKey: userApiKey
  };
};

/* 获取 open api key，如果用户没有自己的key，就用平台的，用平台记得加账单 */
export const getOpenApiKey = async (userId: string) => {
  const user = await User.findById(userId);
  if (!user) {
    return Promise.reject({
      code: 501,
      message: '找不到用户'
    });
  }

  const userApiKey = user?.openaiKey;

  // 有自己的key
  if (userApiKey) {
    return {
      user,
      userApiKey,
      systemKey: ''
    };
  }

  // 平台账号余额校验
  if (formatPrice(user.balance) <= 0) {
    return Promise.reject({
      code: 501,
      message: '账号余额不足'
    });
  }

  return {
    user,
    userApiKey: '',
    systemKey: process.env.OPENAIKEY as string
  };
};

/* 获取向量 */
export const openaiCreateEmbedding = async ({
  isPay,
  userId,
  apiKey,
  text
}: {
  isPay: boolean;
  userId: string;
  apiKey: string;
  text: string;
}) => {
  // 获取 chatAPI
  const chatAPI = getOpenAIApi(apiKey);

  // 把输入的内容转成向量
  const res = await chatAPI
    .createEmbedding(
      {
        model: embeddingModel,
        input: text
      },
      {
        timeout: 60000,
        ...axiosConfig
      }
    )
    .then((res) => ({
      tokenLen: res.data.usage.total_tokens || 0,
      vector: res?.data?.data?.[0]?.embedding || []
    }));

  pushGenerateVectorBill({
    isPay,
    userId,
    text,
    tokenLen: res.tokenLen
  });

  return {
    vector: res.vector,
    chatAPI
  };
};

/* gpt35 响应 */
export const gpt35StreamResponse = ({
  res,
  stream,
  chatResponse
}: {
  res: NextApiResponse;
  stream: PassThrough;
  chatResponse: any;
}) =>
  new Promise<{ responseContent: string }>(async (resolve, reject) => {
    try {
      // 创建响应流
      res.setHeader('Content-Type', 'text/event-stream;charset-utf-8');
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('X-Accel-Buffering', 'no');
      res.setHeader('Cache-Control', 'no-cache, no-transform');
      stream.pipe(res);

      let responseContent = '';

      const onParse = async (event: ParsedEvent | ReconnectInterval) => {
        if (event.type !== 'event') return;
        const data = event.data;
        if (data === '[DONE]') return;
        try {
          const json = JSON.parse(data);
          const content: string = json?.choices?.[0].delta.content || '';
          responseContent += content;

          if (!stream.destroyed && content) {
            stream.push(content.replace(/\n/g, '<br/>'));
          }
        } catch (error) {
          error;
        }
      };

      const decoder = new TextDecoder();
      try {
        const parser = createParser(onParse);
        for await (const chunk of chatResponse.data as any) {
          if (stream.destroyed) {
            // 流被中断了，直接忽略后面的内容
            break;
          }
          parser.feed(decoder.decode(chunk, { stream: true }));
        }
      } catch (error) {
        console.log('pipe error', error);
      }
      // close stream
      !stream.destroyed && stream.push(null);
      stream.destroy();

      resolve({
        responseContent
      });
    } catch (error) {
      reject(error);
    }
  });
