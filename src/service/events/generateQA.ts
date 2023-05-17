import { SplitData } from '@/service/mongo';
import { getApiKey } from '../utils/auth';
import { OpenAiChatEnum } from '@/constants/model';
import { pushSplitDataBill } from '@/service/events/pushBill';
import { generateVector } from './generateVector';
import { openaiError2 } from '../errorCode';
import { PgClient } from '@/service/pg';
import { SplitDataSchema } from '@/types/mongoSchema';
import { modelServiceToolMap } from '../utils/chat';
import { ChatRoleEnum } from '@/constants/chat';
import { getErrMessage } from '../utils/tools';

export async function generateQA(next = false): Promise<any> {
  if (process.env.queueTask !== '1') {
    try {
      fetch(process.env.parentUrl || '');
    } catch (error) {
      console.log('parentUrl fetch error', error);
    }
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

    const dataItem: SplitDataSchema = data[0];

    if (!dataItem) {
      console.log('没有需要生成 QA 的数据');
      global.generatingQA = false;
      return;
    }

    dataId = dataItem._id;

    // 获取 5 个源文本
    const textList: string[] = dataItem.textList.slice(-5);

    // 获取 openapi Key
    let userOpenAiKey = '',
      systemAuthKey = '';
    try {
      const key = await getApiKey({ model: OpenAiChatEnum.GPT35, userId: dataItem.userId });
      userOpenAiKey = key.userOpenAiKey;
      systemAuthKey = key.systemAuthKey;
    } catch (err: any) {
      // 余额不够了, 清空该记录
      await SplitData.findByIdAndUpdate(dataItem._id, {
        textList: [],
        errorText: getErrMessage(err, '获取 OpenAi Key 失败')
      });
      generateQA(true);
      return;
    }

    console.log(`正在生成一组QA, 包含 ${textList.length} 组文本。ID: ${dataItem._id}`);

    const startTime = Date.now();

    // 请求 chatgpt 获取回答
    const response = await Promise.allSettled(
      textList.map((text) =>
        modelServiceToolMap[OpenAiChatEnum.GPT35]
          .chatCompletion({
            apiKey: userOpenAiKey || systemAuthKey,
            temperature: 0.8,
            messages: [
              {
                obj: ChatRoleEnum.System,
                value: `你是出题人
${dataItem.prompt || '下面是"一段长文本"'}
从中选出5至20个题目和答案.答案详细.按格式返回: Q1:
A1:
Q2:
A2:
...`
              },
              {
                obj: 'Human',
                value: text
              }
            ],
            stream: false
          })
          .then(({ totalTokens, responseText, responseMessages }) => {
            const result = formatSplitText(responseText); // 格式化后的QA对
            console.log(`split result length: `, result.length);
            // 计费
            pushSplitDataBill({
              isPay: !userOpenAiKey && result.length > 0,
              userId: dataItem.userId,
              type: 'QA',
              textLen: responseMessages.map((item) => item.value).join('').length,
              totalTokens
            });
            return {
              rawContent: responseText,
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
      // 删掉后5个数据
      SplitData.findByIdAndUpdate(dataItem._id, {
        textList: dataItem.textList.slice(0, -5)
      }),
      // 生成的内容插入 pg
      PgClient.insert('modelData', {
        values: resultList.map((item) => [
          { key: 'user_id', value: dataItem.userId },
          { key: 'kb_id', value: dataItem.kbId },
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
    }, 1000);
  }
}

/**
 * 检查文本是否按格式返回
 */
function formatSplitText(text: string) {
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
