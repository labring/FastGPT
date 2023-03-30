import { getOpenAIApi } from '@/service/utils/chat';
import { httpsAgent } from '@/service/utils/tools';
import { ModelData } from '../models/modelData';
import { connectRedis } from '../redis';
import { VecModelDataIndex } from '@/constants/redis';
import { vectorToBuffer } from '@/utils/tools';

export async function generateVector(next = false): Promise<any> {
  if (global.generatingVector && !next) return;
  global.generatingVector = true;

  try {
    const redis = await connectRedis();

    // 找出一个需要生成的 dataItem
    const dataItem = await ModelData.findOne({
      status: { $ne: 0 }
    });

    if (!dataItem) {
      console.log('没有需要生成 【向量】 的数据');
      global.generatingVector = false;
      return;
    }

    // 获取 openapi Key
    const openAiKey = process.env.OPENAIKEY as string;

    // 获取 openai 请求实例
    const chatAPI = getOpenAIApi(openAiKey);

    const dataId = String(dataItem._id);

    // 生成词向量
    const response = await Promise.allSettled(
      dataItem.q.map((item, i) =>
        chatAPI
          .createEmbedding(
            {
              model: 'text-embedding-ada-002',
              input: item.text
            },
            {
              timeout: 120000,
              httpsAgent
            }
          )
          .then((res) => res?.data?.data?.[0]?.embedding || [])
          .then((vector) =>
            redis.sendCommand([
              'HMSET',
              `${VecModelDataIndex}:${item.id}`,
              'vector',
              vectorToBuffer(vector),
              'modelId',
              String(dataItem.modelId),
              'dataId',
              String(dataId)
            ])
          )
      )
    );

    if (response.filter((item) => item.status === 'fulfilled').length === 0) {
      throw new Error(JSON.stringify(response));
    }
    // 修改该数据状态
    await ModelData.findByIdAndUpdate(dataItem._id, {
      status: 0
    });

    console.log(`生成向量成功: ${dataItem._id}`);

    setTimeout(() => {
      generateVector(true);
    }, 3000);
  } catch (error: any) {
    console.log(error);
    console.log('error: 生成向量错误', error?.response?.data);

    if (error?.response?.statusText === 'Too Many Requests') {
      console.log('次数限制，1分钟后尝试');
      // 限制次数，1分钟后再试
      setTimeout(() => {
        generateVector(true);
      }, 60000);
    }
  }
}
