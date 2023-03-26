import { DataItem } from '@/service/mongo';
import { getOpenAIApi } from '@/service/utils/chat';
import { httpsAgent, getOpenApiKey } from '@/service/utils/tools';
import type { ChatCompletionRequestMessage } from 'openai';
import { DataItemSchema } from '@/types/mongoSchema';
import { ChatModelNameEnum } from '@/constants/model';
import { pushSplitDataBill } from '@/service/events/pushBill';

export async function generateAbstract(next = false): Promise<any> {
  if (global.generatingAbstract && !next) return;
  global.generatingAbstract = true;

  const systemPrompt: ChatCompletionRequestMessage = {
    role: 'system',
    content: `我会向你发送一段长文本，请从中总结出3~10个摘要，尽量详细，请按以下格式返回: "(1):"\n"(2):"\n"(3):"\n`
  };
  let dataItem: DataItemSchema | null = null;

  try {
    // 找出一个需要生成的 dataItem
    dataItem = await DataItem.findOne({
      status: { $ne: 0 },
      times: { $gt: 0 },
      type: 'abstract'
    });

    if (!dataItem) {
      console.log('没有需要生成 【摘要】 的数据');
      global.generatingAbstract = false;
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

    console.log('正在生成一组摘要, ID:', dataItem._id);

    const startTime = Date.now();

    // 获取 openai 请求实例
    const chatAPI = getOpenAIApi(userApiKey || systemKey);
    // 请求 chatgpt 获取摘要
    const abstractResponse = await Promise.allSettled(
      [0.5, 1].map((temperature) =>
        chatAPI.createChatCompletion(
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
      )
    );

    // 过滤出成功的响应
    const successAbstracts = abstractResponse.filter((item) => item.status === 'fulfilled');
    // 提取摘要内容
    const rawContents: string[] = successAbstracts.map(
      (item: any) => item?.value?.data.choices[0].message?.content || ''
    );
    // 从 content 中提取摘要内容
    const splitContents = rawContents.map((content) => splitText(content)).flat();

    // 生成词向量
    const vectorResponse = await Promise.allSettled(
      splitContents.map((item) =>
        chatAPI.createEmbedding({
          model: 'text-embedding-ada-002',
          input: item.abstract
        })
      )
    );
    // 筛选成功的向量请求
    const vectorSuccessResponse = vectorResponse
      .map((item: any, i) => {
        if (item.status !== 'fulfilled') return '';
        return {
          abstract: splitContents[i].abstract,
          abstractVector: item?.value?.data?.data?.[0]?.embedding
        };
      })
      .filter((item) => item);

    // 插入数据库，并修改状态
    await DataItem.findByIdAndUpdate(dataItem._id, {
      status: 0,
      $push: {
        rawResponse: {
          $each: rawContents
        },
        result: {
          $each: vectorSuccessResponse
        }
      }
    });

    // 计费
    !userApiKey &&
      splitContents.length > 0 &&
      pushSplitDataBill({
        userId: dataItem.userId,
        type: 'abstract',
        text:
          systemPrompt.content +
          dataItem.text +
          rawContents.join('') +
          rawContents.join('').substring(0, Math.floor(dataItem.text.length / 10)) // 向量价格是gpt35的1/10
      });
    console.log(
      '生成摘要成功，time:',
      `${(Date.now() - startTime) / 1000}s`,
      '摘要数量：',
      splitContents.length
    );
  } catch (error: any) {
    console.log('error: 生成摘要错误', dataItem?._id);
    console.log('response:', error);
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

  generateAbstract(true);
}

/**
 * 检查文本是否按格式返回
 */
function splitText(text: string) {
  const regex = /\(\d+\):(\s*)(.*)(\s*)/g;
  const matches = text.matchAll(regex); // 获取所有匹配到的结果

  const result = []; // 存储最终的结果
  for (const match of matches) {
    if (match[2]) {
      result.push({
        abstract: match[2] as string
      });
    }
  }

  return result;
}
