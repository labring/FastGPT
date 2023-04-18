import { connectRedis } from '../redis';
import { openaiCreateEmbedding, getOpenApiKey } from '../utils/openai';
import { openaiError2 } from '../errorCode';
import { connectPg } from '@/service/pg';
import type { PgModelDataItemType } from '@/types/pg';

export async function generateVector(next = false): Promise<any> {
  if (process.env.queueTask !== '1') {
    fetch(process.env.parentUrl || '');
    return;
  }

  if (global.generatingVector && !next) return;

  global.generatingVector = true;
  let dataId = null;

  try {
    const pg = await connectPg();

    // 从找出一个 status = waiting 的数据
    const searchRes = await pg.query<PgModelDataItemType>(`SELECT id, q, user_id
                        FROM modelData
                        WHERE status='waiting'
                        LIMIT 1
                      `);

    if (searchRes.rowCount === 0) {
      console.log('没有需要生成 【向量】 的数据');
      global.generatingVector = false;
      return;
    }

    const dataItem: { id: string; q: string; userId: string } = {
      id: searchRes.rows[0].id,
      q: searchRes.rows[0].q,
      userId: searchRes.rows[0].user_id
    };

    dataId = dataItem.id;

    // 获取 openapi Key
    let userApiKey, systemKey;
    try {
      const res = await getOpenApiKey(dataItem.userId);
      userApiKey = res.userApiKey;
      systemKey = res.systemKey;
    } catch (error: any) {
      if (error?.code === 501) {
        await pg.query(`DELETE FROM modelData WHERE id = '${dataId}'`);
        generateVector(true);
        return;
      }

      throw new Error('获取 openai key 失败');
    }

    // 生成词向量
    const { vector } = await openaiCreateEmbedding({
      text: dataItem.q,
      userId: dataItem.userId,
      isPay: !userApiKey,
      apiKey: userApiKey || systemKey
    });

    // 更新 pg 向量和状态数据
    await pg.query(
      `UPDATE modelData SET vector = '[${vector}]', status = 'ready' WHERE id = ${dataId}`
    );

    console.log(`生成向量成功: ${dataItem.id}`);

    generateVector(true);
  } catch (error: any) {
    // log
    if (error?.response) {
      console.log('openai error: 生成向量错误');
      console.log(error.response?.status, error.response?.statusText, error.response?.data);
    } else {
      console.log('生成向量错误:', error);
    }

    // 没有余额或者凭证错误时，拒绝任务
    if (dataId && openaiError2[error?.response?.data?.error?.type]) {
      console.log('删除向量生成任务记录');
      const redis = await connectRedis();
      redis.del(dataId);
      generateVector(true);
      return;
    }
    if (error?.response?.statusText === 'Too Many Requests') {
      console.log('生成向量次数限制，1分钟后尝试');
      // 限制次数，1分钟后再试
      setTimeout(() => {
        generateVector(true);
      }, 60000);
      return;
    }
    setTimeout(() => {
      generateVector(true);
    }, 2000);
  }
}
