import { DataItem } from '@/service/mongo';
import { getOpenAIApi } from '@/service/utils/chat';
import { httpsAgent, getOpenApiKey } from '@/service/utils/tools';
import type { ChatCompletionRequestMessage } from 'openai';
import { DataItemSchema } from '@/types/mongoSchema';
import { ChatModelNameEnum } from '@/constants/model';
import { pushSplitDataBill } from '@/service/events/pushBill';

export async function generateQA(next = false): Promise<any> {
  if (process.env.NODE_ENV === 'development') return;

  if (global.generatingQA && !next) return;
  global.generatingQA = true;

  const systemPrompt: ChatCompletionRequestMessage = {
    role: 'system',
    content: `总结助手。我会向你发送一段长文本,请从中总结出5至15个问题和答案,答案请尽量详细,请按以下格式返回: Q1:\nA1:\nQ2:\nA2:\n`
  };
  let dataItem: DataItemSchema | null = null;

  try {
    // 找出一个需要生成的 dataItem
    dataItem = await DataItem.findOne({
      status: { $ne: 0 },
      times: { $gt: 0 },
      type: 'QA'
    });

    if (!dataItem) {
      console.log('没有需要生成 QA 的数据');
      global.generatingQA = false;
      return;
    }

    // 更新状态为生成中
    await DataItem.findByIdAndUpdate(dataItem._id, {
      status: 2
    });

    // 获取 openapi Key
    let userApiKey, systemKey;
    try {
      const key = await getOpenApiKey(dataItem.userId);
      userApiKey = key.userApiKey;
      systemKey = key.systemKey;
    } catch (error) {
      // 余额不够了, 把用户所有记录改成闲置
      await DataItem.updateMany({
        userId: dataItem.userId,
        status: 0
      });
      throw new Error('获取 openai key 失败');
    }

    console.log('正在生成一组QA, ID:', dataItem._id);

    const startTime = Date.now();

    // 获取 openai 请求实例
    const chatAPI = getOpenAIApi(userApiKey || systemKey);
    // 请求 chatgpt 获取回答
    const response = await Promise.allSettled(
      [0.2, 0.8].map(
        (temperature) =>
          chatAPI
            .createChatCompletion(
              {
                model: ChatModelNameEnum.GPT35,
                temperature: temperature,
                n: 1,
                messages: [
                  systemPrompt,
                  {
                    role: 'user',
                    content: dataItem?.text || ''
                  }
                ]
              },
              {
                timeout: 120000,
                httpsAgent
              }
            )
            .then((res) => ({
              rawContent: res?.data.choices[0].message?.content || '',
              result: splitText(res?.data.choices[0].message?.content || '')
            })) // 从 content 中提取 QA
      )
    );
    // 过滤出成功的响应
    const successResponse: {
      rawContent: string;
      result: { q: string; a: string }[];
    }[] = response.filter((item) => item.status === 'fulfilled').map((item: any) => item.value);

    const rawContents = successResponse.map((item) => item.rawContent);
    const results = successResponse.map((item) => item.result).flat();

    // 插入数据库，并修改状态
    await DataItem.findByIdAndUpdate(dataItem._id, {
      status: 0,
      $push: {
        rawResponse: {
          $each: successResponse.map((item) => item.rawContent)
        },
        result: {
          $each: results
        }
      }
    });
    console.log(
      '生成QA成功，time:',
      `${(Date.now() - startTime) / 1000}s`,
      'QA数量：',
      results.length
    );

    // 计费
    pushSplitDataBill({
      isPay: !userApiKey && results.length > 0,
      userId: dataItem.userId,
      type: 'QA',
      text: systemPrompt.content + dataItem.text + rawContents.join('')
    });
  } catch (error: any) {
    console.log('error: 生成QA错误', dataItem?._id);
    console.log('response:', error?.response);
    if (dataItem?._id) {
      await DataItem.findByIdAndUpdate(dataItem._id, {
        status: dataItem.times > 0 ? 1 : 0, // 还有重试次数则可以继续进行
        $inc: {
          // 剩余尝试次数-1
          times: -1
        }
      });
    }
  }

  generateQA(true);
}

/**
 * 检查文本是否按格式返回
 */
function splitText(text: string) {
  const regex = /Q\d+:(\s*)(.*)(\s*)A\d+:(\s*)(.*)(\s*)/g; // 匹配Q和A的正则表达式
  const matches = text.matchAll(regex); // 获取所有匹配到的结果

  const result = []; // 存储最终的结果
  for (const match of matches) {
    const q = match[2];
    const a = match[5];
    if (q && a) {
      result.push({ q, a }); // 如果Q和A都存在，就将其添加到结果中
    }
  }

  return result;
}
