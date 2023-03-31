import { DataItem } from '@/service/mongo';
import { getOpenAIApi } from '@/service/utils/chat';
import { httpsAgent, getOpenApiKey } from '@/service/utils/tools';
import type { ChatCompletionRequestMessage } from 'openai';
import { DataItemSchema } from '@/types/mongoSchema';
import { ChatModelNameEnum } from '@/constants/model';
import { pushSplitDataBill } from '@/service/events/pushBill';

export async function generateAbstract(next = false): Promise<any> {
  if (process.env.NODE_ENV === 'development') return;

  if (global.generatingAbstract && !next) return;
  global.generatingAbstract = true;

  const systemPrompt: ChatCompletionRequestMessage = {
    role: 'system',
    content: `总结助手,我会向你发送一段长文本,请从文本中归纳总结5至15条信息,如果是英文,请增加一条中文的总结,并按以下格式输出: A1:\nA2:\nA3:\n`
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
    } catch (error: any) {
      if (error?.code === 501) {
        // 余额不够了, 把用户所有记录改成闲置
        await DataItem.updateMany({
          userId: dataItem.userId,
          status: 0
        });
      }

      throw new Error('获取 openai key 失败');
    }

    console.log('正在生成一组摘要, ID:', dataItem._id);

    const startTime = Date.now();

    // 获取 openai 请求实例
    const chatAPI = getOpenAIApi(userApiKey || systemKey);
    // 请求 chatgpt 获取摘要
    const abstractResponse = await chatAPI.createChatCompletion(
      {
        model: ChatModelNameEnum.GPT35,
        temperature: 0.8,
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
    );

    // 提取摘要内容
    const rawContent: string = abstractResponse?.data.choices[0].message?.content || '';
    // 从 content 中提取摘要内容
    const splitContents = splitText(rawContent);
    // console.log(rawContent);
    // 生成词向量
    // const vectorResponse = await Promise.allSettled(
    //   splitContents.map((item) =>
    //     chatAPI.createEmbedding(
    //       {
    //         model: 'text-embedding-ada-002',
    //         input: item.abstract
    //       },
    //       {
    //         timeout: 120000,
    //         httpsAgent
    //       }
    //     )
    //   )
    // );
    // 筛选成功的向量请求
    // const vectorSuccessResponse = vectorResponse
    //   .map((item: any, i) => {
    //     if (item.status !== 'fulfilled') {
    //       // 没有词向量的【摘要】不要
    //       console.log('获取词向量错误: ', item);
    //       return '';
    //     }
    //     return {
    //       abstract: splitContents[i].abstract,
    //       abstractVector: item?.value?.data?.data?.[0]?.embedding
    //     };
    //   })
    //   .filter((item) => item);

    // 插入数据库，并修改状态
    await DataItem.findByIdAndUpdate(dataItem._id, {
      status: 0,
      $push: {
        rawResponse: rawContent,
        result: {
          $each: splitContents
        }
      }
    });

    console.log(
      `生成摘要成功，time: ${(Date.now() - startTime) / 1000}s`,
      `摘要匹配数量: ${splitContents.length}`
    );
    // 计费
    pushSplitDataBill({
      isPay: !userApiKey && splitContents.length > 0,
      userId: dataItem.userId,
      type: 'abstract',
      text: systemPrompt.content + dataItem.text + rawContent
    });
  } catch (error: any) {
    console.log('error: 生成摘要错误', dataItem?._id);
    console.log('response:', error);
    if (dataItem?._id) {
      await DataItem.findByIdAndUpdate(dataItem._id, {
        status: dataItem.times > 1 ? 1 : 0, // 还有重试次数则可以继续进行
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
  const regex = /A\d+:(\s*)(.*?)\s*(?=A\d+:|$)/gs;
  const matches = text.matchAll(regex); // 获取所有匹配到的结果

  const result = []; // 存储最终的结果
  for (const match of matches) {
    if (match[2]) {
      result.push({
        abstract: match[2] as string
      });
    }
  }

  if (result.length === 0) {
    result.push({
      abstract: text
    });
  }

  return result;
}
