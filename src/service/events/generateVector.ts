import { getOpenAIApi } from '@/service/utils/chat';
import { httpsAgent } from '@/service/utils/tools';
import { connectRedis } from '../redis';
import { VecModelDataIdx } from '@/constants/redis';
import { vectorToBuffer } from '@/utils/tools';
import { ModelDataStatusEnum } from '@/constants/redis';

export async function generateVector(next = false): Promise<any> {
  if (global.generatingVector && !next) return;
  global.generatingVector = true;

  try {
    const redis = await connectRedis();

    // 从找出一个 status = waiting 的数据
    const searchRes = await redis.ft.search(
      VecModelDataIdx,
      `@status:{${ModelDataStatusEnum.waiting}}`,
      {
        RETURN: ['q'],
        LIMIT: {
          from: 0,
          size: 1
        }
      }
    );

    if (searchRes.total === 0) {
      console.log('没有需要生成 【向量】 的数据');
      global.generatingVector = false;
      return;
    }

    const dataItem: { id: string; q: string } = {
      id: searchRes.documents[0].id,
      q: String(searchRes.documents[0]?.value?.q || '')
    };

    // 获取 openapi Key
    const openAiKey = process.env.OPENAIKEY as string;

    // 获取 openai 请求实例
    const chatAPI = getOpenAIApi(openAiKey);

    // 生成词向量
    const vector = await chatAPI
      .createEmbedding(
        {
          model: 'text-embedding-ada-002',
          input: dataItem.q
        },
        {
          timeout: 120000,
          httpsAgent
        }
      )
      .then((res) => res?.data?.data?.[0]?.embedding || []);

    // 更新 redis 向量和状态数据
    await redis.sendCommand([
      'HMSET',
      dataItem.id,
      'vector',
      vectorToBuffer(vector),
      'status',
      ModelDataStatusEnum.ready
    ]);

    console.log(`生成向量成功: ${dataItem.id}`);

    setTimeout(() => {
      generateVector(true);
    }, 2000);
  } catch (error: any) {
    console.log('error: 生成向量错误', error?.response?.statusText);
    !error?.response && console.log(error);

    if (error?.response?.statusText === 'Too Many Requests') {
      console.log('生成向量次数限制，1分钟后尝试');
      // 限制次数，1分钟后再试
      setTimeout(() => {
        generateVector(true);
      }, 60000);
    }

    setTimeout(() => {
      generateVector(true);
    }, 3000);
  }
}
