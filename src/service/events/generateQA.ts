import { SplitData } from '@/service/mongo';
import { getOpenAIApi } from '@/service/utils/chat';
import { httpsAgent } from '@/service/utils/tools';
import { getOpenApiKey } from '../utils/openai';
import type { ChatCompletionRequestMessage } from 'openai';
import { ChatModelNameEnum } from '@/constants/model';
import { pushSplitDataBill } from '@/service/events/pushBill';
import { generateVector } from './generateVector';
import { connectRedis } from '../redis';
import { VecModelDataPrefix } from '@/constants/redis';
import { customAlphabet } from 'nanoid';
import { ModelSplitDataSchema } from '@/types/mongoSchema';
const nanoid = customAlphabet('abcdefghijklmnopqrstuvwxyz1234567890', 12);

export async function generateQA(next = false): Promise<any> {
  if (global.generatingQA === true && !next) return;
  global.generatingQA = true;

  let dataId = null;

  try {
    const redis = await connectRedis();
    // 找出一个需要生成的 dataItem
    const data = await SplitData.aggregate([
      { $match: { textList: { $exists: true, $ne: [] } } },
      { $sample: { size: 1 } }
    ]);

    const dataItem: ModelSplitDataSchema = data[0];

    if (!dataItem) {
      console.log('没有需要生成 QA 的数据');
      global.generatingQA = false;
      return;
    }

    dataId = dataItem._id;

    // 获取 5 个源文本
    const textList: string[] = dataItem.textList.slice(-5);

    // 获取 openapi Key
    let userApiKey = '',
      systemKey = '';
    try {
      const key = await getOpenApiKey(dataItem.userId);
      userApiKey = key.userApiKey;
      systemKey = key.systemKey;
    } catch (error: any) {
      if (error?.code === 501) {
        // 余额不够了, 清空该记录
        await SplitData.findByIdAndUpdate(dataItem._id, {
          textList: [],
          errorText: error.message
        });
        throw new Error(error?.message);
      }

      throw new Error('获取 openai key 失败');
    }

    console.log(`正在生成一组QA, 包含 ${textList.length} 组文本。ID: ${dataItem._id}`);

    const startTime = Date.now();

    // 获取 openai 请求实例
    const chatAPI = getOpenAIApi(userApiKey || systemKey);
    const systemPrompt: ChatCompletionRequestMessage = {
      role: 'system',
      content: `${
        dataItem.prompt || '下面是一段长文本'
      },请从中提取出5至30个问题和答案,并按以下格式返回: Q1:\nA1:\nQ2:\nA2:\n`
    };

    // 请求 chatgpt 获取回答
    const response = await Promise.allSettled(
      textList.map((text) =>
        chatAPI
          .createChatCompletion(
            {
              model: ChatModelNameEnum.GPT35,
              temperature: 0.7,
              n: 1,
              frequency_penalty: 1, // 越大，重复内容越少
              presence_penalty: -1, // 越大，越容易出现新内容
              messages: [
                systemPrompt,
                {
                  role: 'user',
                  content: text
                }
              ]
            },
            {
              timeout: 180000,
              httpsAgent
            }
          )
          .then((res) => {
            const rawContent = res?.data.choices[0].message?.content || '';
            // 计费
            pushSplitDataBill({
              isPay: !userApiKey,
              userId: dataItem.userId,
              type: 'QA',
              text: systemPrompt.content + text + rawContent,
              tokenLen: res.data.usage?.total_tokens || 0
            });
            return {
              rawContent, // chatgpt 原本的回复
              result: splitText(res?.data.choices[0].message?.content || '') // 格式化后的QA对
            };
          })
      )
    );

    // 获取成功的回答
    const successResponse: {
      rawContent: string;
      result: {
        q: string;
        a: string;
      }[];
    }[] = response.filter((item) => item.status === 'fulfilled').map((item: any) => item.value);

    const resultList = successResponse.map((item) => item.result).flat();

    await Promise.allSettled([
      SplitData.findByIdAndUpdate(dataItem._id, {
        textList: dataItem.textList.slice(0, -5)
      }), // 删掉后5个数据
      ...resultList.map((item) => {
        // 插入 redis
        return redis.sendCommand([
          'HMSET',
          `${VecModelDataPrefix}:${nanoid()}`,
          'userId',
          String(dataItem.userId),
          'modelId',
          String(dataItem.modelId),
          'q',
          item.q,
          'text',
          item.a,
          'status',
          'waiting'
        ]);
      })
    ]);

    console.log(
      '生成QA成功，time:',
      `${(Date.now() - startTime) / 1000}s`,
      'QA数量：',
      resultList.length
    );

    generateQA(true);
    generateVector();
  } catch (error: any) {
    // log
    if (error?.response) {
      console.log('openai error: 生成QA错误');
      console.log(error.response?.status, error.response?.statusText, error.response?.data);
    } else {
      console.log('生成QA错误:', error);
    }

    if (dataId && error?.response?.data?.error?.type === 'insufficient_quota') {
      console.log('api 余额不足');

      await SplitData.findByIdAndUpdate(dataId, {
        textList: [],
        errorText: 'api 余额不足'
      });

      generateQA(true);
      return;
    }

    setTimeout(() => {
      generateQA(true);
    }, 4000);
  }
}

/**
 * 检查文本是否按格式返回
 */
function splitText(text: string) {
  const regex = /Q\d+:(\s*)(.*)(\s*)A\d+:(\s*)([\s\S]*?)(?=Q|$)/g; // 匹配Q和A的正则表达式
  const matches = text.matchAll(regex); // 获取所有匹配到的结果

  const result = []; // 存储最终的结果
  for (const match of matches) {
    const q = match[2];
    const a = match[5];
    if (q && a) {
      // 如果Q和A都存在，就将其添加到结果中
      result.push({
        q,
        a: a.trim().replace(/\n\s*/g, '\n')
      });
    }
  }

  return result;
}
