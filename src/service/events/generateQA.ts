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
const nanoid = customAlphabet('abcdefghijklmnopqrstuvwxyz1234567890', 12);

export async function generateQA(next = false): Promise<any> {
  if (global.generatingQA && !next) return;
  global.generatingQA = true;

  try {
    const redis = await connectRedis();
    // 找出一个需要生成的 dataItem
    const dataItem = await SplitData.findOne({
      textList: { $exists: true, $ne: [] }
    });

    if (!dataItem) {
      console.log('没有需要生成 QA 的数据');
      global.generatingQA = false;
      return;
    }

    // 源文本
    const text = dataItem.textList[dataItem.textList.length - 1];
    if (!text) {
      await SplitData.findByIdAndUpdate(dataItem._id, { $pop: { textList: 1 } }); // 弹出无效文本
      throw new Error('无文本');
    }

    // 获取 openapi Key
    let userApiKey, systemKey;
    try {
      const key = await getOpenApiKey(dataItem.userId, true);
      userApiKey = key.userApiKey;
      systemKey = key.systemKey;
    } catch (error: any) {
      if (error?.code === 501) {
        // 余额不够了, 清空该记录
        await SplitData.findByIdAndUpdate(dataItem._id, {
          textList: [],
          errorText: error.message
        });
        throw new Error('账号余额不足');
      }

      throw new Error('获取 openai key 失败');
    }

    console.log('正在生成一组QA, ID:', dataItem._id);

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
    const response = await chatAPI
      .createChatCompletion(
        {
          model: ChatModelNameEnum.GPT35,
          temperature: 0.8,
          n: 1,
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
      .then((res) => ({
        rawContent: res?.data.choices[0].message?.content || '', // chatgpt原本的回复
        result: splitText(res?.data.choices[0].message?.content || '') // 格式化后的QA对
      }));

    await Promise.allSettled([
      SplitData.findByIdAndUpdate(dataItem._id, { $pop: { textList: 1 } }), // 弹出已经拆分的文本
      ...response.result.map((item) => {
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
      response.result.length
    );

    // 计费
    pushSplitDataBill({
      isPay: !userApiKey && response.result.length > 0,
      userId: dataItem.userId,
      type: 'QA',
      text: systemPrompt.content + text + response.rawContent
    });

    generateQA(true);
    generateVector(true);
  } catch (error: any) {
    console.log(error);
    console.log('生成QA错误:', error?.response);

    setTimeout(() => {
      generateQA(true);
    }, 5000);
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
