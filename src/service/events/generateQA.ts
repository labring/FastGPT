import { SplitData } from '@/service/mongo';
import { getOpenAIApi } from '@/service/utils/auth';
import { httpsAgent } from '@/service/utils/tools';
import { getOpenApiKey } from '../utils/openai';
import type { ChatCompletionRequestMessage } from 'openai';
import { ChatModelNameEnum } from '@/constants/model';
import { pushSplitDataBill } from '@/service/events/pushBill';
import { generateVector } from './generateVector';
import { openaiError2 } from '../errorCode';
import { PgClient } from '@/service/pg';
import { ModelSplitDataSchema } from '@/types/mongoSchema';

export async function generateQA(next = false): Promise<any> {
  if (process.env.queueTask !== '1') {
    fetch(process.env.parentUrl || '');
    return;
  }
  if (global.generatingQA === true && !next) return;

  global.generatingQA = true;

  let dataId = null;

  try {
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
      content: `你是出题人
${dataItem.prompt || '下面是"一段长文本"'}
从中选出5至20个题目和答案,题目包含问答题,计算题,代码题等.答案要详细.按格式返回: Q1:
A1:
Q2:
A2:
...`
    };

    // 请求 chatgpt 获取回答
    const response = await Promise.allSettled(
      textList.map((text) =>
        chatAPI
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
              httpsAgent: httpsAgent(!userApiKey)
            }
          )
          .then((res) => {
            const rawContent = res?.data.choices[0].message?.content || ''; // chatgpt 原本的回复
            const result = splitText(res?.data.choices[0].message?.content || ''); // 格式化后的QA对
            console.log(`split result length: `, result.length);
            // 计费
            pushSplitDataBill({
              isPay: !userApiKey && result.length > 0,
              userId: dataItem.userId,
              type: 'QA',
              text: systemPrompt.content + text + rawContent,
              tokenLen: res.data.usage?.total_tokens || 0
            });
            return {
              rawContent,
              result
            };
          })
          .catch((err) => {
            console.log('QA拆分错误');
            console.log(err.response?.status, err.response?.statusText, err.response?.data);
            return Promise.reject(err);
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
      // 生成的内容插入 pg
      PgClient.insert('modelData', {
        values: resultList.map((item) => [
          { key: 'user_id', value: dataItem.userId },
          { key: 'model_id', value: dataItem.modelId },
          { key: 'q', value: item.q },
          { key: 'a', value: item.a },
          { key: 'status', value: 'waiting' }
        ])
      })
    ]);
    console.log('生成QA成功，time:', `${(Date.now() - startTime) / 1000}s`);

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

    // 没有余额或者凭证错误时，拒绝任务
    if (dataId && openaiError2[error?.response?.data?.error?.type]) {
      console.log(openaiError2[error?.response?.data?.error?.type], '删除QA任务');

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
